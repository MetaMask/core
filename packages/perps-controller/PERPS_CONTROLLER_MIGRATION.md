# PerpsController Migration Guide

## Overview

This package was migrated from the MetaMask Mobile codebase to enable code sharing
across platforms. This document tracks the migration status and remaining work.

## Migration History

- **Source**: `metamask-mobile/app/components/UI/Perps/`
- **Target**: `@metamask/perps-controller`
- **Status**: Core functionality migrated, tests partially migrated

## Architecture

- Dependency injection pattern for platform abstraction
- Platform-specific services injected at runtime
- Core business logic is platform-agnostic

## Current Test Coverage

### Migrated Tests (19 files)

| Test File | Coverage Area |
|-----------|---------------|
| PerpsController.test.ts | Controller lifecycle |
| selectors.test.ts | State selectors |
| tpslValidation.test.ts | TP/SL validation |
| hyperLiquidAdapter.test.ts | SDK adaptation |
| hyperLiquidValidation.test.ts | Input validation |
| marketUtils.test.ts | Market calculations |
| marketDataTransform.test.ts | Data transformation |
| orderCalculations.test.ts | Order math |
| marginUtils.test.ts | Margin calculations |
| pnlCalculations.test.ts | P&L calculations |
| positionCalculations.test.ts | Position math |
| orderBookGrouping.test.ts | Order book processing |
| orderUtils.test.ts | Order utilities |
| sortMarkets.test.ts | Market sorting |
| amountConversion.test.ts | Amount conversion |
| idUtils.test.ts | ID utilities |
| time.test.ts | Time formatting |
| wait.test.ts | Async utilities |
| stringParseUtils.test.ts | String parsing |

### Coverage Statistics

- **Utilities**: ~80% coverage (strongest)
- **Selectors**: ~98% coverage
- **Controller**: ~13% coverage (needs improvement)
- **Services**: ~8% coverage (needs improvement)
- **Providers**: ~1% coverage (needs improvement)

## Remaining Work

### Tests That Cannot Be Migrated (Mobile-Specific)

These tests remain in metamask-mobile due to platform dependencies:

| Test File | Dependency |
|-----------|------------|
| HyperLiquidSubscriptionService.test.ts | SDKConnect, Sentry |
| TradingService.test.ts | Mobile orchestration |
| formatUtils.test.ts | i18n (strings.perps.*) |
| translatePerpsError.test.ts | i18n strings |
| PerpsConnectionManager.test.ts | Redux integration |
| tokenIconUtils.test.ts | Image assets |
| textUtils.test.ts | i18n |
| Hook tests (~70 files) | React Native |

### Coverage Improvement Priorities

#### High Priority

1. **PerpsController.test.ts** - Expand controller method tests
2. **TradingService** - Add Core-compatible tests
3. **AccountService** - Add account management tests

#### Medium Priority

4. **MarketDataService** - Market data handling tests
5. **HyperLiquidProvider** - Provider integration tests
6. **DataLakeService** - Data lake interaction tests

#### Low Priority

7. **EligibilityService** - Eligibility check tests
8. **DepositService** - Deposit flow tests
9. **RewardsIntegrationService** - Rewards tests

## Contributing

When adding tests:

1. Avoid Mobile-specific dependencies (i18n, React Native, SDKConnect)
2. Use dependency injection for platform services
3. Follow existing test patterns in `src/utils/*.test.ts`
4. Run `yarn workspace @metamask/perps-controller test` to verify
