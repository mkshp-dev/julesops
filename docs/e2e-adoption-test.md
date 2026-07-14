# JulesOps E2E Adoption Test Report

**Date**: 2026-07-15
**Kit version**: v0.3.1
**Test repository**: `mkshp-dev/obsidian-sql-plugin`
**Default branch**: `Dev`
**Conducted by**: mkshp-dev (manual)
**Related issue**: #69

---

## Summary

The full end-to-end Jules dispatch loop was tested in `mkshp-dev/obsidian-sql-plugin`, an external repository with a non-`main` default branch (`Dev`). All scenarios passed.

**Result: ✅ PASS — Happy path and all non-happy-path scenarios passed.**

---

## Test Matrix Results

| Scenario | Expected outcome | Result |
|---|---|---|
| Create Jules task issue with `jules-queue` + `status:todo` labels | Dispatch selects it | ✅ Pass |
| Jules opens PR with `Closes #N` | Issue moves to `status:review` | ✅ Pass |
| Merge PR | Issue → `status:done`, closes if configured | ✅ Pass |
| Jules posts `## Blocked` comment | Issue → `status:blocked` | ✅ Pass |
| Maintainer posts `/jules retry` | Requeues and re-dispatches | ✅ Pass |
| Missing `JULES_API_KEY` | Issue → `status:failed` with clear error | ✅ Pass |
| PR targets wrong base branch | Issue blocked + PR comment | ✅ Pass |

---

## Repository Setup at Test Time

| Item | Value |
|---|---|
| JulesOps version | v0.3.1 |
| Install method | `install-julesops.ps1 -BaseBranch Dev` |
| Base branch | `Dev` |
| Queue label | `jules-queue` |
| Labels bootstrapped | ✅ 7 labels (integrated bootstrap during install) |
| Validation | ✅ All checks passed (`validate-kit.ps1 -TargetRepo`) |

---

## Happy Path Flow

1. Created a Jules Task issue via the issue template. Labels `jules-queue` and `status:todo` applied automatically by the template.
2. Triggered `Jules Dispatch` manually via `workflow_dispatch`.
3. Dispatch selected the queued issue, built the prompt from `jules-core.md` + `jules-repo.md`, and invoked Jules via `google-labs-code/jules-invoke@v1.0.0`.
4. Issue transitioned to `status:in-progress` with a dispatch confirmation comment.
5. Jules opened a PR targeting `Dev` with `Closes #N` in the PR body.
6. `Jules State Sync` detected the PR and transitioned the issue to `status:review`.
7. PR merged into `Dev`.
8. `Jules State Sync` detected the merge and transitioned the issue to `status:done`, then closed the issue.

Total round-trip time (dispatch trigger → issue closed): within expected GitHub Actions execution window.

---

## Non-Happy-Path Scenarios

### Missing JULES_API_KEY
- Temporarily removed the secret.
- Dispatch ran the API key preflight step and exited with `::error::` pointing to the GitHub secrets settings page and the Jules API key URL.
- Issue was marked `status:failed` by the failure handler step.
- **Result: ✅ Pass** — Error message was clear and actionable.

### PR targets wrong base branch
- Jules opened a PR targeting a non-configured branch.
- `Jules State Sync` PR validation detected the wrong base branch and posted a comment on the PR.
- Issue transitioned to `status:blocked`.
- **Result: ✅ Pass**

### Blocked comment protocol
- Issue body was intentionally underspecified to trigger the blocked protocol.
- Jules posted a `## Blocked` comment containing `What I tried`, `Where it failed`, and `What I need from the maintainer` sections.
- `Jules State Sync` detected the blocked comment marker and transitioned the issue to `status:blocked`.
- **Result: ✅ Pass**

### /jules retry requeue
- Maintainer posted `/jules retry` comment on the blocked issue.
- `Jules State Sync` detected the retry command, removed `status:blocked`, applied `status:todo`, and re-dispatched.
- **Result: ✅ Pass**

---

## Observations

- **Non-`main` branch handling**: The `Dev` base branch was handled identically to `main`. Config resolver output confirmed `base_branch: Dev` resolved correctly.
- **Integrated label bootstrap**: All 7 labels were present from the initial install run — no separate step needed.
- **Issue template label auto-apply**: `jules-queue` and `status:todo` were applied automatically when creating the issue via the template, with no manual labeling required.
- **Dispatch run output**: The dispatch job logs are clear. Each step has a descriptive name making it easy to trace the flow in the Actions tab.
- **No friction observed**: The full cycle required no manual intervention outside the intended test steps.

---

## Follow-up Bugs

None filed. All scenarios passed as expected.

---

## Related Documents

- [Beta report](beta-report.md)
- [Install guide](install.md)
- [State machine](state-machine.md)
