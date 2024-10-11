import { query } from '@metamask/controller-utils';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';

import type { UserOperationMetadata, UserOperationReceipt } from '../types';
import { UserOperationStatus } from '../types';
import type { UserOperationControllerMessenger } from '../UserOperationController';
import * as BundlerHelper from './Bundler';
import { PendingUserOperationTracker } from './PendingUserOperationTracker';

const CHAIN_ID_MOCK = '0x5';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const USER_OPERATION_ID_MOCK = 'testUserOperationId';
const BUNDLER_URL_MOCK = 'http://test.com';
const BLOCK_NUMBER_MOCK = '0x456';

const USER_OPERATION_METADATA_MOCK = {
  bundlerUrl: BUNDLER_URL_MOCK,
  chainId: CHAIN_ID_MOCK,
  hash: '0x123',
  id: USER_OPERATION_ID_MOCK,
  status: UserOperationStatus.Submitted,
} as UserOperationMetadata;

const USER_OPERATION_RECEIPT_MOCK = {
  actualGasCost: '0x2A',
  actualGasUsed: '0x2B',
  success: true,
  receipt: {
    blockHash: '0x2C',
    transactionHash: '0x2D',
  },
} as UserOperationReceipt;

const BLOCK_MOCK = {
  baseFeePerGas: '0x3A',
};

jest.mock('./Bundler');

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

/**
 * Creates a mock user operation messenger.
 * @returns The mock user operation messenger.
 */
function createMessengerMock() {
  return {
    call: jest.fn(),
    registerInitialEventPayload: jest.fn(),
  } as unknown as jest.Mocked<UserOperationControllerMessenger>;
}

/**
 * Creates a mock bundler.
 * @returns The mock bundler.
 */
function createBundlerMock() {
  return {
    getUserOperationReceipt: jest.fn(),
  } as unknown as jest.Mocked<BundlerHelper.Bundler>;
}

describe('PendingUserOperationTracker', () => {
  const messengerMock = createMessengerMock();
  const bundlerMock = createBundlerMock();
  const queryMock = jest.mocked(query);

  /**
   * Simulate the scenario where a user operation is confirmed.
   * @param beforeCallback - An optional callback to execute before the scenario is run.
   * @param overrideReceipt - An optional receipt to override the default mock receipt.
   */
  async function onConfirmedUserOperation(
    beforeCallback?: (
      pendingUserOperationTracker: PendingUserOperationTracker,
    ) => void,
    overrideReceipt?: Partial<UserOperationReceipt> | undefined,
  ) {
    const pendingUserOperationTracker = new PendingUserOperationTracker({
      getUserOperations: () => [{ ...USER_OPERATION_METADATA_MOCK }],
      messenger: messengerMock,
    });

    bundlerMock.getUserOperationReceipt.mockResolvedValueOnce({
      ...USER_OPERATION_RECEIPT_MOCK,
      ...(overrideReceipt ?? {}),
    });

    queryMock.mockResolvedValueOnce(BLOCK_MOCK);

    beforeCallback?.(pendingUserOperationTracker);

    await pendingUserOperationTracker._executePoll({
      networkClientId: NETWORK_CLIENT_ID_MOCK,
    });
  }

  /**
   * Simulate the scenario where a user operation fails.
   * @param beforeCallback - An optional callback to execute before the scenario is run.
   */
  async function onFailedUserOperation(
    beforeCallback?: (
      pendingUserOperationTracker: PendingUserOperationTracker,
    ) => void,
  ) {
    const pendingUserOperationTracker = new PendingUserOperationTracker({
      getUserOperations: () => [{ ...USER_OPERATION_METADATA_MOCK }],
      messenger: messengerMock,
    });

    bundlerMock.getUserOperationReceipt.mockResolvedValueOnce({
      ...USER_OPERATION_RECEIPT_MOCK,
      success: false,
    });

    beforeCallback?.(pendingUserOperationTracker);

    await pendingUserOperationTracker._executePoll({
      networkClientId: NETWORK_CLIENT_ID_MOCK,
    });
  }

  beforeEach(() => {
    jest.spyOn(BundlerHelper, 'Bundler').mockReturnValue(bundlerMock);

    messengerMock.call.mockReturnValue({
      blockTracker: { getCurrentBlock: () => BLOCK_NUMBER_MOCK },
      configuration: { chainId: CHAIN_ID_MOCK },
      provider: {},
    } as unknown as ReturnType<NetworkControllerGetNetworkClientByIdAction['handler']>);
  });

  describe('_executePoll', () => {
    it('does nothing if no pending transactions on same chain', async () => {
      const pendingUserOperationTracker = new PendingUserOperationTracker({
        getUserOperations: () => [
          {
            ...USER_OPERATION_METADATA_MOCK,
            status: UserOperationStatus.Submitted,
            chainId: '0x6',
          },
          {
            ...USER_OPERATION_METADATA_MOCK,
            status: UserOperationStatus.Confirmed,
          },
        ],
        messenger: messengerMock,
      });

      await pendingUserOperationTracker._executePoll({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      expect(bundlerMock.getUserOperationReceipt).not.toHaveBeenCalled();
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('skips transactions if no hash or bundler URL', async () => {
      const pendingUserOperationTracker = new PendingUserOperationTracker({
        getUserOperations: () => [
          {
            ...USER_OPERATION_METADATA_MOCK,
            status: UserOperationStatus.Submitted,
            hash: null,
          },
          {
            ...USER_OPERATION_METADATA_MOCK,
            status: UserOperationStatus.Confirmed,
            bundlerUrl: null,
          },
        ],
        messenger: messengerMock,
      });

      await pendingUserOperationTracker._executePoll({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      expect(bundlerMock.getUserOperationReceipt).not.toHaveBeenCalled();
      expect(queryMock).not.toHaveBeenCalled();
    });

    // eslint-disable-next-line jest/expect-expect
    it('does not throw if error while checking user operation', async () => {
      const pendingUserOperationTracker = new PendingUserOperationTracker({
        getUserOperations: () => [
          {
            ...USER_OPERATION_METADATA_MOCK,
          },
        ],
        messenger: messengerMock,
      });

      bundlerMock.getUserOperationReceipt.mockRejectedValueOnce(
        new Error('Test Error'),
      );

      await pendingUserOperationTracker._executePoll({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });
    });

    // eslint-disable-next-line jest/expect-expect
    it('does not throw if no user operation receipt', async () => {
      const pendingUserOperationTracker = new PendingUserOperationTracker({
        getUserOperations: () => [
          {
            ...USER_OPERATION_METADATA_MOCK,
          },
        ],
        messenger: messengerMock,
      });

      bundlerMock.getUserOperationReceipt.mockResolvedValueOnce(undefined);

      await pendingUserOperationTracker._executePoll({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });
    });

    it('queries bundler using eth_getUserOperationReceipt RPC method', async () => {
      const pendingUserOperationTracker = new PendingUserOperationTracker({
        getUserOperations: () => [
          {
            ...USER_OPERATION_METADATA_MOCK,
          },
        ],
        messenger: messengerMock,
      });

      await pendingUserOperationTracker._executePoll({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      expect(bundlerMock.getUserOperationReceipt).toHaveBeenCalledTimes(1);
      expect(bundlerMock.getUserOperationReceipt).toHaveBeenCalledWith(
        USER_OPERATION_METADATA_MOCK.hash,
      );
    });

    describe('on confirmed user operation', () => {
      it('emits confirmed event', async () => {
        const listener = jest.fn();

        await onConfirmedUserOperation(
          (pendingUserOperationTracker: PendingUserOperationTracker) => {
            pendingUserOperationTracker.hub.on(
              'user-operation-confirmed',
              listener,
            );
          },
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
          ...USER_OPERATION_METADATA_MOCK,
          actualGasCost: USER_OPERATION_RECEIPT_MOCK.actualGasCost,
          actualGasUsed: USER_OPERATION_RECEIPT_MOCK.actualGasUsed,
          baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
          status: UserOperationStatus.Confirmed,
          transactionHash: USER_OPERATION_RECEIPT_MOCK.receipt.transactionHash,
        });
      });

      it('emits update event', async () => {
        const listener = jest.fn();

        await onConfirmedUserOperation(
          (pendingUserOperationTracker: PendingUserOperationTracker) => {
            pendingUserOperationTracker.hub.on(
              `user-operation-updated`,
              listener,
            );
          },
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
          ...USER_OPERATION_METADATA_MOCK,
          actualGasCost: USER_OPERATION_RECEIPT_MOCK.actualGasCost,
          actualGasUsed: USER_OPERATION_RECEIPT_MOCK.actualGasUsed,
          baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
          status: UserOperationStatus.Confirmed,
          transactionHash: USER_OPERATION_RECEIPT_MOCK.receipt.transactionHash,
        });
      });

      it('normalizes given gas values', async () => {
        const listener = jest.fn();

        const actualGasCostInNumber = 5000;
        const actualGasUsedInNumber = 3000;

        const actualGasCostInHex = '0x1388';
        const actualGasUsedInHex = '0xbb8';

        await onConfirmedUserOperation(
          (pendingUserOperationTracker: PendingUserOperationTracker) => {
            pendingUserOperationTracker.hub.on(
              'user-operation-confirmed',
              listener,
            );
          },
          {
            actualGasCost: actualGasCostInNumber,
            actualGasUsed: actualGasUsedInNumber,
          },
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            actualGasCost: actualGasCostInHex,
            actualGasUsed: actualGasUsedInHex,
          }),
        );
      });
    });

    describe('on failed user operation', () => {
      it('emits failed event', async () => {
        const listener = jest.fn();

        await onFailedUserOperation(
          (pendingUserOperationTracker: PendingUserOperationTracker) => {
            pendingUserOperationTracker.hub.on(
              'user-operation-failed',
              listener,
            );
          },
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          {
            ...USER_OPERATION_METADATA_MOCK,
            status: UserOperationStatus.Failed,
          },
          expect.objectContaining({
            message: 'User operation receipt has failed status',
          }),
        );
      });

      it('emits update event', async () => {
        const listener = jest.fn();

        await onFailedUserOperation(
          (pendingUserOperationTracker: PendingUserOperationTracker) => {
            pendingUserOperationTracker.hub.on(
              `user-operation-updated`,
              listener,
            );
          },
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
          ...USER_OPERATION_METADATA_MOCK,
          status: UserOperationStatus.Failed,
        });
      });
    });
  });
});
