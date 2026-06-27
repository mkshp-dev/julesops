import os

CONFIG_PATH = ".github/julesops.yml"


def parse_scalar(raw_value):
    if raw_value is None:
        return None

    value = raw_value.strip()
    if not value:
        return ""

    if value[0] in ('"', "'"):
        quote = value[0]
        escaped = False
        result = []
        for char in value[1:]:
            if escaped:
                result.append(char)
                escaped = False
                continue
            if char == "\\" and quote == '"':
                escaped = True
                continue
            if char == quote:
                return "".join(result)
            result.append(char)
        return "".join(result)

    comment_index = value.find(" #")
    if comment_index >= 0:
        value = value[:comment_index].rstrip()

    return value


def parse_simple_yaml(path):
    root = {}
    stack = [(-1, root)]

    with open(path, "r", encoding="utf-8") as config_file:
        for line_number, raw_line in enumerate(config_file, start=1):
            line = raw_line.rstrip("\n\r")
            stripped = line.strip()

            if not stripped or stripped.startswith("#"):
                continue

            if ":" not in stripped:
                raise ValueError(f"Unsupported YAML syntax at line {line_number}: {line}")

            indent = len(line) - len(line.lstrip(" "))
            key_part, value_part = stripped.split(":", 1)
            key = key_part.strip()
            value = value_part.strip()

            if not key:
                raise ValueError(f"Missing YAML key at line {line_number}: {line}")

            while stack and stack[-1][0] >= indent:
                stack.pop()

            if not stack:
                raise ValueError(f"Invalid indentation at line {line_number}: {line}")

            parent = stack[-1][1]
            if value == "":
                child = {}
                parent[key] = child
                stack.append((indent, child))
            else:
                parent[key] = parse_scalar(value)

    return root


def nested(config, path, default=None):
    current = config
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def as_bool_text(value, default):
    if value is None:
        return str(default).lower()
    return str(value).strip().lower()


def main():
    if not os.path.exists(CONFIG_PATH):
        print(f"Missing config file at: {CONFIG_PATH}")
        raise SystemExit(1)

    raw = parse_simple_yaml(CONFIG_PATH)
    cfg = raw.get("julesops", {})

    values = {
        "enabled": as_bool_text(nested(cfg, ["enabled"], True), True),
        "base_branch": nested(cfg, ["repository", "base_branch"], "main"),
        "queue_label": nested(cfg, ["queue", "queue_label"], "jules-queue"),
        "status_todo": nested(cfg, ["states", "todo"], "status:todo"),
        "status_in_progress": nested(cfg, ["states", "in_progress"], "status:in-progress"),
        "status_review": nested(cfg, ["states", "review"], "status:review"),
        "status_blocked": nested(cfg, ["states", "blocked"], "status:blocked"),
        "status_failed": nested(cfg, ["states", "failed"], "status:failed"),
        "status_done": nested(cfg, ["states", "done"], "status:done"),
        "core_instructions": nested(cfg, ["instructions", "core"], ".github/jules-core.md"),
        "repo_instructions": nested(cfg, ["instructions", "repo"], ".github/jules-repo.md"),
        "target_base_branch_only": as_bool_text(nested(cfg, ["pull_request", "target_base_branch_only"], False), False),
        "require_issue_link": as_bool_text(nested(cfg, ["pull_request", "require_issue_link"], False), False),
        "close_on_merge": as_bool_text(nested(cfg, ["issue_completion", "close_on_merge"], True), True),
        "blocked_marker": nested(cfg, ["blocked_comment", "marker"], "## Blocked"),
        "stale_in_progress_hours": str(nested(cfg, ["watchdog", "stale_in_progress_hours"], 24)),
        "stale_review_hours": str(nested(cfg, ["watchdog", "stale_review_hours"], 72)),
    }

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as output_file:
            for key, value in values.items():
                output_file.write(f"{key}={value}\n")
    else:
        for key, value in values.items():
            print(f"{key}={value}")


if __name__ == "__main__":
    main()