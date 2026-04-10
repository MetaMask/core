# MoneyAccountUpgradeController — Remaining Work

## Step 0: Associate address

- [ ] **Idempotency check**: `#associateAddress` currently always signs and submits. The CHOMP API returns 409 when already associated (which is handled as success), but we could skip the signing step entirely by checking state or querying CHOMP first.

## Step 1: Submit authorization

- [ ] **Fetch on-chain nonce**: The nonce is hardcoded to `0` (line 202). This needs to be replaced with an actual on-chain nonce fetch for the account — likely via an `eth_getTransactionCount` call or equivalent messenger action. CHOMP validates that the nonce matches.

## Step 2: Verify delegation

- [ ] **Caveat term encoding**: `#encodeCaveatTerms` does naive left-padded hex concatenation. Verify this matches the exact ABI encoding expected by the caveat enforcer contracts (may need proper ABI encoding via `@metamask/abi-utils` or similar).
- [ ] **Use `@metamask/smart-accounts-kit`**: The description mentions using `createDelegation` from `@metamask/smart-accounts-kit` to build the delegation. This package is not yet in the repo — once it lands, the delegation construction in `#verifyDelegation` should use it instead of manual assembly.
- [ ] **Import `ROOT_AUTHORITY` from `@metamask/delegation-controller`**: Currently defined locally as a constant. The delegation-controller has it but doesn't export it — once it's exported, import it instead.

## Step 3: Save delegation

- [ ] **Implement Authenticated User Storage save**: `#saveDelegation` is a stub (line 312-316). Needs the `@metamask/authenticated-user-storage` wrapper (PR currently open). Once available, save the signed delegation so CHOMP can read it at execution time via its internal VPC endpoint.

## Step 4: Register intents

- [ ] **Intent configuration**: The deposit/withdrawal intents are hardcoded with `mUSD` token symbol and `MAX_UINT256` allowance. These may need to come from config or be parameterised once requirements solidify.

## General

- [ ] **Resumability**: `upgradeAccount` runs all steps sequentially. If it fails mid-way and is retried, steps 0 and 2-4 will re-run from scratch. Consider checking persisted state at the start of each step to skip already-completed work (step 1 already does this via `getUpgrade`).
- [ ] **`MoneyAccountController:getMoneyAccount`**: This action is declared in `AllowedActions` but not currently used. It was included anticipating the controller may need to look up account details. Remove if not needed, or use it to validate the address before starting.
- [ ] **`#saveDelegation` unused `_chainId` parameter**: Will be needed once the stub is implemented — the storage call will likely need it.
