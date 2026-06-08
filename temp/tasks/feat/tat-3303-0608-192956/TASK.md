# Worker: Interactive Dev (Core Monorepo)

> Interactive lightweight dev — operator may steer the session; keep CHECKLIST.md and inputs/dev-intake.json current, then wait for Farmslot operator completion.

> **Signal file:** For interactive dev, keep `temp/tasks/feat/tat-3303-0608-192956/CHECKLIST.md` current. Farmslot operator owns final completion.

## Task

```text
TICKET: TAT-3303
TITLE: TAT-3303
BRANCH: TAT-3303-feat-update-dev-flow
TASK_DIR: temp/tasks/feat/tat-3303-0608-192956
REPO: /Users/deeeed/dev/metamask/core-6
SESSION: core-6
STATUS: working
```

## Description

_No description_

## Acceptance Criteria

_Not specified_

## Checklist

- [x] **1. Read context** — `cat CLAUDE.local.md` and `cat temp/tasks/feat/tat-3303-0608-192956/inputs/dev-intake.json 2>/dev/null`.
- [x] **2. Update status** — set `STATUS: working` in this file.
- [x] **3. Create or switch to branch**:
  ```bash
  cd /Users/deeeed/dev/metamask/core-6
  git checkout -B TAT-3303-feat-update-dev-flow
  ```
- [x] **4. Implement the requested Core/Farmslot change** with small, reviewable commits. _(Skipped — no scope in intake; awaiting operator.)_
- [x] **5. Validate affected package or template behavior**. Prefer:
  ```bash
  cd /Users/deeeed/dev/metamask/core-6
  yarn workspace @metamask/perps-controller build
  yarn workspace @metamask/perps-controller test --bail
  ```
- [x] **6. If changing Farmslot project templates**, render/smoke every affected flow before claiming success. _(N/A — no template changes.)_
- [x] **7. Write `temp/tasks/feat/tat-3303-0608-192956/artifacts/report.md`** with changes, validation, and remaining risks.

## Rules

- Ask the operator only when blocked by missing credentials, missing repos, or a product decision.
- Do not push or mutate GitHub unless explicitly instructed.
