# Security Policy

Security is a core priority for JulesOps. This document outlines how secrets, workflow permissions, and vulnerabilities are managed within this project.

## Supported Versions

Only the latest public beta release of JulesOps is supported for security updates:

| Version | Supported |
| --- | --- |
| v0.3.x | Yes |
| < v0.3 | No |

---

## Secrets Management

- **`JULES_API_KEY`**: The API key used to communicate with Jules must never be hardcoded or checked into repository configuration files (`julesops.yml`) or template instructions. It should always be set as a GitHub repository secret.
- **GitHub Tokens**: The workflows use the default `GITHUB_TOKEN`, automatically generated and rotated by GitHub Actions for each run.

---

## Workflow Permissions

JulesOps workflows should request only the permissions they need.

### `jules-dispatch.yml`

- `contents: read`: check out repository config and instruction files.
- `issues: write`: manage issue state labels and post status comments.
- `pull-requests: read`: inspect pull request state where needed.

### `jules-state-sync.yml`

- `contents: read`: check out config and the installed resolver.
- `issues: write`: manage issue labels and post issue/PR timeline comments.
- `pull-requests: read`: read pull request event metadata and linked issue context.
- `actions: write`: trigger `Jules Dispatch` after authorized `/jules retry` or `/jules requeue` commands.

### `jules-watchdog.yml`

- `contents: read`: check out config and the installed resolver.
- `issues: write`: post stale comments and repair mismatched issue labels.
- `pull-requests: read`: inspect open pull requests for linked issue mismatch detection.

---

## Comment Command Safety

Issue comments are user-controlled input. Workflows must not interpolate `github.event.comment.body` directly into shell commands. Pass comment bodies through environment variables or parse them in a script, then authorize the commenter before changing labels or triggering workflows.

---

## Free Kit Data Handling

The free workflow kit runs inside the adopter's GitHub repository. It does not send JulesOps job data to a JulesOps-hosted backend.

---

## Reporting a Vulnerability

If you discover a security vulnerability in JulesOps, please report it responsibly:

1. Do not open a public GitHub issue.
2. Email your report privately to the maintainers at **mukundshelake400@gmail.com**.
3. Include details of the vulnerability, a proof of concept if available, and instructions to replicate the issue.
4. Maintainers will acknowledge receipt and work on a fix within a reasonable timeframe.