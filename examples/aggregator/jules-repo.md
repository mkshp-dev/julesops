# Aggregator repo-specific Jules instructions

This file is an **example** of the kind of repository-specific instructions that an adopting repo would provide alongside JulesOps.

It is based on the current `Aggregator` repository and is intentionally specific to that codebase.

---

## Repository role

Aggregator is a **Supabase-backed personal analytics / assistant backend**.

It contains things like:
- Supabase SQL migrations
- Supabase Edge Functions
- GitHub ingestion / sync logic
- Todoist ingestion / sync logic
- assistant-facing SQL views / RPCs / dashboard queries

Many tasks in this repository involve **schema changes, views, RPCs, or ingestion logic**. Changes to those surfaces should be conservative and explicit.

---

## Migration and schema rules

When a task changes database schema:

- create a **new migration** in `supabase/migrations/`
- prefer additive migrations where practical
- if a rename is required, update dependent SQL objects and edge-function code in the same task when the issue expects a working system afterwards
- keep migration names descriptive and aligned with repo conventions

Unless the issue explicitly asks for it, do **not**:
- rewrite old applied migrations
- make destructive schema changes casually
- drop tables / columns / views / functions without clear issue scope

---

## Edge function rules

When changing Supabase Edge Functions:

- preserve existing authentication / signature verification behavior unless the issue explicitly changes it
- do not weaken webhook verification or auth checks without explicit instruction
- keep request handling and writes idempotent where practical
- if a function depends on a schema change, update the migration and function together unless the issue explicitly splits them

---

## Assistant-facing query layer expectations

When the issue is about summaries, dashboards, cross-service queries, or assistant-facing outputs:

- prefer reusable SQL views or RPCs rather than burying query logic inside edge functions
- keep raw ingestion tables source-specific unless the issue explicitly asks for normalization
- preserve existing dashboard views unless the issue explicitly replaces them

---

## Verification expectations

Before opening a PR for Aggregator:

- run the relevant lint / build / test / typecheck commands if they exist and apply to the changed surface
- if the task changes SQL views / RPCs / migrations, verify the SQL carefully against the current schema and dependent objects
- do not claim verification passed unless it actually ran successfully during the task

---

## Scope discipline reminders for Aggregator

Unless the issue explicitly asks for it, do **not**:
- modify unrelated GitHub Actions
- change queue / label orchestration behavior
- rewrite old migrations
- perform broad schema cleanups unrelated to the task
- start work on additional issues
