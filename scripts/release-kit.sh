#!/usr/bin/env bash
# Bump the kit version and cut a CHANGELOG section for a release.
#
# The new section is inserted below "## [Unreleased]" and takes over its entries.
# If Unreleased is empty, --summary (or a placeholder) is used instead.
#
# Usage: scripts/release-kit.sh [--summary TEXT] [--dry-run] VERSION DATE
#   e.g. scripts/release-kit.sh v0.5.0 2026-10-01
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

summary=""
dry_run=false
positional=()

while [ $# -gt 0 ]; do
  case "$1" in
    --summary) summary="${2:?--summary needs a value}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    -h | --help) echo "Usage: release-kit.sh [--summary TEXT] [--dry-run] VERSION DATE"; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *) positional+=("$1"); shift ;;
  esac
done

[ "${#positional[@]}" -eq 2 ] || die "Usage: release-kit.sh [--summary TEXT] [--dry-run] VERSION DATE"
version="${positional[0]}"
date="${positional[1]}"

printf '%s' "$version" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$' || die "Version must look like v1.2.3. Received: $version"
printf '%s' "$date" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || die "Date must look like YYYY-MM-DD. Received: $date"

version_file="$JULESOPS_SCRIPTS_DIR/kit-version.txt"
changelog="$JULESOPS_KIT_ROOT/CHANGELOG.md"
[ -f "$changelog" ] || die "Required file not found at: $changelog"

heading="## [${version#v}] - $date"
if grep -qF "## [${version#v}]" "$changelog"; then
  die "CHANGELOG.md already contains an entry for $version"
fi
grep -qxF "## [Unreleased]" "$changelog" || die "CHANGELOG.md has no '## [Unreleased]' section."

placeholder=$'### Added\n- Describe the release highlights here.'

# Move the Unreleased body under the new heading; fall back to the summary if it is empty.
updated="$(HEADING="$heading" FALLBACK="${summary:-$placeholder}" awk '
  BEGIN { heading = ENVIRON["HEADING"]; fallback = ENVIRON["FALLBACK"] }
  function flush() {
    body = unreleased
    sub(/^\n+/, "", body); sub(/\n+$/, "", body)
    if (body == "") body = fallback
    printf "## [Unreleased]\n\n%s\n\n%s\n\n", heading, body
  }
  state == 0 && $0 == "## [Unreleased]" { state = 1; next }
  state == 1 && /^## \[/ { flush(); state = 2 }
  state == 1 { unreleased = unreleased $0 "\n"; next }
  { print }
  END { if (state == 1) flush() }
' "$changelog")"

if $dry_run; then
  echo "[DryRun] Would update $version_file to $version"
  echo "[DryRun] Would add this section to $changelog:"
  printf '%s\n' "$updated" | awk -v heading="$heading" '$0 == heading { on = 1 } on && /^## \[/ && $0 != heading { exit } on { print }'
  exit 0
fi

printf '%s\n' "$version" > "$version_file"
printf '%s\n' "$updated" > "$changelog"
echo "Updated kit version to $version and added a CHANGELOG section for $date."
