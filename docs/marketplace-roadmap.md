# Marketplace roadmap

JulesOps should become a GitHub Marketplace product with a clear open-core boundary.

## Free core

The free core is the portable workflow kit:

- issue template for Jules tasks
- dispatch workflow
- state-sync workflow
- watchdog workflow
- repository config contract
- installer and validator scripts
- single-repository setup documentation

The free core should remain useful without a hosted backend.

## Paid layer

Paid features should focus on operating Jules across repositories:

- multi-repo dashboard
- job and attempt history
- stale-run alerts across repositories
- queue visibility and reporting
- organization-level policy management
- hosted setup and upgrade management

## Development sequence

1. Make the workflow kit installable and repeatable.
2. Validate the kit in multiple external repositories.
3. Extract common workflow logic into reusable actions where it reduces install drift.
4. Introduce a GitHub App when installation, webhooks, or hosted state become the bottleneck.
5. Add the hosted dashboard after the job protocol is stable.

## Product rule

Do not move basic single-repository orchestration behind the paid layer. The paid product should make JulesOps easier to operate at scale, not make the core workflow dependent on hosted services.

## Release plan

See [development-to-marketplace-release.md](development-to-marketplace-release.md) for the development sequence from workflow kit to Marketplace launch.
