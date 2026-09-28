import type { TraceCallback } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import { EventEmitter } from 'events';
import { cloneDeep } from 'lodash-es';

import type { TransactionLifecycleRequest } from '../src/lifecycle/types.js';
import type {
  TransactionControllerMessenger,
  TransactionControllerState,
} from '../src/TransactionController.js';
import type { TransactionMeta } from '../src/types.js';
import { TransactionStatus, TransactionType } from '../src/types.js';

export const ACTION_ID_MOCK = 'test-action-id';
export const CHAIN_ID_MOCK = '0x1' as Hex;
export const FROM_MOCK = '0x1234567890123456789012345678901234567890' as Hex;
export const NETWORK_CLIENT_ID_MOCK = 'mainnet';
export const NONCE_MOCK = 1;
export const TO_MOCK = '0x2234567890123456789012345678901234567890' as Hex;
export const TRANSACTION_HASH_MOCK = '0xhash';
export const TRANSACTION_ID_MOCK = 'test-transaction-id';

/** Handles for driving and observing a mocked lifecycle request. */
export type LifecycleMocks = {
  /** Read the transaction as currently held by the mocked controller state. */
  getTransaction: () => TransactionMeta;
  /** Resolve a pending `${id}:finished` wait with the given metadata. */
  finishTransaction: (transactionMeta?: TransactionMeta) => void;
  /**
   * The messenger `call` mock.
   *
   * Exposed as a handle so tests do not reference it off the messenger, which
   * would trip the `unbound-method` lint rule.
   */
  messengerCall: jest.Mock;
  /** The messenger `publish` mock. */
  messengerPublish: jest.Mock;
  /** Release lock returned by `getNonceLock`. */
  releaseNonce: jest.Mock;
  /** The request passed to lifecycle stage functions. */
  request: TransactionLifecycleRequest;
  /** Overwrite the transaction held by the mocked controller state. */
  setTransaction: (transactionMeta: TransactionMeta) => void;
};

/**
 * Build transaction metadata with sensible unapproved defaults.
 *
 * @param overrides - Properties to merge over the defaults.
 * @returns The transaction metadata.
 */
export function buildTransactionMeta(
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta {
  return {
    chainId: CHAIN_ID_MOCK,
    id: TRANSACTION_ID_MOCK,
    networkClientId: NETWORK_CLIENT_ID_MOCK,
    status: TransactionStatus.unapproved,
    time: 1,
    txParams: {
      from: FROM_MOCK,
      gas: '0x5208',
      gasPrice: '0x1',
      to: TO_MOCK,
      value: '0x0',
    },
    type: TransactionType.simpleSend,
    ...overrides,
  };
}

/**
 * Build a lifecycle request whose dependencies are Jest mocks.
 *
 * `updateTransactionInternal` and `updateTransaction` are backed by an
 * in-memory store, so stages observe their own writes and tests can assert on
 * the resulting metadata via `getTransaction()` as well as on the mock calls.
 *
 * @param options - Fixture options.
 * @param options.transactionMeta - Initial transaction metadata.
 * @returns Handles for driving and observing the request.
 */
export function buildLifecycleMocks({
  transactionMeta = buildTransactionMeta(),
}: { transactionMeta?: TransactionMeta } = {}): LifecycleMocks {
  let current = transactionMeta;

  const internalEvents = new EventEmitter();
  const messengerCall = jest.fn();
  const messengerPublish = jest.fn();
  const releaseNonce = jest.fn();

  const getTransaction = (): TransactionMeta => current;

  const setTransaction = (newTransactionMeta: TransactionMeta): void => {
    current = newTransactionMeta;
  };

  const request: TransactionLifecycleRequest = {
    addTransactionRequest: {
      options: {
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        requireApproval: false,
      },
      txParams: cloneDeep(transactionMeta.txParams),
    },
    constructorOptions: {
      disableSwaps: false,
      hooks: {
        afterAdd: jest.fn().mockResolvedValue({}),
        beforePublish: jest.fn().mockResolvedValue(true),
        beforeSign: jest.fn().mockResolvedValue(true),
        publish: jest
          .fn()
          .mockResolvedValue({ transactionHash: TRANSACTION_HASH_MOCK }),
      },
      trace: ((_options: unknown, callback?: () => unknown) =>
        callback?.()) as TraceCallback,
    },
    delegationAddressPromise: Promise.resolve(undefined),
    dependencies: {
      addTransactionBatch: jest.fn(),
      failTransaction: jest.fn(),
      fetchGasFeeTokens: jest.fn().mockResolvedValue([]),
      gasFeeFlows: [],
      getNonceLock: jest
        .fn()
        .mockResolvedValue({
          nextNonce: NONCE_MOCK,
          releaseLock: releaseNonce,
        }),
      getState: jest.fn(
        (): TransactionControllerState => ({
          batchTransactionCounts: {},
          lastFetchedBlockNumbers: {},
          methodData: {},
          submitHistory: [],
          transactionBatches: [],
          transactions: [current],
        }),
      ),
      hasNetworkClient: jest.fn().mockReturnValue(true),
      internalEvents,
      layer1GasFeeFlows: [],
      messenger: {
        call: messengerCall,
        publish: messengerPublish,
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
      } as unknown as TransactionControllerMessenger,
      publishTransaction: jest.fn().mockResolvedValue(TRANSACTION_HASH_MOCK),
      skipSimulationTransactionIds: new Set<string>(),
      updateGasEstimate: jest.fn().mockResolvedValue(undefined),
      updateSimulationData: jest.fn().mockResolvedValue(undefined),
      updateState: jest.fn(),
      updateTransaction: jest.fn((newTransactionMeta: TransactionMeta) => {
        current = cloneDeep(newTransactionMeta);
      }),
      updateTransactionInternal: jest.fn((_options, update) => {
        const draft = cloneDeep(current);
        current = update(draft) ?? draft;
        return current;
      }),
    },
    lifecycle: {},
    transactionMeta,
  };

  const finishTransaction = (
    finishedTransactionMeta: TransactionMeta = current,
  ): void => {
    current = finishedTransactionMeta;
    internalEvents.emit(
      `${transactionMeta.id}:finished`,
      finishedTransactionMeta,
    );
  };

  return {
    finishTransaction,
    getTransaction,
    messengerCall,
    messengerPublish,
    releaseNonce,
    request,
    setTransaction,
  };
}
