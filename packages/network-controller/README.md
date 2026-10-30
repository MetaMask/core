# `@metamask/network-controller`

Provides an interface to the currently selected network via a MetaMask-compatible provider object.

## Installation

`yarn add @metamask/network-controller`

or

`npm install @metamask/network-controller`

## RPC request timeouts

Each RPC HTTP attempt times out after 5,000 milliseconds by default, including
reading and decoding the response body. A timeout aborts the underlying request
and raises an error with code `ETIMEDOUT`, which follows the existing retry and
circuit-breaker policy. Retries and backoff can make the total RPC call take
longer than one timeout interval.

Set `requestTimeout` through the `NetworkController` constructor's
`getRpcServiceOptions` callback to allow slower endpoints, for example:

```typescript
getRpcServiceOptions: () => ({ requestTimeout: 15_000 });
```

The duration must be finite, greater than zero, and at most 2,147,483,647
milliseconds. Request cancellation signals are preserved; each retry gets its
own timeout and abort controller.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
