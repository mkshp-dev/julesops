"""JulesOps watchdog: repair in-progress issues whose PR is already open, and remind
maintainers about issues that have been in-progress or in review for too long.

Reads the JULESOPS_* variables exported by resolve-config.py. With JULESOPS_DRY_RUN=true,
changes are printed instead of sent to GitHub.
"""

import json
import os
import re
import subprocess
from datetime import datetime, timezone

MARKER = "## JulesOps Watchdog"
COOLDOWN_HOURS = 24
LINK_RE = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?) #([0-9]+)", re.IGNORECASE)

REPO = os.environ["GITHUB_REPOSITORY"]
DRY_RUN = os.environ.get("JULESOPS_DRY_RUN") == "true"
QUEUE_LABEL = os.environ["JULESOPS_QUEUE_LABEL"]
STATUS_IN_PROGRESS = os.environ["JULESOPS_STATUS_IN_PROGRESS"]
STATUS_REVIEW = os.environ["JULESOPS_STATUS_REVIEW"]


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
            gh_write("issue", "edit", str(issue_number), "--repo", REPO,
                     "--remove-label", STATUS_IN_PROGRESS, "--add-label", STATUS_REVIEW)
            gh_write("issue", "comment", str(issue_number), "--repo", REPO, "--body",
                     f"{MARKER}\n\nWatchdog detected that a linked pull request (#{pr['number']}) is already open, "
                     f"but this issue was in **in-progress**. Automatically transitioning status to `{STATUS_REVIEW}`.")
            moved.add(issue_number)
    return moved


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
    remind_stale([i for i in in_progress if i["number"] not in moved],
                 float(os.environ["JULESOPS_STALE_IN_PROGRESS_HOURS"]), "in-progress",
                 "Please review whether it needs follow-up.")
    remind_stale(jules_issues(STATUS_REVIEW),
                 float(os.environ["JULESOPS_STALE_REVIEW_HOURS"]), "review",
                 "Please review the linked PR and decide whether to merge or close it.")
    print("Watchdog check complete.")


if __name__ == "__main__":
    main()
