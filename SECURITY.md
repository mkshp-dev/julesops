# Security Policy

Security is a core priority for JulesOps. This document outlines how secrets, workflow permissions, and vulnerabilities are managed within this project.

## Supported Versions

Only the latest release of JulesOps is supported for security updates:

| Version | Supported          |
| ------- | ------------------ |
| v0.2.x  | :white_check_mark: |
| < v0.2  | :x:                |

---

## Secrets Management

* **`JULES_API_KEY`**: The API key used to communicate with Jules must **never** be hardcoded or checked into repository configuration files (`julesops.yml`) or template instructions. It should always be set as a GitHub Repository Secret (`secrets.JULES_API_KEY`).
* **GitHub Tokens**: The workflows use the default GITHUB_TOKEN (`${{ secrets.GITHUB_TOKEN }}` or `github.token`) which is automatically generated and rotated by GitHub Actions for each run.

---

## Workflow Permissions

JulesOps workflows follow the principle of least privilege. They request only the minimal permissions required to function. Adopters should verify that the following permissions are granted in their repository settings:

* **`jules-dispatch.yml`**:
  * `contents: read` (to check out the repository config and code)
  * `issues: write` (to manage issue state labels and post status comments)
  * `pull-requests: read` (to check for linked PRs)
* **`jules-state-sync.yml`**:
  * `contents: read`
  * `issues: write`
  * `pull-requests: write` (to post warnings or comments on PRs)
  * `actions: write` (to trigger dispatch runs via repository dispatch)
* **`jules-watchdog.yml`**:
  * `contents: read`
  * `issues: write`
  * `pull-requests: read`

---

## Reporting a Vulnerability

If you discover a security vulnerability in JulesOps, please report it responsibly:

1. **Do not open a public GitHub issue**. Publicly disclosing a vulnerability exposes users to immediate exploitation.
2. Email your report privately to the maintainers at **mukundshelake400@gmail.com**.
3. Include details of the vulnerability, a proof of concept if available, and instructions on how to replicate the issue.
4. Maintainers will acknowledge receipt of the report and work on a fix within a reasonable timeframe.
