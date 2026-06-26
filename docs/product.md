# JulesOps product scope

## One-line description

**JulesOps** is a Jules-specific DevOps layer for GitHub repositories. It turns GitHub issues into safe, reviewable Jules work and keeps issue/PR state coherent.

## Problem statement

Google Jules can produce code changes, but using it inside a real repository workflow still leaves operational work to the maintainer:

- deciding which issue Jules should work on next
- making sure Jules only works on one approved task at a time
- enforcing branch and PR targeting rules
- moving issues through `todo -> in progress -> review -> done`
- handling blocked tasks and failed runs cleanly
- understanding what Jules is currently doing across one or more repositories

JulesOps exists to provide that orchestration layer.

## Initial target user

The initial user is a maintainer or solo developer who:

- already uses GitHub issues as a task queue
- wants to use Jules as an implementation agent
- wants a controlled workflow rather than ad-hoc prompting
- is comfortable with GitHub Actions / repository automation

## Core jobs-to-be-done

1. **Queue work for Jules** using normal GitHub issues.
2. **Dispatch one safe unit of work** to Jules with the right instructions and repo context.
3. **Keep issue state in sync** with PR creation, merge, blocked outcomes, and retries.
4. **Make failures legible** instead of silently stalling the workflow.
5. **Create an audit trail** of what Jules changed, what verification ran, and why an issue is blocked.

## v1 product surface

JulesOps v1 is a **workflow kit**, not yet a hosted platform.

### Included in v1

- a reusable Jules issue template
- generic orchestration instructions for Jules
- dispatch, state-sync, and watchdog workflows
- a repository config contract
- installer and validator scripts
- examples showing how a repo opts in

### Explicitly not in v1

- a required hosted backend
- a full GitHub App requirement for basic use
- a polished dashboard or control plane
- multi-agent support
- broad project management / roadmap tooling
- repository-specific coding guidance beyond hooks for repo instructions

## Product boundary

JulesOps should own **workflow orchestration**, not the repository's internal engineering conventions.

### JulesOps owns

- queueing and dispatch logic
- state transitions and status labels
- issue to PR synchronization
- blocked / retry / watchdog mechanics
- generic agent protocol and completion / blocked comment conventions
- installation and validation of the workflow kit

### The adopting repository owns

- repository-specific coding rules
- domain-specific migration / testing conventions
- base branch choice and label conventions within the JulesOps config contract
- acceptance criteria for each task

## Why Jules-specific first

Keeping the first version Jules-specific is deliberate.

Reasons:

- the workflow can be optimized for Jules' invocation model and operational quirks
- the repo instructions can assume Jules-specific behavior without abstraction overhead
- the product can validate whether the orchestration layer is genuinely valuable before generalizing to other agents

## GitHub Marketplace direction

The intended product path is GitHub Marketplace with an open-core split.

### Free core

- workflow kit
- templates
- generic orchestration docs
- installer and validator scripts
- single-repository setup

### Paid layer

Potential paid features later:

- cross-repo dashboard
- historical job analytics
- stale-run and failure alerting across repos
- multi-repo controls and reporting
- hosted operational control plane
- setup and upgrade management

The paid product should make JulesOps easier to operate at scale, not make the basic single-repository workflow dependent on hosted services.

## Success criteria for the first usable version

A repository should be able to adopt JulesOps and get the following loop working with minimal customization:

1. Install the workflow kit into a target repo.
2. Create a GitHub issue using the Jules task template.
3. Label or queue it for Jules.
4. JulesOps dispatches it to Jules.
5. Jules opens a PR against the configured base branch.
6. JulesOps moves the issue into review.
7. When the PR merges, JulesOps marks the issue done and closes it.
8. If Jules blocks or fails, JulesOps leaves the issue in a legible blocked/failed state.