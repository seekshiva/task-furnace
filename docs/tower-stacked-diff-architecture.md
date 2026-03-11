# Tower Stacked Diff Architecture

## Goal

Design the `/tower` page so a developer can work in a single long-lived development branch, keep each prospective pull request represented as exactly one logical commit in that branch, and have TaskFurnace materialize and sync dedicated PR branches for each commit.

The development branch becomes the source of truth. The per-PR branches are derived artifacts generated and maintained by Tower.

## Desired Workflow

1. The user works only on a single dev branch.
2. Each PR-worthy change is represented by one logical commit in that dev branch.
3. The user can rebase the dev branch onto `main` whenever `main` moves.
4. The user can reorder commits to control intended merge order.
5. Tower can create one dedicated branch per commit with one click.
6. Tower can create GitHub PRs for those branches with one click.
7. When a logical commit changes, Tower detects it and force-pushes the matching PR branch.
8. When feedback lands on an older change, the user can add a fixup on top of the dev branch and later squash it into the intended commit.

## Key Recommendation

Do not use raw commit hashes as the primary identity for a change.

Rebases, reordering, squashing, and message edits will all rewrite commit hashes. If Tower tracks PR branches by hash alone, the mapping will constantly break.

Instead, each logical change should have a stable Tower identity embedded in the commit message as trailers:

- `Tower-Change-Id`: immutable logical identifier for the change
- `Tower-Branch`: PR branch name managed by Tower

Optional derived metadata should stay out of commit messages and live in local app state instead:

- PR number
- PR URL
- last synced SHA
- sync status
- last sync timestamp
- last error

This matches the user's request to annotate the dev-branch commit message with the branch name, while still giving the system a stable identity across rewrites.

## Core Product Model

### 1. Source of Truth

The source of truth is the ordered list of commits in the user's dev branch that are ahead of `main`.

Tower should compute:

- current branch name
- merge base against `main`
- ahead/behind counts
- ordered stack of commits from oldest to newest
- Tower trailers present or missing on each commit

### 2. Managed Change

Each commit in the stack becomes a `ManagedChange` in Tower:

- `changeId`
- `devBranch`
- `commitSha`
- `subject`
- `body`
- `trailers`
- `stackIndex`
- `branchName`
- `prState`
- `syncState`
- `dirtyDerivedBranch`

### 3. PR Branches as Derived Branches

A Tower PR branch is not edited directly by the user. It is regenerated from the dev-branch commit whenever Tower syncs.

That gives the cleanest mental model:

- edit only the dev branch
- Tower rebuilds PR branches
- remote PRs update from those generated branches

## Important Constraint

If every PR is opened against `main`, then every commit must be individually mergeable onto `main`.

If commit 3 depends on commit 2, and both PRs target `main`, then commit 3 is not truly independent. Tower cannot magically make a dependent change reviewable as an isolated PR against `main` unless it also includes prerequisite changes.

Because of that, Tower should support two materialization modes:

### Mode A: Independent PR Mode

Each PR branch is created as:

- `origin/main`
- plus exactly that one commit's patch

Use this when every change is intentionally self-contained and can merge directly to `main`.

This is the best fit for the workflow described by the user.

### Mode B: Stacked PR Mode

Each PR branch contains all prior stack commits up to that point.

Use this when later changes intentionally build on earlier ones. In this mode, PR branches can still target `main`, but reviewers will see cumulative diffs unless the repo's review culture tolerates stacked PRs. A cleaner variant is opening each PR against the previous PR branch, but that is different from the requested flow.

## Recommended Default

Default to `Independent PR Mode`.

Also surface a clear warning on any commit that appears dependent on an earlier commit. The product should not silently pretend a change is independently reviewable when it is not.

## Branch Naming Strategy

Branch names should be stable and should not encode stack order.

Bad choice:

- `tower/01-add-foo`
- `tower/02-fix-bar`

These become noisy when the user reorders commits.

Recommended pattern:

- `tower/<dev-branch>/<slug>-<shortChangeId>`

Example:

- `tower/feature-stack/add-session-filter-a1b2c3`

Once assigned, the branch name should remain stable unless the user explicitly renames it.

## Commit Message Strategy

Tower should append trailers rather than rewriting the subject line.

Recommended format:

```text
Add Tower session filter

<optional body>

Tower-Change-Id: a1b2c3d4
Tower-Branch: tower/feature-stack/add-session-filter-a1b2c3
```

Why trailers:

- easy to parse
- easy to preserve during rebase
- does not clutter the subject
- directly satisfies the request to show which branch tracks the change

## Local Metadata Storage

Commit trailers should hold only durable identity.

Operational metadata should live in a local-only store under `.git`, not in the working tree:

- `.git/task-furnace/tower-state.json`

Suggested contents:

- repo path
- main branch name
- active dev branch
- auto-sync enabled or disabled
- map of `changeId -> PR metadata`
- last refresh snapshot
- in-flight job info

This avoids polluting the repository with app state while keeping state local to the repo clone.

## Backend Architecture

## 1. Tower Git Domain Layer

Add a dedicated Tower Git service behind the Bun server. It should be the only layer allowed to run Git and `gh` operations.

Responsibilities:

- inspect repo state
- parse commit trailers
- compute stack order
- fetch and rebase against `origin/main`
- rewrite commit messages to add or update trailers
- reorder commits
- materialize derived PR branches
- push and force-push Tower-managed branches
- create and refresh GitHub PR metadata
- run autosquash flows for feedback commits

This should be implemented as a service layer, not scattered across route handlers.

## 2. Job/Operation Layer

Git operations are long-running and stateful. The UI needs progress and clear failure reporting.

Tower should execute mutations as jobs:

- rebase job
- reorder job
- assign branch trailers job
- materialize branches job
- sync all job
- create PRs job
- autosquash job

Each job should expose:

- job id
- type
- target changes
- started time
- current step
- success or failure
- logs safe to show in UI

For the first version, polling is sufficient. Real-time streaming can come later.

## 3. Read API

The `/tower` page should stop using a single `GET /api/tower/commits` endpoint and instead consume a richer read model.

Recommended read endpoints:

- `GET /api/tower/state`
- `GET /api/tower/jobs`
- `GET /api/tower/config`

`/api/tower/state` should return:

- repo summary
- branch summary
- ahead/behind summary
- ordered stack
- missing metadata
- branch existence
- remote divergence
- PR state for each change
- dependency warnings
- actionable errors

## 4. Mutation API

Recommended mutation endpoints:

- `POST /api/tower/rebase-main`
- `POST /api/tower/reorder`
- `POST /api/tower/assign-branches`
- `POST /api/tower/sync`
- `POST /api/tower/sync-all`
- `POST /api/tower/create-prs`
- `POST /api/tower/autosquash`
- `POST /api/tower/retarget-fixup`

These should trigger jobs rather than doing large operations inline in request handlers.

## Sync Engine Design

## How Tower should detect that a change has been edited

The system should never assume the old SHA is still valid.

Instead:

1. Scan current dev-branch commits ahead of `main`.
2. Parse `Tower-Change-Id` from each commit.
3. Match each logical change to local PR metadata.
4. Recompute the expected branch tip for that logical change.
5. Compare expected tip with local and remote PR branch tips.
6. If different, mark the change `out_of_sync`.

This approach survives:

- rebases onto `main`
- commit reordering
- commit message rewrites
- autosquash
- manual amend of an older commit

## How Tower should materialize a PR branch

In Independent PR Mode:

1. Start from `origin/main`.
2. Apply the target logical commit onto a temporary work ref.
3. Update the Tower branch ref to that result.
4. Push with `--force-with-lease`.

In Stacked PR Mode:

1. Start from `origin/main`.
2. Replay all commits from stack start through the target commit.
3. Update the Tower branch ref.
4. Push with `--force-with-lease`.

The implementation detail can be cherry-pick, rebase, or generated refs, but the product contract should be "derived branch is regenerated from dev-branch truth."

## Auto-Sync Recommendation

Auto-sync should be opt-in.

Silent remote force-pushes can surprise users. A safer design:

- default to manual `Sync all`
- offer `Enable auto-sync for Tower-managed branches`
- whenever the stack changes, compute dirty state immediately
- only push automatically if auto-sync is enabled

## Rebase Workflow

User need:

- keep dev branch updated against `main`
- when there is divergence, rebase

Recommended flow:

1. Tower fetches `origin/main`.
2. Tower reports ahead/behind status before action.
3. User clicks `Rebase onto main`.
4. Tower rebases the dev branch onto `origin/main`.
5. If conflicts occur, Tower stops and shows that manual resolution is required.
6. After success, Tower rescans the stack and marks all derived branches dirty.
7. User clicks `Sync all`, or auto-sync runs if enabled.

Important safety rule:

Tower should never automatically force-push the dev branch. Only Tower-managed PR branches should be force-pushed automatically.

## Reordering Workflow

User need:

- reorder commits in intended merge order

Recommended flow:

1. `/tower` shows the stack oldest to newest.
2. User changes order in the UI.
3. Tower previews the resulting order.
4. User confirms.
5. Tower runs a controlled history rewrite.
6. Tower rescans the stack by `Tower-Change-Id`.
7. All affected PR branches are marked dirty.
8. Sync refreshes the derived branches.

Important design note:

Reordering must preserve trailers. The stack order changes, but branch identity should not.

## Feedback-on-Older-Commit Workflow

The user's idea is good: allow feedback changes to be committed on top first, then later squash them into the intended PR commit.

That should be the primary workflow because it avoids constantly editing old commits during active development.

## Recommended model: Fixup Queue

Tower should support `feedback fixup` commits:

- user creates a normal top-of-stack commit
- Tower lets the user assign that commit to a target `ManagedChange`
- Tower records the target logically
- later, user clicks `Autosquash targeted fixups`

Implementation options:

- encode intent in commit subject
- store temporary mapping in local Tower state
- or both

Best product choice:

- use local state while the fixup is unsquashed
- once squashed, the old fixup commit disappears and the target logical change remains

## Why this is better than forcing immediate amend

- lower cognitive load
- avoids repeated rebases during review iteration
- keeps the main workstream moving
- lets the user batch multiple review fixes before rewriting history

## Recommended fixup UX on `/tower`

Per change card:

- `Create fixup target`
- `Attach existing top commit`
- `Autosquash into this change`

Global actions:

- `Show unsquashed fixups`
- `Autosquash all queued fixups`
- `Sync affected PR branches`

## Pull Request Creation

Once Tower branches exist, the user should be able to create PRs in bulk or individually.

Recommended flow:

1. Ensure the branch exists and is pushed.
2. Check whether an open PR already exists for that branch.
3. If not, create it with `gh`.
4. Save PR number and URL in local Tower state.
5. Surface PR status in `/tower`.

Recommended PR body sections:

- summary
- test plan
- stack context

Stack context is useful even when all PRs target `main`:

- stack position
- preceding logical changes
- following logical changes

This gives maintainers context without requiring them to understand the dev branch itself.

## Current Implementation Snapshot

The current `/tower` implementation is no longer just a flat commit list.

It already provides a basic two-pane Git explorer:

- left pane: commits ahead of `main`
- right pane: changed files for the selected commit
- summary: ahead-of-main count

Current backend support also includes:

- `GET /api/tower/commits`
- `GET /api/tower/commits/:hash/files`

This means the product already has the start of a read-only inspection workflow. The next design steps should build on this split-pane explorer rather than replace it.

## `/tower` Page Information Architecture

The current Tower page is a two-pane commit/file-change explorer. It should evolve from that baseline into four main regions.

### 1. Repo Summary Bar

Show:

- repo path
- current dev branch
- base branch
- ahead/behind counts
- last fetch time
- auto-sync state

Global actions:

- refresh
- fetch
- rebase onto main
- assign branch metadata
- sync all
- create PRs

### 2. Stack View

The existing left pane should become the canonical stack pane.

One card per logical change:

- subject
- current SHA
- `Tower-Change-Id`
- `Tower-Branch`
- branch sync status
- PR status
- warnings

Per-card actions:

- create branch
- sync branch
- create PR
- rename branch
- move up
- move down
- attach fixup
- autosquash

### 3. Unsquashed Fixups Panel

Show commits that are not part of the canonical logical stack yet, but appear intended as review fixes or follow-up adjustments.

Actions:

- assign to change
- leave on top
- discard from Tower tracking

### 4. Job Activity Panel

Show:

- current operation
- progress
- last successful sync
- failures and recovery guidance

## Guardrails and Safety

Tower is rewriting history, so safety rules matter.

Mandatory rules:

- only operate inside the configured target repo
- verify the repo is clean enough for the requested operation
- block destructive actions during unresolved merge or rebase states
- never force-push non-Tower branches automatically
- use `--force-with-lease`, never blind `--force`
- do not mutate commits missing explicit user confirmation when first assigning Tower trailers
- show a preview before reordering or autosquashing

## Failure Modes to Design For

- dev branch has uncommitted changes
- fetch fails
- rebase conflicts
- commit trailer missing or duplicated
- branch already exists remotely with unexpected history
- PR branch name collides
- `gh` is not authenticated
- user manually edited a Tower-managed PR branch
- a supposedly independent change no longer applies cleanly to `main`

Each of these should have a specific UI state and recovery path.

## Suggested Implementation Strategy

Build this in layers so each step is independently useful.

## Phase 1: Rich Read-Only Tower State

Deliverable:

- `/tower` evolves from a basic commit/file explorer into a real stack inspector

Work:

1. Keep the existing two-pane layout as the primary read-only interaction model.
2. Replace the simple commit endpoint with a richer stack state endpoint.
3. Parse `main..HEAD` commits and compute ordered stack state.
4. Detect ahead/behind and current branch metadata.
5. Parse existing Tower trailers if present.
6. Enrich the right pane from "changed files only" into "change details", so it can later show branch mapping, sync state, PR state, and warnings alongside file changes.
7. Show missing metadata, branch mapping, and sync placeholders in the UI.

Why first:

- gives immediate visibility
- validates the domain model
- builds directly on the existing implementation
- zero history mutation yet

## Phase 2: Commit Identity and Branch Assignment

Deliverable:

- Tower can assign stable change ids and branch names to commits

Work:

1. Define commit trailer format.
2. Implement branch-name generation rules.
3. Add a batch operation to annotate the stack with trailers.
4. Rescan and verify trailers survive rewrites.

Important note:

This phase rewrites history for the first time. Keep it explicit and previewed.

## Phase 3: Derived Branch Materialization

Deliverable:

- one-click branch creation for every logical change

Work:

1. Materialize per-change branches from the dev-branch stack.
2. Track local and remote branch state.
3. Add per-change and bulk sync actions.
4. Push with `--force-with-lease`.
5. Show clean `in sync` and `out of sync` states in `/tower`.

## Phase 4: Rebase Against Main

Deliverable:

- Tower can keep the dev branch current with `main`

Work:

1. Add fetch and rebase actions.
2. Surface conflict states cleanly.
3. After successful rebase, mark derived branches dirty.
4. Offer `Sync all affected branches`.

## Phase 5: Reordering

Deliverable:

- user can control intended merge order from `/tower`

Work:

1. Add reorder controls in the stack UI.
2. Preview the new order before apply.
3. Rewrite history while preserving trailers.
4. Recompute stack and dirty states after reorder.

## Phase 6: PR Creation and PR State

Deliverable:

- one-click GitHub PR creation

Work:

1. Detect whether a PR already exists for each Tower branch.
2. Add per-change and bulk PR creation.
3. Store PR URL and number in local Tower state.
4. Show PR lifecycle state in the UI.

## Phase 7: Feedback Fixups and Autosquash

Deliverable:

- review feedback on older commits becomes ergonomic

Work:

1. Detect loose top-of-stack fixup commits.
2. Allow assigning them to a target logical change.
3. Add autosquash action for one or many targets.
4. Rescan stack after squash and preserve change identity.
5. Sync affected PR branches automatically or by explicit user action.

## Phase 8: Auto-Sync and Advanced Safety

Deliverable:

- Tower feels low-friction for day-to-day use

Work:

1. Add opt-in auto-sync.
2. Add more explicit divergence warnings.
3. Detect manual tampering with Tower-managed branches.
4. Improve error recovery and operation logs.

## Open Product Decisions

These should be settled before implementation starts.

1. Should the first release support only independent PRs against `main`, or also stacked dependent PRs?
2. Should auto-sync be off by default? I strongly recommend yes.
3. Should initial branch assignment annotate all commits at once, or allow commit-by-commit adoption?
4. Should branch rename be allowed after PR creation, or should branch names become immutable?
5. Should fixup targeting live only in local state before squash, or also be encoded in temporary commit naming conventions?

## Recommended Final Product Opinion

If the goal is a clean and reliable first version, the best opinionated model is:

1. A single dev branch is the only branch the user edits directly.
2. Each logical change is identified by `Tower-Change-Id`.
3. Each change gets a stable `Tower-Branch` trailer in the commit message.
4. `/tower` can rebase, reorder, branch, sync, and create PRs.
5. Review feedback is handled by top-of-stack fixup commits plus explicit autosquash.
6. Tower force-pushes only Tower-managed PR branches, never the dev branch.
7. Independent PR mode is the default and the first release target.

## Recommended Build Order

If we want the shortest path to value, implement in this exact order:

1. Rich read-only stack state on `/tower`
2. Stable commit trailers for change identity and branch mapping
3. Branch materialization and sync
4. Rebase onto `main`
5. Reorder stack
6. GitHub PR creation
7. Fixup targeting and autosquash
8. Optional auto-sync

This ordering minimizes risk while making the page useful very early.
