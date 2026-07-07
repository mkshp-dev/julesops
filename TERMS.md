# Terms of Service

**Last updated: 2026-07-08**

---

## 1. Scope

These terms apply to the JulesOps free workflow kit. The free workflow kit is the only generally available JulesOps product at this time. A hosted service is in development; separate commercial terms will apply when it launches.

---

## 2. Free Workflow Kit

The free workflow kit is open-source software provided under the license in `LICENSE` (MIT).

By installing or using the workflow kit you agree that:

- The software is provided **as-is, without warranty of any kind**, express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement.
- You are responsible for reviewing the workflow permissions, repository secrets, and generated pull requests before using JulesOps in production repositories.
- JulesOps is not liable for any damages arising from automated code changes, Jules dispatch failures, label mutations, or any other workflow activity.
- You will not use JulesOps to automate changes that violate GitHub's Acceptable Use Policy or any applicable law.

---

## 3. Jules API usage

JulesOps dispatches work to Google Jules using the `JULES_API_KEY` secret you provide. Use of the Jules API is subject to Google's terms. JulesOps is not affiliated with Google and does not guarantee Jules availability or behavior.

---

## 4. GitHub Actions usage

Workflows run on GitHub-hosted runners and are subject to [GitHub's Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) and Actions usage limits.

---

## 5. Hosted service (not yet available)

The hosted GitHub App, dashboard, billing, RBAC, and multi-repo control-plane features are in development and are **not yet available**. Commercial terms covering account ownership, billing, cancellation, service availability, and data retention will be published before the hosted service launches.

---

## 6. Contact

For questions, open a GitHub issue. For security-sensitive reports, use the process described in `SECURITY.md`.