# MoneyAccountUpgradeController — Remaining Work

## Step 0: Associate address

- [x] **Idempotency check**: `#associateAddress` now checks persisted state and skips signing/submission if the step has already been completed.

## Step 1: Submit authorization

- [ ] **Fetch on-chain nonce**: The nonce is hardcoded to `0` (line 271). This needs to be replaced with an actual on-chain nonce fetch for the account — likely via an `eth_getTransactionCount` call or equivalent messenger action. CHOMP validates that the nonce matches.

## Step 2: Verify delegation

- [x] **Caveat term encoding**: `#encodeCaveatTerms` now uses proper 256-bit zero-padded ABI encoding (`padStart(64, '0')`).
- [ ] **Use `@metamask/smart-accounts-kit`**: The description mentions using `createDelegation` from `@metamask/smart-accounts-kit` to build the delegation. This package is not yet in the repo — once it lands, the delegation construction in `#verifyDelegation` should use it instead of manual assembly.
- [ ] **Import `ROOT_AUTHORITY` from `@metamask/delegation-controller`**: Currently defined locally as a constant. The delegation-controller has it but doesn't export it — once it's exported, import it instead.

## Step 3: Save delegation

- [ ] **Implement Authenticated User Storage save**: `#saveDelegation` is a stub. Needs the `@metamask/authenticated-user-storage` wrapper (PR currently open). Once available, save the signed delegation so CHOMP can read it at execution time via its internal VPC endpoint.

## Step 4: Register intents

- [ ] **Intent configuration**: The deposit/withdrawal intents are hardcoded with `mUSD` token symbol and `MAX_UINT256` allowance. These may need to come from config or be parameterised once requirements solidify.

## General

- [x] **Resumability**: Every step now checks persisted state via `#isStepCompleted` and skips if already completed. Retrying after a mid-sequence failure resumes from the last incomplete step.
- [ ] **`MoneyAccountController:getMoneyAccount`**: This action is declared in `AllowedActions` but not currently used. It was included anticipating the controller may need to look up account details. Remove if not needed, or use it to validate the address before starting.
- [ ] **`#saveDelegation` unused `_chainId` parameter**: Will be needed once the stub is implemented — the storage call will likely need it.
