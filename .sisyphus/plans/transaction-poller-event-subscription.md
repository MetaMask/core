# TransactionPoller Event Subscription

## TL;DR

> **Quick Summary**: Add `AccountActivityService:transactionUpdated` event subscription to TransactionPoller, triggering accelerated polling when matching transactions complete. Extract `caip2ToHex` utility from IncomingTransactionHelper into a shared module.
>
> **Deliverables**:
>
> - New utility file `packages/transaction-controller/src/utils/caip.ts` with `caip2ToHex` function
> - Updated `TransactionPoller.ts` with event subscription in `start()` and cleanup in `stop()`
> - Updated `IncomingTransactionHelper.ts` to use shared utility
> - Comprehensive test coverage for new functionality
> - No linting errors
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request

Modify TransactionPoller.ts to subscribe to `AccountActivityService:transactionUpdated` event when `start()` method is called. When event is received, check that chainId matches and status is 'confirmed' or 'finalized', then call `await this.#interval(true);`. Extract `#caip2ToHex` from IncomingTransactionHelper.ts into a shared utility. Add test coverage and ensure no linting issues.

### Interview Summary

**Key Discussions**:

- Chain ID format: CAIP-2 ('eip155:1') → Hex ('0x1') conversion using shared utility
- Completed status: 'confirmed' OR 'finalized' triggers accelerated polling
- Cleanup: Unsubscribe from event in `stop()` method
- Utility extraction: Create shared `caip2ToHex` utility from IncomingTransactionHelper private method

**Research Findings**:

- TransactionPoller has `#messenger: TransactionControllerMessenger` supporting `AccountActivityService:transactionUpdated` event
- IncomingTransactionHelper.ts lines 424-439 contains `#caip2ToHex` implementation using `@metamask/utils` functions
- Existing test patterns use Jest with fake timers and messenger mocks
- No utils/index.ts exists - standalone utility file is appropriate

### Metis Review

**Identified Gaps** (addressed):

- Race condition: Guard against calling `#interval(true)` when poller not running
- Duplicate subscriptions: Check `#running` state before subscribing
- Error handling: Wrap handler in try-catch with logging
- Multiple start() calls: Existing guard (`if (this.#running) return;`) handles this

---

## Work Objectives

### Core Objective

Subscribe TransactionPoller to transaction completion events, enabling faster polling response when transactions are confirmed or finalized on matching chains.

### Concrete Deliverables

- `packages/transaction-controller/src/utils/caip.ts` - Shared utility file
- `packages/transaction-controller/src/utils/caip.test.ts` - Utility tests
- Modified `packages/transaction-controller/src/helpers/TransactionPoller.ts`
- Modified `packages/transaction-controller/src/helpers/TransactionPoller.test.ts`
- Modified `packages/transaction-controller/src/helpers/IncomingTransactionHelper.ts`

### Definition of Done

- [ ] `yarn workspace @metamask/transaction-controller test` passes
- [ ] `yarn lint` passes (or lint command for the package)
- [ ] All existing IncomingTransactionHelper tests pass unchanged

### Must Have

- Event subscription on `start()`, unsubscription on `stop()`
- ChainId matching (CAIP-2 to Hex conversion)
- Status check for 'confirmed' OR 'finalized'
- Guard against calling `#interval(true)` when not running
- Test coverage for all new code paths
- JSDoc comments on new utility function

### Must NOT Have (Guardrails)

- Do NOT modify `#interval()` implementation
- Do NOT add debouncing/throttling to event handler
- Do NOT subscribe to additional events
- Do NOT change existing `start()`/`stop()` behavior for timers/block tracker
- Do NOT add new constructor parameters
- Do NOT modify IncomingTransactionHelper logic (only extract utility)
- Do NOT export `caip2ToHex` from package public API (internal utility only)

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (TDD)
- **Framework**: Jest

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

All verification through:

- **Unit tests**: Jest test runner
- **Lint**: yarn lint command
- **Type checking**: TypeScript compiler

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Create caip2ToHex utility with tests

Wave 2 (After Wave 1):
├── Task 2: Update IncomingTransactionHelper to use shared utility
└── Task 3: Add event subscription to TransactionPoller with tests

Wave 3 (After Wave 2):
├── Task 4: Run full test suite and fix any issues
└── Task 5: Run lint and fix any issues
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 1    | None       | 2, 3   | None                 |
| 2    | 1          | 4      | 3                    |
| 3    | 1          | 4      | 2                    |
| 4    | 2, 3       | 5      | None                 |
| 5    | 4          | None   | None                 |

---

## TODOs

- [ ] 1. Create caip2ToHex Utility with Tests (TDD)

  **What to do**:

  **RED Phase:**

  - Create test file `packages/transaction-controller/src/utils/caip.test.ts`
  - Write failing tests for:
    - `caip2ToHex('eip155:1')` returns `'0x1'`
    - `caip2ToHex('eip155:137')` returns `'0x89'`
    - `caip2ToHex('eip155:8453')` returns `'0x2105'`
    - `caip2ToHex('invalid')` returns `undefined`
    - `caip2ToHex('not:valid:format')` returns `undefined`
  - Run tests, verify they fail (function doesn't exist)

  **GREEN Phase:**

  - Create `packages/transaction-controller/src/utils/caip.ts`
  - Implement `caip2ToHex` function by extracting logic from IncomingTransactionHelper.ts lines 424-439
  - Add JSDoc documentation
  - Run tests, verify they pass

  **REFACTOR Phase:**

  - Ensure clean code, no unnecessary complexity
  - Run tests, verify still passing

  **Must NOT do**:

  - Do NOT export from package public API (index.ts)
  - Do NOT change the logic from IncomingTransactionHelper

  **Recommended Agent Profile**:

  - **Category**: `quick`
    - Reason: Single-file utility creation, straightforward extraction
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (alone)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References** (CRITICAL):

  **Pattern References**:

  - `packages/transaction-controller/src/helpers/IncomingTransactionHelper.ts:424-439` - Exact implementation to extract (caip2ToHex function)

  **API/Type References**:

  - `@metamask/utils` - imports `isCaipChainId`, `parseCaipChainId`
  - `@metamask/controller-utils` - imports `toHex`
  - `@metamask/utils` - type `Hex`

  **Test References**:

  - `packages/transaction-controller/src/utils/feature-flags.test.ts` - Example of utility test file structure in this package

  **WHY Each Reference Matters**:

  - IncomingTransactionHelper.ts:424-439: Contains exact implementation to copy - uses `isCaipChainId` to validate, `parseCaipChainId` to extract reference, `toHex` to convert
  - feature-flags.test.ts: Shows testing patterns for utility functions in this package

  **Acceptance Criteria**:

  - [ ] Test file created: `packages/transaction-controller/src/utils/caip.test.ts`
  - [ ] Test covers: valid CAIP-2 formats return correct Hex
  - [ ] Test covers: invalid formats return undefined
  - [ ] `yarn workspace @metamask/transaction-controller run jest --no-coverage src/utils/caip.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Utility tests pass
    Tool: Bash
    Preconditions: Package dependencies installed
    Steps:
      1. cd packages/transaction-controller
      2. Run: NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage src/utils/caip.test.ts
      3. Assert: Exit code 0
      4. Assert: Output contains "PASS"
    Expected Result: All caip2ToHex tests pass
    Evidence: Terminal output captured
  ```

  **Commit**: NO

---

- [ ] 2. Update IncomingTransactionHelper to Use Shared Utility

  **What to do**:

  - Import `caip2ToHex` from `../utils/caip` in IncomingTransactionHelper.ts
  - Remove the private `#caip2ToHex` method (lines 424-439)
  - Replace all usages of `this.#caip2ToHex(...)` with `caip2ToHex(...)`
  - Run existing IncomingTransactionHelper tests to verify behavior unchanged

  **Must NOT do**:

  - Do NOT change any logic or behavior
  - Do NOT modify test files
  - Do NOT add new functionality

  **Recommended Agent Profile**:

  - **Category**: `quick`
    - Reason: Simple refactor - remove private method, add import, replace calls
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:

  - `packages/transaction-controller/src/helpers/IncomingTransactionHelper.ts:449` - Current usage: `this.#caip2ToHex(caip2ChainId)`

  **API/Type References**:

  - `packages/transaction-controller/src/utils/caip.ts` - The utility created in Task 1

  **Test References**:

  - `packages/transaction-controller/src/helpers/IncomingTransactionHelper.test.ts` - Existing tests that must continue to pass

  **WHY Each Reference Matters**:

  - Line 449 shows where `#caip2ToHex` is called - need to replace `this.#caip2ToHex` with imported `caip2ToHex`
  - Test file must pass unchanged - proves refactor preserved behavior

  **Acceptance Criteria**:

  - [ ] Private method `#caip2ToHex` removed from IncomingTransactionHelper.ts
  - [ ] Import statement added: `import { caip2ToHex } from '../utils/caip';`
  - [ ] All `this.#caip2ToHex` calls replaced with `caip2ToHex`
  - [ ] `yarn workspace @metamask/transaction-controller run jest --no-coverage src/helpers/IncomingTransactionHelper.test.ts` → PASS (no test modifications)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: IncomingTransactionHelper tests pass unchanged
    Tool: Bash
    Preconditions: Task 1 completed, utility exists
    Steps:
      1. cd packages/transaction-controller
      2. Run: NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage src/helpers/IncomingTransactionHelper.test.ts
      3. Assert: Exit code 0
      4. Assert: Output contains "PASS"
    Expected Result: All existing tests pass without modifications
    Evidence: Terminal output captured

  Scenario: Verify private method removed
    Tool: Bash
    Steps:
      1. Run: grep -n "#caip2ToHex" packages/transaction-controller/src/helpers/IncomingTransactionHelper.ts
      2. Assert: No matches found (exit code 1)
    Expected Result: Private method no longer exists
    Evidence: grep output (empty)
  ```

  **Commit**: NO

---

- [ ] 3. Add Event Subscription to TransactionPoller with Tests (TDD)

  **What to do**:

  **RED Phase - Write Failing Tests First:**

  - Add tests to `TransactionPoller.test.ts` for:
    1. `start()` subscribes to `AccountActivityService:transactionUpdated` event
    2. `stop()` unsubscribes from `AccountActivityService:transactionUpdated` event
    3. Event with matching chainId + status='confirmed' triggers `#interval(true)`
    4. Event with matching chainId + status='finalized' triggers `#interval(true)`
    5. Event with non-matching chainId does NOT trigger `#interval`
    6. Event with status='pending' does NOT trigger `#interval`
    7. Event does NOT trigger `#interval` if poller is stopped
  - Run tests, verify they fail

  **GREEN Phase - Implement:**

  - Import `Transaction` type from `@metamask/core-backend`
  - Import `caip2ToHex` from `../utils/caip`
  - Add private field: `#transactionUpdatedHandler?: (transaction: Transaction) => void;`
  - In `start()` method, after setting `#running = true`:
    - Create handler that:
      1. Converts `transaction.chain` to Hex using `caip2ToHex`
      2. Compares with `this.#chainId`
      3. Checks if `transaction.status` is 'confirmed' or 'finalized'
      4. Guards: only proceed if `this.#running` is true
      5. If all conditions met: calls `this.#interval(true).catch(...)` (catch errors to prevent unhandled rejection)
    - Store handler reference
    - Subscribe: `this.#messenger.subscribe('AccountActivityService:transactionUpdated', this.#transactionUpdatedHandler)`
  - In `stop()` method, before setting `#running = false`:
    - If `#transactionUpdatedHandler` exists:
      - Unsubscribe: `this.#messenger.unsubscribe('AccountActivityService:transactionUpdated', this.#transactionUpdatedHandler)`
      - Set `#transactionUpdatedHandler = undefined`
  - Run tests, verify they pass

  **REFACTOR Phase:**

  - Clean up code, ensure consistent style
  - Run tests, verify still passing

  **Must NOT do**:

  - Do NOT modify `#interval()` implementation
  - Do NOT add debouncing
  - Do NOT add constructor parameters
  - Do NOT subscribe to other events

  **Recommended Agent Profile**:

  - **Category**: `unspecified-low`
    - Reason: Medium complexity - event subscription with TDD approach
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:

  - `packages/transaction-controller/src/helpers/IncomingTransactionHelper.ts:84-88` - Handler pattern: store function reference for unsubscription
  - `packages/transaction-controller/src/helpers/IncomingTransactionHelper.ts:225-228` - Subscribe pattern with stored handler
  - `packages/transaction-controller/src/helpers/IncomingTransactionHelper.ts:239-242` - Unsubscribe pattern with stored handler
  - `packages/transaction-controller/src/helpers/TransactionPoller.ts:56-67` - Current `start()` method to modify
  - `packages/transaction-controller/src/helpers/TransactionPoller.ts:73-87` - Current `stop()` method to modify

  **API/Type References**:

  - `packages/core-backend/src/types.ts:4-17` - `Transaction` type with `chain: string` and `status: string`
  - `packages/transaction-controller/src/utils/caip.ts` - `caip2ToHex` utility
  - `packages/transaction-controller/src/TransactionController.ts:613` - `AccountActivityServiceTransactionUpdatedEvent` in AllowedEvents

  **Test References**:

  - `packages/transaction-controller/src/helpers/TransactionPoller.test.ts:21-25` - Messenger mock pattern
  - `packages/transaction-controller/src/helpers/TransactionPoller.test.ts:54-71` - Test structure for accelerated polling
  - `packages/transaction-controller/src/helpers/IncomingTransactionHelper.test.ts:580-584` - Messenger mock with subscribe

  **WHY Each Reference Matters**:

  - IncomingTransactionHelper patterns show exact messenger subscribe/unsubscribe API usage
  - TransactionPoller.ts shows where to add code in start() and stop()
  - Test files show mocking patterns for messenger
  - core-backend types.ts shows Transaction shape for handler typing

  **Acceptance Criteria**:

  - [ ] Test file updated: `packages/transaction-controller/src/helpers/TransactionPoller.test.ts`
  - [ ] Tests cover: subscription on start()
  - [ ] Tests cover: unsubscription on stop()
  - [ ] Tests cover: matching chainId + 'confirmed' status triggers interval
  - [ ] Tests cover: matching chainId + 'finalized' status triggers interval
  - [ ] Tests cover: non-matching chainId does NOT trigger interval
  - [ ] Tests cover: non-terminal status does NOT trigger interval
  - [ ] Tests cover: stopped poller does NOT trigger interval
  - [ ] `yarn workspace @metamask/transaction-controller run jest --no-coverage src/helpers/TransactionPoller.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: TransactionPoller tests pass
    Tool: Bash
    Preconditions: Task 1 completed
    Steps:
      1. cd packages/transaction-controller
      2. Run: NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage src/helpers/TransactionPoller.test.ts
      3. Assert: Exit code 0
      4. Assert: Output contains "PASS"
    Expected Result: All TransactionPoller tests pass
    Evidence: Terminal output captured

  Scenario: Verify subscribe is called on start
    Tool: Bash
    Steps:
      1. grep -n "subscribe.*AccountActivityService:transactionUpdated" packages/transaction-controller/src/helpers/TransactionPoller.ts
      2. Assert: Match found
    Expected Result: Subscribe call exists in source
    Evidence: grep output with line number

  Scenario: Verify unsubscribe is called on stop
    Tool: Bash
    Steps:
      1. grep -n "unsubscribe.*AccountActivityService:transactionUpdated" packages/transaction-controller/src/helpers/TransactionPoller.ts
      2. Assert: Match found
    Expected Result: Unsubscribe call exists in source
    Evidence: grep output with line number
  ```

  **Commit**: NO

---

- [ ] 4. Run Full Test Suite

  **What to do**:

  - Run the complete test suite for the transaction-controller package
  - If any tests fail, investigate and fix issues
  - Ensure no regressions introduced

  **Must NOT do**:

  - Do NOT modify tests just to make them pass (fix the source code)
  - Do NOT skip failing tests

  **Recommended Agent Profile**:

  - **Category**: `quick`
    - Reason: Verification task - run tests and fix if needed
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 2, 3

  **References** (CRITICAL):

  **Test References**:

  - `packages/transaction-controller/package.json:45` - Test script: `NODE_OPTIONS=--experimental-vm-modules jest`

  **WHY Each Reference Matters**:

  - package.json shows exact test command to run

  **Acceptance Criteria**:

  - [ ] `yarn workspace @metamask/transaction-controller test` → PASS (all tests)
  - [ ] No test modifications needed (if modifications were needed, explain why)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: Tasks 1-3 completed
    Steps:
      1. Run: yarn workspace @metamask/transaction-controller test
      2. Assert: Exit code 0
      3. Assert: No "FAIL" in output
    Expected Result: All package tests pass
    Evidence: Terminal output with test summary

  Scenario: Verify test count hasn't decreased
    Tool: Bash
    Steps:
      1. Run: yarn workspace @metamask/transaction-controller test 2>&1 | grep -E "Tests:.*passed"
      2. Assert: Output shows test counts
    Expected Result: Test count visible in output
    Evidence: Test summary line
  ```

  **Commit**: NO

---

- [ ] 5. Run Lint Check

  **What to do**:

  - Run lint check for the transaction-controller package
  - Fix any lint errors or warnings
  - Ensure code follows project style guidelines

  **Must NOT do**:

  - Do NOT disable lint rules
  - Do NOT add eslint-disable comments without good reason

  **Recommended Agent Profile**:

  - **Category**: `quick`
    - Reason: Verification task - run lint and fix if needed
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 4)
  - **Blocks**: None (final task)
  - **Blocked By**: Task 4

  **References** (CRITICAL):

  **Pattern References**:

  - `packages/transaction-controller/src/helpers/TransactionPoller.ts:135-136` - Existing eslint-disable pattern for Promise handling

  **Documentation References**:

  - Root `eslint.config.mjs` - ESLint configuration

  **WHY Each Reference Matters**:

  - TransactionPoller.ts shows existing pattern for handling Promise-related lint rules if needed

  **Acceptance Criteria**:

  - [ ] `yarn lint` passes (or package-specific lint)
  - [ ] No new eslint-disable comments added (unless justified)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Lint passes
    Tool: Bash
    Preconditions: Tasks 1-4 completed
    Steps:
      1. Run: yarn lint 2>&1 | grep -A5 "transaction-controller" || yarn lint
      2. Assert: No errors for transaction-controller files
    Expected Result: No lint errors
    Evidence: Lint output

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Steps:
      1. Run: yarn workspace @metamask/transaction-controller build
      2. Assert: Exit code 0
    Expected Result: Build succeeds
    Evidence: Build output
  ```

  **Commit**: NO

---

## Success Criteria

### Verification Commands

```bash
# All package tests pass
yarn workspace @metamask/transaction-controller test  # Expected: PASS

# Lint passes
yarn lint  # Expected: No errors in transaction-controller

# Build succeeds
yarn workspace @metamask/transaction-controller build  # Expected: Success
```

### Final Checklist

- [ ] `caip2ToHex` utility created and tested
- [ ] IncomingTransactionHelper uses shared utility (behavior unchanged)
- [ ] TransactionPoller subscribes to event on start()
- [ ] TransactionPoller unsubscribes from event on stop()
- [ ] Accelerated polling triggered on matching chainId + completed status
- [ ] All tests pass
- [ ] No lint errors
- [ ] All "Must NOT Have" guardrails respected
