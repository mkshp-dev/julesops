import os
import yaml

CONFIG_PATH = ".github/julesops.yml"

def main():
    if not os.path.exists(CONFIG_PATH):
        print(f"Missing config file at: {CONFIG_PATH}")
        exit(1)

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    cfg = raw.get("julesops", {})
    repo = cfg.get("repository", {})
    queue = cfg.get("queue", {})
    states = cfg.get("states", {})
    instructions = cfg.get("instructions", {})
    pr_policy = cfg.get("pull_request", {})
    issue_completion = cfg.get("issue_completion", {})
    blocked_comment = cfg.get("blocked_comment", {})
    watchdog = cfg.get("watchdog", {})

    values = {
        "enabled": str(cfg.get("enabled", True)).lower(),
        "base_branch": repo.get("base_branch", "main"),
        "queue_label": queue.get("queue_label", "jules-queue"),
        "status_todo": states.get("todo", "status:todo"),
        "status_in_progress": states.get("in_progress", "status:in-progress"),
        "status_review": states.get("review", "status:review"),
        "status_blocked": states.get("blocked", "status:blocked"),
        "status_failed": states.get("failed", "status:failed"),
        "status_done": states.get("done", "status:done"),
        "core_instructions": instructions.get("core", ".github/jules-core.md"),
        "repo_instructions": instructions.get("repo", ".github/jules-repo.md"),
        "target_base_branch_only": str(pr_policy.get("target_base_branch_only", False)).lower(),
        "require_issue_link": str(pr_policy.get("require_issue_link", False)).lower(),
        "close_on_merge": str(issue_completion.get("close_on_merge", True)).lower(),
        "blocked_marker": blocked_comment.get("marker", "## Blocked"),
        "stale_in_progress_hours": str(watchdog.get("stale_in_progress_hours", 24)),
        "stale_review_hours": str(watchdog.get("stale_review_hours", 72)),
    }

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as out:
            for k, v in values.items():
                out.write(f"{k}={v}\n")
    else:
        # local execution fallback for testing/printing
        for k, v in values.items():
            print(f"{k}={v}")

if __name__ == "__main__":
    main()
