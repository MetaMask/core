## Explanation

Money Account API requests were made without a profile JWT, so the Cloudflare
authorizer could only apply IP-based rate limiting. This could cause unrelated
users behind the same IP address to share a rate-limit bucket.

This change integrates `MoneyAccountApiDataService` with the existing
`AuthenticationController:getBearerToken` messenger action. The service now
adds `Authorization: Bearer <token>` to position, interest, history, and rate
history requests when a profile token is available.

Authentication is best effort to preserve existing behavior for locked or
signed-out wallets. If token retrieval fails or returns an empty token, the
request proceeds without the Authorization header and the Cloudflare worker
falls back to IP-based rate limiting. HTTP 403 responses are not retried, while
HTTP 429 responses retain the existing retry behavior.

Tests cover authenticated requests across all four endpoints, unavailable and
empty-token fallbacks, and the 403/429 retry behavior.

The repository also includes a standalone smoke-test script that sends a
supplied profile JWT to the Money Account positions endpoint and prints a
shareable request/response transcript with the JWT redacted.

## References

- Related authorizer:
  https://github.com/consensys-vertical-apps/va-mmcx-cloudflare-authorizer
- Integration notes: `MONEY_ACCOUNT_API_AUTH_INTEGRATION.md`

## Checklist

- [x] I've updated the test suite for new or updated code as appropriate
- [x] I've updated documentation (JSDoc, Markdown, etc.) for new or updated code as appropriate
- [x] I've communicated my changes to consumers by [updating changelogs for packages I've changed](https://github.com/MetaMask/core/tree/main/docs/processes/updating-changelogs.md)
- [ ] I've introduced [breaking changes](https://github.com/MetaMask/core/tree/main/docs/processes/breaking-changes.md) in this PR and have prepared draft pull requests for clients and consumer packages to resolve them
