
# Core Monorepo — Worker Context

You are working in the MetaMask core monorepo (`@metamask/core-monorepo`). This is a Yarn workspaces monorepo containing shared packages used by MetaMask mobile and extension clients.

## Primary Focus: Perps Controller

The perps controller (`packages/perps-controller`) is the primary package for farmslot work. It implements perpetual futures trading via HyperLiquid (and extensible to MYX/other protocols).

### Key Paths

```
packages/perps-controller/
  src/
    PerpsController.ts          # Main controller (extends BaseController)
    providers/                   # HyperLiquidProvider, AggregatedPerpsProvider, MYXProvider
    services/                    # 12+ specialized services (Account, Trading, MarketData, etc.)
    utils/                       # Validation, formatting, calculations
    constants/                   # Protocol configs, chain IDs, endpoints
    types/                       # TypeScript type definitions
  tests/
    helpers/                     # Mock infrastructure (providerMocks, serviceMocks)
  e2e/                           # E2E validation scripts (real API, no mocks)
  jest.config.js                 # Coverage thresholds: branches 69%, functions 78%, lines 80%
```

### Architecture

- **Controller**: `PerpsController` extends `BaseController` (Redux-style state management)
- **Providers**: Protocol abstraction — `HyperLiquidProvider` first, extensible
- **Services**: `AccountService`, `TradingService`, `MarketDataService`, `DepositService`, `RewardsIntegrationService`, `HyperLiquidSubscriptionService`, etc.
- **State**: `PerpsControllerState` with markets, positions, orders, balances, subscriptions
- **WebSocket**: Real-time price/position/order updates via `HyperLiquidSubscriptionService`

### Build & Test

```bash
# Build the package
cd packages/perps-controller && yarn build:all

# Run tests (unit, all mocked)
yarn workspace @metamask/perps-controller test

# Run tests verbose
yarn workspace @metamask/perps-controller test:verbose

# Run single test file
NODE_OPTIONS=--experimental-vm-modules yarn jest packages/perps-controller/src/path/to/file.test.ts

# Build uses ts-bridge (not tsc directly)
yarn workspace @metamask/perps-controller build:all
```

### Exports

The package exposes subpath exports:
- `@metamask/perps-controller` — main controller, types, actions
- `@metamask/perps-controller/constants` — chain IDs, configs, endpoints
- `@metamask/perps-controller/types` — type definitions
- `@metamask/perps-controller/utils` — utility functions

## Validation — Headless (No Browser, No Simulator)

This is a pure Node.js package. No CDP, no browser, no simulator.

- **Unit tests**: `yarn workspace @metamask/perps-controller test --bail`
- **E2E tests**: `node packages/perps-controller/e2e/<scenario>.ts` (real API calls)
- **Lint**: `yarn lint` at monorepo root
- **Type check**: `yarn workspace @metamask/perps-controller build:all` (ts-bridge validates types)

## Monorepo Commands

```bash
# Install deps
yarn install --immutable

# Lint
yarn lint

# Build single package
yarn workspace @metamask/perps-controller build:all

# Build all
yarn build:all

# Run tests for a package
yarn workspace @metamask/perps-controller test
```
