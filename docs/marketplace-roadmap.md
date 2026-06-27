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

## Semantic Versioning Boundaries

JulesOps adheres to Semantic Versioning (SemVer) with the following specific boundaries:

1. **Pre-v1.0.0 (v0.x.y)**:
   - Used during the public beta and development phases of the free core workflow kit.
   - **Minor bumps (e.g., v0.3.0 -> v0.4.0)**: Reserved for breaking changes, such as modifying the `julesops.yml` configuration schema, changing workflow trigger designs, or updating required label defaults.
   - **Patch bumps (e.g., v0.3.0 -> v0.3.1)**: Reserved for backward-compatible additions, documentation updates, bug fixes, or non-breaking workflow optimizations.
2. **v1.0.0 and beyond**:
   - Tagged once the GitHub App foundation and basic hosted organization control plane are stable and ready for general availability in the GitHub Marketplace.
   - Standard SemVer rules apply (major bumps for breaking changes, minor for features, patch for bug fixes).
