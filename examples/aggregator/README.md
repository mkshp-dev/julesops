# Aggregator example

This directory shows what an adopting repository contributes alongside the reusable JulesOps workflow kit.

Files:

- `julesops.yml` is an example repository configuration for Aggregator.
- `jules-repo.md` is example repository-specific Jules guidance for a Supabase-heavy codebase.

The reusable files themselves still come from the JulesOps source kit:

- `templates/jules-core.md`
- `templates/jules-task.yml`
- `workflows/jules-dispatch.yml`
- `workflows/jules-state-sync.yml`
- `workflows/jules-watchdog.yml`

To install the current kit into an Aggregator-like repository, run the installer from the JulesOps repo and then adapt the generated `.github/jules-repo.md` using the example in this directory.