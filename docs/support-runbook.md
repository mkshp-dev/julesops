# JulesOps Support & Incident Response Runbook

**Scope**: Free workflow kit (v0.3.x and later). The hosted control plane is not yet in production; this runbook will be expanded when it launches.

---

## 1. Support channels

| Channel | Purpose | Response expectation |
|---|---|---|
| GitHub Issues (`mkshp-dev/julesops`) | Bug reports, feature requests, install/config questions | Best-effort; aim for acknowledgement within 2 business days |
| `SECURITY.md` contact | Security vulnerability disclosures | Acknowledgement within 2 business days; fix timeline based on severity |

There is no paid support tier, SLA, or dedicated support email for the free kit.

---

## 2. Issue triage

When a new GitHub issue is opened:

1. **Reproduce or confirm** the report against the latest kit version (`scripts/kit-version.txt`).
2. **Label the issue** with one of: `bug`, `enhancement`, `question`, `documentation`, `wontfix`.
3. **Check if it is a known issue** — search existing open issues and the CHANGELOG.
4. **Respond** with confirmation, a workaround if one exists, or a request for more information (repo structure, kit version, PowerShell version, error output).
5. **Assign a milestone** if the fix is targeted for a specific release.

### Common triage scenarios

| Symptom | Likely cause | First response |
|---|---|---|
| `Target file already exists` on install | Prior install exists | Point to `-Upgrade` or `-Force` flags in `docs/install.md` |
| Labels not created after install | `gh` CLI not authenticated or no GitHub remote | Point to `bootstrap-labels.ps1` docs; confirm `gh auth status` |
| `JULES_API_KEY` secret not found in workflow logs | Secret not configured in repository settings | Point to GitHub docs on repository secrets |
| Dispatch workflow exits without selecting work | `enabled: false` in config, or no `jules-queue` label on issue, or issue not using the JulesOps template | Check `julesops.yml`, label, and issue template |
| Stale `status:in-progress` never moved by watchdog | Watchdog schedule may not have triggered; `stale_in_progress_hours` threshold not reached | Check workflow run history; confirm watchdog cron |
| Config resolver error | Python version < 3.8, or `julesops.yml` YAML syntax error | Run `python .github/resolve-config.py` locally; inspect config |

---

## 3. Incident response (free kit)

Because the free kit runs entirely inside the adopter's GitHub Actions environment, JulesOps operators are not in the incident path for runtime failures. An "incident" for the free kit means a defect in the shipped kit that causes adopter harm.

### Severity definitions

| Severity | Definition | Example |
|---|---|---|
| **Critical** | Kit causes data loss, unintended destructive changes, or a security vulnerability | Workflow deletes branches; secret leaked in logs |
| **High** | Kit is broken in a common scenario with no workaround | Installer fails on all fresh installs |
| **Medium** | Kit is broken in a specific scenario; workaround exists | Upgrade path fails for repos with custom `queue_label` |
| **Low** | Cosmetic, documentation, or minor behavioral issue | Incorrect label color in checklist output |

### Response steps by severity

#### Critical

1. Open a tracking issue immediately and label `bug` + `security` (if applicable).
2. If a security issue: follow `SECURITY.md` responsible disclosure process. Do **not** disclose publicly until a fix is available.
3. Draft a patch within 24 hours.
4. Tag a patch release (`scripts/release-kit.ps1`) and update `CHANGELOG.md`.
5. Post a notice on the tracking issue describing the impact and how to upgrade.

#### High

1. Open a tracking issue and label `bug`.
2. Target a patch release within 72 hours.
3. Provide a documented workaround in the issue if one exists.

#### Medium / Low

1. Open or update a tracking issue.
2. Address in the next planned minor release.

---

## 4. Release process for patch releases

1. Apply the fix to `main`.
2. Run the full release checklist: `docs/release-checklist.md`.
3. Bump kit version: `scripts/release-kit.ps1 -Version vX.Y.Z -Date YYYY-MM-DD`.
4. Tag the release on GitHub.
5. Update `CHANGELOG.md` with a summary of what changed and why.

---

## 5. Dependency on Google Jules

JulesOps dispatches work to Jules but does not control Jules availability. If Jules is down or rate-limited:

- Dispatch workflow will fail at the Jules invocation step.
- Issues will land on `status:failed` with an error comment.
- Adopters can use `/jules retry` once Jules is available again.

JulesOps cannot remediate Jules outages. Direct adopters to [Google's status page](https://status.google.com) or the Jules support channel.

---

## 6. What is out of scope for free kit support

The following are **not** supported for the free kit:

- Custom workflow modifications made by the adopter
- Repository-specific Jules behavior or output quality
- GitHub Actions runner capacity or availability
- Third-party integrations not part of the kit
- Repositories running kit versions below the current stable release

---

## 7. Future: hosted service incidents

When the hosted control plane launches this runbook will be expanded to cover:

- Uptime SLAs and monitoring (see `docs/ops-monitoring.md` for the current draft)
- Webhook processing failures and replay
- Database and billing incidents
- On-call rotation and escalation paths
