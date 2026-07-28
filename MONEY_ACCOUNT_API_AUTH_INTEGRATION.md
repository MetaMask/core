# Money Account API profile JWT integration

`MoneyAccountApiDataService` should obtain the user's profile OIDC token through
the existing `AuthenticationController:getBearerToken` messenger action and send
it as:

```text
Authorization: Bearer <token>
```

## Integration path

1. In
   `packages/money-account-api-data-service/src/money-account-api-data-service.ts`,
   replace `AllowedActions = never` with a structural action contract:

   ```typescript
   type AuthenticationControllerGetBearerTokenAction = {
     type: 'AuthenticationController:getBearerToken';
     handler: (entropySourceId?: string) => Promise<string>;
   };
   ```

2. Add a private request-header helper that calls
   `AuthenticationController:getBearerToken` and returns the Authorization
   header.

3. Use the helper for all four API requests:

   - `fetchPositions`
   - `fetchInterest`
   - `fetchHistory`
   - `fetchRateHistory`

4. Treat authentication as best effort. If token retrieval fails, omit the
   Authorization header and continue with the request. This preserves existing
   behavior for locked or unsigned-in wallets; the Cloudflare worker then falls
   back to IP-based rate limiting. Do not send an empty or stale Bearer token,
   because invalid tokens are rejected with HTTP 403.

5. In each consuming application, delegate
   `AuthenticationController:getBearerToken` from the root messenger to the
   `MoneyAccountApiDataService` messenger.

6. Update service tests to cover:
   - A valid token is sent as `Authorization: Bearer <token>`.
   - A token retrieval failure still makes an unauthenticated request.
   - HTTP 403 is not retried; HTTP 429 remains retryable.

No changes are required in `MoneyAccountBalanceService`; authentication remains
an implementation detail of `MoneyAccountApiDataService`.

## Reference implementations

- Best-effort authentication:
  `packages/sentinel-api-service/src/sentinel-api-service.ts`
- Strict authentication:
  `packages/chomp-api-service/src/chomp-api-service.ts`
- Token provider:
  `packages/profile-sync-controller/src/controllers/authentication/AuthenticationController.ts`

## Authenticated request sample

Use the standalone smoke-test script with a profile JWT obtained from an
unlocked MetaMask client:

```bash
MONEY_ACCOUNT_JWT='<profile JWT>' \
MONEY_ACCOUNT_ADDRESS='0x...' \
yarn money-account-api:sample-request
```

Set `MONEY_ACCOUNT_API_URL` to override the default dev API URL. For example:

```bash
MONEY_ACCOUNT_API_URL='https://money.uat-api.cx.metamask.io' \
MONEY_ACCOUNT_JWT='<profile JWT>' \
MONEY_ACCOUNT_ADDRESS='0x...' \
yarn money-account-api:sample-request
```

The script requests `GET /v1/positions/{address}` and prints the HTTP request
and response as formatted JSON. The real JWT is sent in the Authorization
header but is always displayed as `Bearer <redacted>`, making the transcript
safe to share.
