# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are used by the scripts that source this file
# Shared helpers for the JulesOps kit scripts. Source this file; do not execute it.
#
# Compatible with bash 3.2+ (the macOS system bash), so no associative arrays
# or ${var,,} expansions.

JULESOPS_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JULESOPS_KIT_ROOT="$(cd "$JULESOPS_SCRIPTS_DIR/.." && pwd)"
JULESOPS_KIT_VERSION="$(tr -d '[:space:]' < "$JULESOPS_SCRIPTS_DIR/kit-version.txt")"

# Source template → installed path for every kit-managed file.
JULESOPS_MANAGED_FILES=(
  "templates/jules-core.md:.github/jules-core.md"
  "templates/jules-task.yml:.github/ISSUE_TEMPLATE/jules-task.yml"
  "templates/julesops.yml:.github/julesops.yml"
  "templates/resolve-config.py:.github/resolve-config.py"
  "templates/comment-command.js:.github/jules-comment-command.js"
  "workflows/jules-dispatch.yml:.github/workflows/jules-dispatch.yml"
  "workflows/jules-state-sync.yml:.github/workflows/jules-state-sync.yml"
  "workflows/jules-watchdog.yml:.github/workflows/jules-watchdog.yml"
)

# Installed files that hold user-customized content.
JULESOPS_CONFIG_FILE=".github/julesops.yml"
JULESOPS_REPO_INSTRUCTIONS=".github/jules-repo.md"

die() {
  echo "Error: $*" >&2
  exit 1
}

# Print the installed path for a "source:target" entry.
managed_target() { printf '%s\n' "${1#*:}"; }
managed_source() { printf '%s\n' "${1%%:*}"; }

# Resolve a path to an absolute path without requiring it to exist.
abs_path() {
  local path="$1"
  if [ -d "$path" ]; then
    (cd "$path" && pwd)
  else
    local dir
    dir="$(cd "$(dirname "$path")" 2>/dev/null && pwd)" || die "Directory does not exist: $(dirname "$path")"
    printf '%s/%s\n' "$dir" "$(basename "$path")"
  fi
}

# Comment marker prepended to installed files, chosen by extension.
version_marker() {
  case "$1" in
    *.md) printf '<!-- JulesOps kit version: %s -->\n' "$JULESOPS_KIT_VERSION" ;;
    *.yml | *.yaml | *.py) printf '# JulesOps kit version: %s\n' "$JULESOPS_KIT_VERSION" ;;
    *.js) printf '// JulesOps kit version: %s\n' "$JULESOPS_KIT_VERSION" ;;
  esac
}

# Print the kit version recorded in an installed file, if any. Never fails.
installed_version() {
  [ -f "$1" ] || return 0
  { grep -oE 'JulesOps kit version: *[^ >-]+' "$1" || true; } | head -n1 | sed -E 's/.*: *//'
}

# Dump a config file to a temp file of `dotted.key=value` lines and print its path.
config_dump() {
  local config_path="$1" dump
  dump="$(mktemp)"
  python3 "$JULESOPS_SCRIPTS_DIR/lib/config_dump.py" "$config_path" > "$dump" || {
    rm -f "$dump"
    return 1
  }
  printf '%s\n' "$dump"
}

# Look up a dotted key in a dump produced by config_dump. Prints nothing if absent.
config_get() {
  local dump="$1" key="$2"
  awk -v k="$key" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$dump"
}

# Print "owner/repo" for a local clone's GitHub origin remote, or nothing.
github_repo_name() {
  local url
  url="$(git -C "$1" remote get-url origin 2>/dev/null)" || return 0
  printf '%s\n' "$url" | sed -nE 's#.*github\.com[:/]([^/]+/[^/]+)$#\1#p' | sed -E 's/\.git$//'
}

gh_authenticated() {
  command -v gh > /dev/null 2>&1 && gh auth status > /dev/null 2>&1
}

# Escape a string for use as a sed replacement with `|` as the delimiter.
sed_replacement_escape() {
  printf '%s' "$1" | sed -e 's/[|&\\]/\\&/g'
}
