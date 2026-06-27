# Privacy Policy

This policy describes the intended data handling for JulesOps.

## Free Workflow Kit

The free workflow kit runs inside the adopting repository using GitHub Actions. It does not send JulesOps job data to a JulesOps-hosted service.

Data handled by the free kit stays in GitHub surfaces owned by the adopter:

- issues
- labels
- pull requests
- workflow logs
- repository secrets such as `JULES_API_KEY`

The free kit does not collect payment data, user analytics, or hosted telemetry.

## Planned Hosted Control Plane

The hosted GitHub App, dashboard, billing, RBAC, and multi-repo telemetry features are planned/prototyped. Before launch, this policy must be expanded to cover:

- GitHub App installation data
- repository metadata
- issue and pull request metadata
- webhook event retention
- user authentication data
- billing metadata
- notification destinations
- data deletion and export requests

## Payment Data

JulesOps should not store raw payment card data. Any future paid plan should use a payment processor such as Stripe and store only subscription metadata required for plan enforcement.

## Contact

Security and privacy concerns can be reported using the process in `SECURITY.md`.