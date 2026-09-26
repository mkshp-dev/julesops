"""JulesOps watchdog: repair in-progress issues whose PR is already open, mark issues
failed when they have been in-progress too long (freeing the queue), and remind maintainers
about issues that have been in-progress or in review for a while.

Reads the JULESOPS_* variables exported by resolve-config.py. With JULESOPS_DRY_RUN=true,
changes are printed instead of sent to GitHub.
"""

import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone

MARKER = "## JulesOps Watchdog"
COOLDOWN_HOURS = 24
LINK_RE = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?) #([0-9]+)", re.IGNORECASE)

REPO = os.environ["GITHUB_REPOSITORY"]
DRY_RUN = os.environ.get("JULESOPS_DRY_RUN") == "true"
QUEUE_LABEL = os.environ["JULESOPS_QUEUE_LABEL"]
STATUS_IN_PROGRESS = os.environ["JULESOPS_STATUS_IN_PROGRESS"]
STATUS_REVIEW = os.environ["JULESOPS_STATUS_REVIEW"]
STATUS_FAILED = os.environ["JULESOPS_STATUS_FAILED"]
STATUS_LABELS = {os.environ[f"JULESOPS_STATUS_{name}"]
                 for name in ("TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "FAILED", "DONE")}


def gh_json(*args):
    return json.loads(subprocess.check_output(["gh", *args], text=True) or "[]")


def gh_lines(*args):
    """Run a paginated `gh api ... --jq '.[]'` call and parse one JSON value per line."""
    out = subprocess.check_output(["gh", *args], text=True)
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def gh_write(*args):
    if DRY_RUN:
        print("[dry-run] gh " + " ".join(args))
    else:
        subprocess.run(["gh", *args], check=True)


def set_status(issue_number, target):
    """Replace the issue's status label with TARGET in one call, keeping other labels."""
    current = [label["name"] for label in
               gh_lines("api", "--paginate", f"repos/{REPO}/issues/{issue_number}/labels", "--jq", ".[]")]
    labels = [name for name in current if name not in STATUS_LABELS] + [target]
    if DRY_RUN:
        print(f"[dry-run] set #{issue_number} status to '{target}'")
        return
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     dir=os.environ.get("RUNNER_TEMP")) as body:
        json.dump({"labels": labels}, body)
    try:
        subprocess.run(["gh", "api", "-X", "PUT", f"repos/{REPO}/issues/{issue_number}/labels",
                        "--input", body.name], check=True, stdout=subprocess.DEVNULL)
    finally:
        os.unlink(body.name)


def in_progress_since(issue):
    """When the in-progress label was last applied. updatedAt can't be used: every comment,
    including the watchdog's own reminders, moves it."""
    events = gh_lines("api", "--paginate", f"repos/{REPO}/issues/{issue['number']}/events", "--jq", ".[]")
    applied = [e["created_at"] for e in events
               if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == STATUS_IN_PROGRESS]
    return max(applied) if applied else issue["updatedAt"]


def jules_issues(status):
    return gh_json("issue", "list", "--repo", REPO, "--state", "open", "--limit", "1000",
                   "--label", QUEUE_LABEL, "--label", status, "--json", "number,updatedAt")


def hours_since(timestamp):
    then = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - then).total_seconds() / 3600.0


def recently_reminded(issue_number):
    comments = gh_lines("api", "--paginate", f"repos/{REPO}/issues/{issue_number}/comments", "--jq", ".[]")
    return any(MARKER in (c.get("body") or "") and hours_since(c["created_at"]) < COOLDOWN_HOURS
               for c in comments)


def move_to_review_when_pr_open(in_progress):
    """An in-progress issue whose linked PR is already open belongs in review."""
    numbers = {issue["number"] for issue in in_progress}
    if not numbers:
        return set()
    prs = gh_json("pr", "list", "--repo", REPO, "--state", "open", "--limit", "1000", "--json", "number,body")
    moved = set()
    for pr in prs:
        for match in LINK_RE.findall(pr.get("body") or ""):
            issue_number = int(match)
            if issue_number not in numbers or issue_number in moved:
                continue
            print(f"Issue #{issue_number} is in-progress but PR #{pr['number']} is open; moving to review.")
            set_status(issue_number, STATUS_REVIEW)
            gh_write("issue", "comment", str(issue_number), "--repo", REPO, "--body",
                     f"{MARKER}\n\nWatchdog detected that a linked pull request (#{pr['number']}) is already open, "
                     f"but this issue was in **in-progress**. Automatically transitioning status to `{STATUS_REVIEW}`.")
            moved.add(issue_number)
    return moved


def fail_stuck(in_progress, fail_hours):
    """Mark issues failed once they have been in-progress for FAIL_HOURS, so one stuck task
    (Jules crashed, or never opened a PR) cannot hold the queue forever. 0 disables this."""
    failed = set()
    if fail_hours <= 0:
        return failed
    for issue in in_progress:
        age = hours_since(in_progress_since(issue))
        if age < fail_hours:
            continue
        print(f"Issue #{issue['number']} has been in-progress for {age:.1f}h; marking it failed.")
        set_status(issue["number"], STATUS_FAILED)
        gh_write("issue", "comment", str(issue["number"]), "--repo", REPO, "--body",
                 f"{MARKER}\n\nThis issue has been **in-progress** for about **{age:.0f} hours** without a pull request "
                 f"or a blocked report from Jules, so JulesOps is marking it `{STATUS_FAILED}` to let the queue move on.\n\n"
                 f"If Jules is still working, a pull request that links this issue moves it to review as usual. "
                 f"Otherwise, comment `/jules retry` to dispatch it again.")
        failed.add(issue["number"])
    return failed


def remind_stale(issues, threshold_hours, state_name, advice):
    for issue in issues:
        age = hours_since(issue["updatedAt"])
        if age < threshold_hours or recently_reminded(issue["number"]):
            continue
        print(f"Issue #{issue['number']} has been in {state_name} for {age:.1f}h; reminding.")
        gh_write("issue", "comment", str(issue["number"]), "--repo", REPO, "--body",
                 f"{MARKER}\n\nThis issue has been in **{state_name}** for approximately **{age:.1f} hours** "
                 f"without recent GitHub activity. {advice}")


def main():
    in_progress = jules_issues(STATUS_IN_PROGRESS)
    moved = move_to_review_when_pr_open(in_progress)
    in_progress = [i for i in in_progress if i["number"] not in moved]
    failed = fail_stuck(in_progress, float(os.environ.get("JULESOPS_FAIL_IN_PROGRESS_HOURS", "72")))
    remind_stale([i for i in in_progress if i["number"] not in failed],
                 float(os.environ["JULESOPS_STALE_IN_PROGRESS_HOURS"]), "in-progress",
                 "Please review whether it needs follow-up.")
    remind_stale(jules_issues(STATUS_REVIEW),
                 float(os.environ["JULESOPS_STALE_REVIEW_HOURS"]), "review",
                 "Please review the linked PR and decide whether to merge or close it.")
    print("Watchdog check complete.")


if __name__ == "__main__":
    main()
