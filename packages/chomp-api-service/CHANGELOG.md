# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- refactor: add `.js` import extensions to Earn joint packages ([#9640](https://github.com/MetaMask/core/pull/9640))
- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))

## [4.0.0]

### Added

- Add `getAssociatedAddresses` method, exposed as the `ChompApiService:getAssociatedAddresses` messenger action, which fetches the active address associations of the authenticated profile via `GET /v1/auth/address` ([#9387](https://github.com/MetaMask/core/pull/9387))
  - Also adds the `ProfileAddressEntry` type describing each returned entry and the `ChompApiServiceGetAssociatedAddressesAction` type
  - Returned addresses are parsed into canonical lowercase form, entries are guaranteed to have `status: 'active'`, and results are never served from cache
  - The query cache key is scoped to the authenticated profile via a SHA-256 digest of the bearer token, so concurrent calls only share an in-flight request when they are for the same profile and one profile's associations are never cached under another's key

### Changed

- **BREAKING:** `associateAddress` now throws an `HttpError` on a 409 response instead of returning the parsed body ([#9387](https://github.com/MetaMask/core/pull/9387))
  - A 409 from `POST /v1/auth/address` indicates the address is associated with a _different_ profile; the previous handling attempted to parse the error body as an association result and failed with a confusing validation error. An address already associated with the authenticated profile is reported via a 201 response with `status: 'active'`, which is unchanged.
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.3.0` ([#8774](https://github.com/MetaMask/core/pull/8774), [#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/base-data-service` from `^0.1.2` to `^0.1.3` ([#8799](https://github.com/MetaMask/core/pull/8799))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [3.1.0]

### Changed

- `ChompApiService` no longer retries HTTP requests that fail with a 4xx response (other than 429), since those responses indicate the request itself is at fault and will not be resolved by re-issuing it. 5xx, 429, and non-HTTP errors (network/timeout) continue to be retried. Consumers can still override this by passing a `retryFilterPolicy` via `policyOptions`. ([#8621](https://github.com/MetaMask/core/pull/8621))

## [3.0.1]

### Changed

- Bump `@metamask/base-data-service` from `^0.1.1` to `^0.1.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [3.0.0]

### Changed

- **BREAKING:** update types and methods of chomp-api-service to properly reflect the API ([#8635](https://github.com/MetaMask/core/pull/8635))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))

## [2.0.0]

### Changed

- **BREAKING:** Change `AssociateAddressParams.timestamp` type from `string` to `number`. ([#8610](https://github.com/MetaMask/core/pull/8610))

## [1.0.0]

### Added

- Add `ChompApiService` ([#8413](https://github.com/MetaMask/core/pull/8413))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/chomp-api-service@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/chomp-api-service@3.1.0...@metamask/chomp-api-service@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/chomp-api-service@3.0.1...@metamask/chomp-api-service@3.1.0
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/chomp-api-service@3.0.0...@metamask/chomp-api-service@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/chomp-api-service@2.0.0...@metamask/chomp-api-service@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/chomp-api-service@1.0.0...@metamask/chomp-api-service@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/chomp-api-service@1.0.0
