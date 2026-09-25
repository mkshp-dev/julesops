# Release checklist

This checklist is for the free JulesOps workflow kit public beta. The remaining Marketplace and control-plane work is tracked in GitHub issues instead of roadmap prose.

## Free Core Public Beta

Run these checks before tagging a workflow-kit release.

### 1. Validate Source Kit

```bash
scripts/validate-kit.sh
```

Expected result: `JulesOps kit validation passed.`

### 2. Run the Automated Suites

```bash
scripts/test-fixture.sh
scripts/test-workflow-logic.sh
scripts/test-action.sh
node scripts/__tests__/comment-command.test.js
```

`test-fixture.sh` covers a dry-run install, a fresh install plus validation, resolver portability,
the label bootstrap fallback, upgrade (config preserved), force (config overwritten), and a missing
base branch. The steps below repeat the key checks by hand if you want to inspect the output.

### 3. Smoke Test Fresh Install

```bash
target="$(mktemp -d)"
git -C "$target" init -b master
echo "# JulesOps release fixture" > "$target/README.md"
git -C "$target" add README.md
git -C "$target" -c user.email=test@example.com -c user.name=Test commit -m init
scripts/install-julesops.sh --base-branch master "$target"
scripts/validate-kit.sh "$target"
```

The fresh-install output should include "GitHub remote was not detected. Create these labels
manually." and list all 7 labels.

### 4. Verify Resolver Portability

```bash
(cd "$target" && python3 "$OLDPWD/templates/resolve-config.py")
```

The resolver must not require PyYAML or network-installed packages.

### 5. Smoke Test Upgrade

```bash
scripts/install-julesops.sh --base-branch master --upgrade "$target"
scripts/validate-kit.sh "$target"
scripts/bootstrap-labels.sh --dry-run "$target"
```

Confirm `.github/jules-repo.md` is preserved and `.github/julesops.yml` is not overwritten during normal
upgrade. The label dry run should print the configured labels without requiring GitHub authentication.

### 6. Permission Audit

Compare workflow `permissions:` blocks against `SECURITY.md`.

### 7. Documentation Audit

```bash
rg "blocked_comment_marker|stale_threshold_hours|check_interval_hours|^base_branch:" docs
```

Any matches should be historical context only, not current config examples.

### 8. Version Audit

```bash
scripts/release-kit.sh --dry-run v0.5.0 2026-10-01   # preview
scripts/release-kit.sh v0.5.0 2026-10-01
```

- Updates `scripts/kit-version.txt` and moves the `## [Unreleased]` entries under the new version heading in `CHANGELOG.md`.
- Review the generated `CHANGELOG.md` entry before tagging.
- Verify `git tag --list` contains the intended tag after release.

### 9. Documentation Audit

Before tagging, verify:

- `docs/e2e-adoption-test.md` reflects the current kit version and a recent test run.
- `docs/beta-report.md` §3.2 label table is current (all repos show ✅).
- `docs/marketplace-listing.md` checklist has no unchecked items relevant to the current release.
- `docs/troubleshooting.md` matches the current workflow behavior.

```bash
# Quick check: look for stale version references in docs
rg "v0\.3\.0|v0\.3\.1" docs --include="*.md"
```

Any matches should be intentional historical references, not stale version examples.
