# SubscriptionController benefits implementation plan

Status: Step 5 complete — awaiting review

This plan adds support for fetching and persisting the response from
`POST /v1/benefits` while keeping the implementation additive and localized.
Existing changes in the polling controller and subscription controller will be
left intact.

## Working decisions

- The public controller method will be named `getBenefits`.
- Benefits eligibility is product-scoped: the user must have a subscription
  containing `PRODUCT_TYPES.MONEY_ACCOUNT_PLUS` (`'money_account_plus'`) whose
  status is included in the existing `ACTIVE_SUBSCRIPTION_STATUSES` constant.
  `active`, `trialing`, and `provisional` therefore count as active; payment
  failure, paused, and cancelled statuses do not. An active subscription for a
  different product does not satisfy the benefits precondition.
- `SubscriptionControllerErrorMessage.UserNotSubscribed` will be reused for
  both local precondition failures and a valid ineligible API response.
- The service will treat the ineligible response as valid. It includes
  `eligible: false`, `billingPeriodId: null`, and a required `products` object
  whose unavailable values are `null` or omitted. The controller will clear
  persisted benefits so stale eligible benefits cannot remain, then reject the
  public call with `UserNotSubscribed`.
- Lifecycle-triggered benefit refreshes will be best-effort. A benefits
  transport failure must not make a successful subscription or cancellation
  operation fail. Direct calls to `getBenefits` will still reject on errors.
- There is currently no exhaustion event in this package. `getBenefits` will be
  the explicit refresh point for consumers that detect exhaustion, and the
  existing polling loop will refresh benefits again on its next cycle.

## Step 1: Add the benefits contract and test fixtures

Files:

- `packages/subscription-controller/src/types.ts`
- `packages/subscription-controller/src/SubscriptionService-structs.ts`
- `packages/subscription-controller/src/constants.ts`
- `packages/subscription-controller/src/SubscriptionService.test.ts`
- `packages/subscription-controller/src/SubscriptionController.test.ts`

Substeps:

- [x] Add a single benefits response type with a boolean `eligible` field and
      nullable `billingPeriodId`.
- [x] Model `swaps`, `perps`, and `predict` with the exact API field names and
      wire types, including `billingPeriodId` and required products for both
      eligibility values. Keep `feeBips` and `builderFeeBips` as nullable strings.
- [x] Add a Superstruct validator with required products for both eligibility
      values.
- [x] Add `SubscriptionServiceErrorMessage.FailedToGetBenefits`.
- [x] Add shared eligible-benefits fixtures and a
      `MONEY_ACCOUNT_PLUS` subscription fixture to the service and controller
      tests.

Review checkpoint: the response type and validator reject malformed payloads
while accepting both documented API responses. The Step 1 tests and package
build pass.

## Step 2: Implement the service endpoint

Files:

- `packages/subscription-controller/src/SubscriptionService.ts`
- `packages/subscription-controller/src/types.ts`
- `packages/subscription-controller/src/SubscriptionService-method-action-types.ts`

Substeps:

- [x] Add `getBenefits()` to `ISubscriptionService`.
- [x] Implement the method using the existing authenticated `#fetchJson`
      helper with the path `benefits`, method `POST`, and an empty `{}` body.
- [x] Validate the response with the new Superstruct validator.
- [x] Add the method to the service messenger exposure list.
- [x] Regenerate the service action types; do not hand-edit generated output.
- [x] Add tests for successful eligible and ineligible responses.
- [x] Add tests for the exact `/v1/benefits` URL, POST method, empty body, and
      auth headers.
- [x] Add coverage for network, non-2xx, authentication, and malformed
      response errors.

Review checkpoint: calling the service directly performs exactly one
authenticated request and returns the validated raw response.

## Step 3: Add persisted controller state and the public method

Files:

- `packages/subscription-controller/src/SubscriptionController.ts`
- `packages/subscription-controller/src/types.ts`
- `packages/subscription-controller/src/SubscriptionController-method-action-types.ts`
- `packages/subscription-controller/src/index.ts`

Substeps:

- [x] Add optional `benefits` state with a default of `undefined`.
- [x] Mark the field as persisted in the controller metadata and exclude it
      from logs/debug snapshots as appropriate.
- [x] Add `#assertIsActiveMoneyAccountPlusSubscriber()` without changing the
      behavior of the existing subscription assertion helpers.
- [x] Implement `getBenefits()` so the active-subscriber assertion happens
      before the service messenger call.
- [x] Ensure users without an active `MONEY_ACCOUNT_PLUS` subscription have
      their benefits state cleared, receive `UserNotSubscribed`, and cause zero
      `SubscriptionService:getBenefits` calls, including users with an active
      subscription for another product.
- [x] Persist the flattened benefits state for eligible responses and clear it
      before rejecting the API’s `{ eligible: false }` branch with
      `UserNotSubscribed`.
- [x] Expose the method through the controller messenger list.
- [x] Regenerate the controller action types.
- [x] Export the new public types and action type from `src/index.ts`.

Review checkpoint: direct controller calls have the correct return/state/error
behavior, including no service call for every non-active status.

## Step 4: Wire the new service action through wallet initialization

Files:

- `packages/wallet/src/initialization/instances/subscription-controller/subscription-controller.ts`
- `packages/wallet/src/initialization/instances/subscription-controller/subscription-controller.test.ts`

Substeps:

- [x] Add `SubscriptionService:getBenefits` to the controller messenger
      delegation list.
- [x] Add a wallet-level test proving that
      `SubscriptionController:getBenefits` reaches the service.
- [x] Confirm no changes are needed in the subscription-service
      initialization, since it already delegates authentication actions.

Review checkpoint: the method works through the production wallet messenger,
not only through the package-level test messenger.

## Step 5: Add lifecycle refreshes

Primary file:

- `packages/subscription-controller/src/SubscriptionController.ts`

Substeps:

- [x] Add one small private `#refreshBenefitsIfActive()` helper whose gate
      specifically checks for an active `MONEY_ACCOUNT_PLUS` subscription.
- [x] Have it clear local benefits and return without an API call when no
      active `MONEY_ACCOUNT_PLUS` subscription remains.
- [x] Have it call `getBenefits()` for eligible users and handle lifecycle
      refresh failures without failing the primary operation.
- [x] Invoke it after `getSubscriptions()` applies the latest entitlement
      state, but only refresh when an active `MONEY_ACCOUNT_PLUS` subscription is
      present. This covers explicit entitlement refreshes and the existing polling
      loop.
- [x] Keep the crypto subscribe flow’s existing final `getSubscriptions()`;
      the new hook will refresh benefits after a `MONEY_ACCOUNT_PLUS` subscription
      is created, while a Shield-only subscription will not trigger the endpoint.
- [x] Invoke it after `cancelSubscription()` and `unCancelSubscription()`
      update local subscription state, subject to the same
      `MONEY_ACCOUNT_PLUS` gate.
- [x] Do not add a separate period timer. The existing polling cycle will
      fetch benefits after the backend reports the next period for an active
      `MONEY_ACCOUNT_PLUS` subscription.
- [x] Keep card checkout unchanged because it returns before the subscription
      is created; the next entitlement refresh will hydrate benefits if the
      resulting subscription is `MONEY_ACCOUNT_PLUS`.
- [x] Document and test that a consumer detecting `exhausted: true` can call
      `getBenefits()` for an explicit refresh. Do not add a speculative
      exhaustion event without an existing producer.

Review checkpoint: subscribe, cancellation, entitlement polling, and
non-active transitions produce the intended benefit refresh/no-request
behavior.

## Step 6: Expand controller tests around refresh behavior

File:

- `packages/subscription-controller/src/SubscriptionController.test.ts`

Substeps:

- [ ] Verify default and supplied benefits state.
- [ ] Verify `clearState()` removes persisted benefits.
- [ ] Verify successful fetch stores and returns eligible benefits.
- [ ] Verify API ineligibility clears stale eligible data and throws
      `UserNotSubscribed`.
- [ ] Parameterize inactive-status cases and assert that the service mock is
      never called.
- [ ] Assert that an active subscription for a different product, including
      Shield, does not satisfy the gate or call the service.
- [ ] Verify refresh after a successful `MONEY_ACCOUNT_PLUS` crypto
      subscription.
- [ ] Verify refresh after `MONEY_ACCOUNT_PLUS` cancellation and uncancellation.
- [ ] Verify polling/entitlement refresh re-fetches benefits.
- [ ] Verify a changed subscription period is covered by the polling refresh.
- [ ] Verify exhausted product fields are stored and can be refreshed through
      the public method.
- [ ] Verify a benefits request failure does not undo the primary subscription
      or cancellation result when triggered internally.

Review checkpoint: all requested lifecycle behaviors are covered by observable
call counts, state assertions, and error assertions.

## Step 7: Documentation and validation

Files:

- `packages/subscription-controller/CHANGELOG.md`

Substeps:

- [ ] Add an `Unreleased` entry describing the new public benefits method,
      persisted state, and active-subscriber guard.
- [ ] Run the subscription-controller tests.
- [ ] Run the wallet subscription-controller test.
- [ ] Build the affected package(s) to verify generated declarations.
- [ ] Run lint/type checks for edited files.
- [ ] Run `yarn changelog:validate`.

Review checkpoint: tests, declarations, linting, and changelog validation pass.

## Deferred refactors

These should be separate follow-up changes after the feature is working:

- [ ] Deduplicate benefit requests caused by nested
      `getSubscriptions()` calls during subscription flows.
- [ ] Add in-flight request deduplication or throttling if polling causes too
      many `/v1/benefits` requests.
- [ ] Consolidate the active-subscriber predicate with existing subscription
      assertion helpers where doing so does not change their semantics.
- [ ] Extract subscription-state comparison/update logic if the new lifecycle
      hook makes `getSubscriptions()` difficult to review.
- [ ] Extract shared benefit product fields if additional benefit products are
      introduced.
