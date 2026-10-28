import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  createMockInternalAccount,
  createMockMessengers,
  registerAssetsControllerActions,
} from './__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from './__fixtures__/mockTokenApi.js';
import { AssetsController } from './AssetsController.js';
import type {
  SnapBalanceFetchStatusUpdate,
  SnapDataSourceOptions,
} from './data-sources/SnapDataSource.js';
import { SnapDataSource } from './data-sources/SnapDataSource.js';
import type { ChainId } from './types.js';

/**
 * Covers how the controller surfaces per-account snap (non-EVM) balance fetch
 * failures in `assetsBalanceErrors` and exposes a manual retry. Lives outside
 * `AssetsController.test.ts`, which is already very large.
 */

const capturedOptions: SnapDataSourceOptions[] = [];

jest.mock('./data-sources/SnapDataSource.js', () => {
  const actual = jest.requireActual('./data-sources/SnapDataSource.js');
  class CapturingSnapDataSource extends actual.SnapDataSource {
    constructor(options: SnapDataSourceOptions) {
      super(options);
      capturedOptions.push(options);
    }
  }
  return { ...actual, SnapDataSource: CapturingSnapDataSource };
});

const BTC_MAINNET = 'bip122:000000000019d6689c085ae165831e93' as ChainId;
const BTC_TESTNET = 'bip122:000000000933ea01ad0ee984209779ba' as ChainId;

const ERROR = {
  status: 'unavailable' as const,
  error: 'the account has not been synchronized yet',
  attempts: 1,
  failedAt: 1_000,
  nextRetryAt: 31_000,
};

async function withController<ReturnValue>(
  fn: (args: {
    controller: AssetsController;
    emitStatus: (update: SnapBalanceFetchStatusUpdate) => void;
  }) => Promise<ReturnValue> | ReturnValue,
): Promise<ReturnValue> {
  capturedOptions.length = 0;
  const accounts = [
    createMockInternalAccount({
      id: 'btc-account',
      metadata: { name: 'Account 1' } as InternalAccount['metadata'],
    }),
  ];
  const { assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (messenger) =>
      registerAssetsControllerActions(messenger, {
        accounts,
        enabledNetworkMap: { eip155: { '1': true } },
        nativeAssetIdentifiers: {},
        remoteFeatureFlags: {},
      }),
  });
  const controller = new AssetsController({
    messenger: assetsControllerMessenger,
    queryApiClient: createTestApiClient(),
    isBasicFunctionality: (): boolean => true,
  });
  const options = capturedOptions[0];
  if (!options?.onBalanceFetchStatusChange) {
    throw new Error('SnapDataSource was not given a status callback');
  }
  const emitStatus = options.onBalanceFetchStatusChange;
  try {
    return await fn({ controller, emitStatus });
  } finally {
    controller.destroy();
  }
}

describe('AssetsController snap balance fetch errors', () => {
  it('passes a status callback to the SnapDataSource', async () => {
    await withController(({ controller }) => {
      expect(capturedOptions).toHaveLength(1);
      expect(controller.state.assetsBalanceErrors).toBeUndefined();
    });
  });

  it('records an unavailable status per account and chain', async () => {
    await withController(({ controller, emitStatus }) => {
      emitStatus({
        accountId: 'btc-account',
        chainIds: [BTC_MAINNET, BTC_TESTNET],
        error: ERROR,
      });

      expect(controller.state.assetsBalanceErrors).toStrictEqual({
        'btc-account': { [BTC_MAINNET]: ERROR, [BTC_TESTNET]: ERROR },
      });
    });
  });

  it('clears the status for the chains that recovered', async () => {
    await withController(({ controller, emitStatus }) => {
      emitStatus({
        accountId: 'btc-account',
        chainIds: [BTC_MAINNET, BTC_TESTNET],
        error: ERROR,
      });
      emitStatus({
        accountId: 'btc-account',
        chainIds: [BTC_TESTNET],
        error: null,
      });

      expect(controller.state.assetsBalanceErrors).toStrictEqual({
        'btc-account': { [BTC_MAINNET]: ERROR },
      });

      emitStatus({
        accountId: 'btc-account',
        chainIds: [BTC_MAINNET],
        error: null,
      });

      expect(controller.state.assetsBalanceErrors).toStrictEqual({});
    });
  });

  it('ignores a recovery for an account without an error', async () => {
    await withController(({ controller, emitStatus }) => {
      emitStatus({
        accountId: 'btc-account',
        chainIds: [BTC_MAINNET],
        error: null,
      });

      expect(controller.state.assetsBalanceErrors).toBeUndefined();
    });
  });

  it('does not persist the balance errors', async () => {
    await withController(({ controller, emitStatus }) => {
      emitStatus({
        accountId: 'btc-account',
        chainIds: [BTC_MAINNET],
        error: ERROR,
      });

      expect(controller.metadata.assetsBalanceErrors).toStrictEqual({
        persist: false,
        includeInStateLogs: true,
        includeInDebugSnapshot: true,
        usedInUi: true,
      });
    });
  });

  it('retrySnapBalances delegates to the SnapDataSource', async () => {
    const retrySpy = jest
      .spyOn(SnapDataSource.prototype, 'retryFailedAccounts')
      .mockResolvedValue(undefined);
    try {
      await withController(async ({ controller }) => {
        await controller.retrySnapBalances(['btc-account']);
        await controller.retrySnapBalances();

        expect(retrySpy).toHaveBeenNthCalledWith(1, ['btc-account']);
        expect(retrySpy).toHaveBeenNthCalledWith(2, undefined);
      });
    } finally {
      retrySpy.mockRestore();
    }
  });
});
