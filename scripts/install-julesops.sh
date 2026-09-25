#!/usr/bin/env bash
# Install or upgrade the JulesOps workflow kit into a target repository.
#
# Usage: scripts/install-julesops.sh [options] TARGET_REPO
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'EOF'
Usage: install-julesops.sh [options] TARGET_REPO

Copies the JulesOps workflows, config, and issue template into TARGET_REPO/.github/.

Options:
  --base-branch NAME   Base branch Jules should target (default: main)
  --queue-label NAME   Label that marks issues for dispatch (default: jules-queue)
  --upgrade            Refresh kit-managed files; preserve .github/julesops.yml
  --force              Overwrite all kit-managed files, including .github/julesops.yml
  --dry-run            Show what would change without writing anything
  --skip-labels        Do not create GitHub labels
  -h, --help           Show this help
EOF
}

base_branch="main"
queue_label="jules-queue"
force=false
upgrade=false
dry_run=false
skip_labels=false
target_repo=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base-branch) base_branch="${2:?--base-branch needs a value}"; shift 2 ;;
    --queue-label) queue_label="${2:?--queue-label needs a value}"; shift 2 ;;
    --upgrade) upgrade=true; shift ;;
    --force) force=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --skip-labels) skip_labels=true; shift ;;
    -h | --help) usage; exit 0 ;;
    -*) usage >&2; die "Unknown option: $1" ;;
    *)
      [ -z "$target_repo" ] || die "Only one TARGET_REPO may be given."
      target_repo="$1"; shift ;;
  esac
done

[ -n "$target_repo" ] || { usage >&2; exit 1; }
[ -d "$target_repo" ] || die "Target repository does not exist: $target_repo"
target_root="$(abs_path "$target_repo")"

log() {
  if $dry_run; then echo "[DryRun] $*"; else echo "$*"; fi
}

# --- Detect a prior install and handle duplicate-install UX ---
if ! $force && ! $upgrade && ! $dry_run; then
  installed=""
  for entry in "${JULESOPS_MANAGED_FILES[@]}"; do
    installed="$(installed_version "$target_root/$(managed_target "$entry")")"
    if [ -n "$installed" ]; then break; fi
  done

  if [ -n "$installed" ]; then
    cat <<EOF

========================================================================
  Prior JulesOps install detected (version: $installed)
========================================================================

  Target: $target_root

  Options:
    --upgrade   Refresh managed files, preserve julesops.yml + jules-repo.md
    --force     Overwrite all managed files including julesops.yml

EOF
    if [ -t 0 ]; then
      printf '  Upgrade existing install? [Y/n]: '
      read -r answer || answer=""
      case "$answer" in
        "" | [Yy]*) echo "  Running upgrade..."; echo; upgrade=true ;;
        *) echo "  Aborted. Re-run with --upgrade or --force when ready."; exit 0 ;;
      esac
    else
      echo "  Non-interactive shell detected. Re-run with --upgrade or --force."
      echo "========================================================================"
      exit 1
    fi
  fi
fi

if $dry_run; then
  echo "[DryRun] --- JulesOps Installation/Upgrade Preview ---"
  echo "[DryRun] Target Repository: $target_root"
  echo "[DryRun] Installing version: $JULESOPS_KIT_VERSION"
fi

# --- Copy kit-managed files ---
wrote_config=false
for entry in "${JULESOPS_MANAGED_FILES[@]}"; do
  source_path="$JULESOPS_KIT_ROOT/$(managed_source "$entry")"
  relative_target="$(managed_target "$entry")"
  target_path="$target_root/$relative_target"

  [ -f "$source_path" ] || die "Missing kit file: $source_path"

  if [ -e "$target_path" ]; then
    if [ "$relative_target" = "$JULESOPS_CONFIG_FILE" ] && $upgrade && ! $force; then
      log "[Upgrade] Preserved (skipped overwrite): $target_path"
      continue
    fi
    if ! $force && ! $upgrade; then
      die "Target file already exists: $target_path. Re-run with --force or --upgrade to overwrite/refresh JulesOps-managed files."
    fi
    log "Overwriting: $target_path (with version: $JULESOPS_KIT_VERSION)"
  else
    log "Copying: $relative_target (with version: $JULESOPS_KIT_VERSION)"
  fi

  if ! $dry_run; then
    mkdir -p "$(dirname "$target_path")"
    # shellcheck disable=SC2094  # version_marker only inspects the file name
    { version_marker "$target_path"; cat "$source_path"; } > "$target_path"
  fi
  if [ "$relative_target" = "$JULESOPS_CONFIG_FILE" ]; then wrote_config=true; fi
done

# --- Remove files earlier kit versions installed but the workflows no longer use ---
for legacy in "${JULESOPS_LEGACY_FILES[@]}"; do
  legacy_path="$target_root/$legacy"
  if [ -n "$(installed_version "$legacy_path")" ]; then
    log "Removing no-longer-used kit file: $legacy"
    if ! $dry_run; then rm -f "$legacy_path"; fi
  fi
done

# --- Customize a freshly written config ---
if $wrote_config; then
  if $dry_run; then
    echo "[DryRun] Would customize $JULESOPS_CONFIG_FILE:"
    echo "  - Set base_branch to: $base_branch"
    echo "  - Set queue_label to: $queue_label"
  else
    config_path="$target_root/$JULESOPS_CONFIG_FILE"
    tmp="$(mktemp)"
    sed -e "s|base_branch: main|base_branch: $(sed_replacement_escape "$base_branch")|" \
        -e "s|queue_label: jules-queue|queue_label: $(sed_replacement_escape "$queue_label")|" \
        "$config_path" > "$tmp"
    mv "$tmp" "$config_path"
  fi
fi

# --- Repository-specific instructions stub ---
repo_instructions_path="$target_root/$JULESOPS_REPO_INSTRUCTIONS"
if [ -e "$repo_instructions_path" ]; then
  log "Preserved existing instructions: $repo_instructions_path"
elif $dry_run; then
  echo "[DryRun] Would create repository-specific instructions stub: $repo_instructions_path"
else
  # shellcheck disable=SC2094  # version_marker only inspects the file name
  {
    version_marker "$repo_instructions_path"
    cat <<'EOF'
# Repository-specific Jules instructions

Describe the repository-specific rules Jules should follow here.

Include:
- verification commands
- branch or release policies
- schema, migration, or deployment rules
- sensitive areas Jules should avoid unless the issue explicitly asks for changes
EOF
  } > "$repo_instructions_path"
fi

if $dry_run; then
  echo "[DryRun] --- End of Preview (No files were modified) ---"
elif $upgrade; then
  echo "Upgraded JulesOps in $target_root successfully to version $JULESOPS_KIT_VERSION."
else
  echo "Installed JulesOps into $target_root (version $JULESOPS_KIT_VERSION)"
fi

# --- Label bootstrap ---
if $skip_labels; then
  log "Skipping label bootstrap (--skip-labels). Run scripts/bootstrap-labels.sh when ready."
elif $dry_run; then
  echo "[DryRun] Would bootstrap GitHub labels via bootstrap-labels.sh."
else
  echo
  echo "--- Bootstrapping GitHub labels ---"
  "$JULESOPS_SCRIPTS_DIR/bootstrap-labels.sh" "$target_root"
fi

# --- JULES_API_KEY reminder ---
repo_name="$(github_repo_name "$target_root")"
cat <<EOF

========================================================================
  ACTION REQUIRED: Add your Jules API key as a GitHub repository secret
========================================================================

  Secret name:  JULES_API_KEY
  Set it at:    https://github.com/${repo_name:-OWNER/REPO}/settings/secrets/actions
  Get your key: https://jules.google.com/settings/api

  Without this secret, Jules Dispatch will fail with a 401 error.
========================================================================
EOF
