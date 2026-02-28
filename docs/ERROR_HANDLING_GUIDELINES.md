# Error Handling Guidelines

This document defines recommended practices for handling errors
across MetaMask Core services and packages.

## Error categories

- Validation errors: invalid input, missing parameters
- Network errors: timeouts, unreachable services
- Dependency errors: upstream failures or unexpected responses
- Internal errors: unexpected states or logic failures

## General principles

- Fail fast on invalid input.
- Do not swallow errors silently.
- Preserve the original error context whenever possible.
- Avoid exposing sensitive implementation details.

## Error messages

- Messages should be clear and actionable.
- Prefer short descriptions over verbose logs.
- Do not include secrets, private keys, or tokens.
- Use consistent terminology across packages.

## Logging and propagation

- Log errors at the appropriate level (warn vs error).
- Attach contextual metadata (request ID, operation name).
- Propagate errors upward instead of converting everything to generic failures.

## Testing

- Add tests for expected failure cases.
- Assert both error type and message when applicable.
- Ensure errors remain stable across refactors.

Consistent error handling improves debuggability, reliability,
and the developer experience across the MetaMask Core ecosystem.
