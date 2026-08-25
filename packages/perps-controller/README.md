# `@metamask/perps-controller`

Controller for perpetual trading functionality in MetaMask.

## Installation

`yarn add @metamask/perps-controller`

or

`npm install @metamask/perps-controller`

## Usage

```typescript
import { PerpsController } from '@metamask/perps-controller';
```

Chase orders are client-managed post-only strategies. Use
`controller.getChaseOrders()` to read retained lifecycle snapshots and
`controller.suspendChaseOrders()` when the creating client leaves the
foreground; suspension stops repricing while leaving the latest child order
resting. Cancel a Chase through `cancelOrder` with its stable strategy handle
and `orderType: 'chase'`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
