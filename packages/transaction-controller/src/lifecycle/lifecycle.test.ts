import type { AccountsControllerState } from '@metamask/accounts-controller';
import { createDeferredPromise } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import { EventEmitter } from 'events';
import { cloneDeep } from 'lodash-es';

import type { TransactionMeta } from '../types.js';
import { TransactionStatus, TransactionType } from '../types.js';
import { prepareTransaction, serializeTransaction } from '../utils/prepare.js';
import { getChainId, rpcRequest } from '../utils/provider.js';
import { awaitApproval } from './approval.js';
import { approveTransaction } from './approve.js';
import { handleTransactionError } from './error.js';
import { finishTransaction } from './finish.js';
import { initTransaction } from './init.js';
import { abortTransactionSigning, signTransaction } from './sign.js';
import {
  cleanupTransaction,
  isTransactionApproving,
  startTransactionApproval,
} from './state.js';
import { submitTransaction } from './submit.js';
import type { TransactionLifecycleRequest } from './types.js';

jest.mock('../utils/prepare.js');
jest.mock('../utils/provider.js');

describe('Transaction lifecycle coordination', () => {
  beforeEach(() => {
    jest.mocked(serializeTransaction).mockReturnValue('0xsigned');
  });

  it('blocks external calldata to an internal EVM account using the current accounts state', async () => {
    const { request } = createRequest();
    const { to } = request.addTransactionRequest.txParams;
    jest.mocked(getChainId).mockReturnValue('0x1');

    jest.mocked(request.dependencies.messenger.call).mockReturnValue({
      internalAccounts: {
        accounts: {
          evm: { address: to, type: 'eip155:eoa' },
          solana: { address: 'solana-account', type: 'solana:data-account' },
        },
      },
    } as unknown as AccountsControllerState);

    await expect(
      initTransaction({
        addTransactionRequest: {
          options: {
            ...request.addTransactionRequest.options,
            origin: 'external-origin',
          },
          txParams: {
            ...request.addTransactionRequest.txParams,
            data: '0x1234',
          },
        },
        constructorOptions: request.constructorOptions,
        dependencies: { ...request.dependencies, hasNetworkClient: () => true },
      }),
    ).rejects.toThrow(
      'External transactions to internal accounts cannot include data',
    );
  });

  it('keeps the nonce locked through the swap balance read and releases it before publishing', async () => {
    const { request, releaseNonce, publish, events } = createRequest();
    request.transactionMeta.type = TransactionType.swap;
    const balance = createDeferredPromise<string>();
    jest.mocked(rpcRequest).mockReturnValue(balance.promise);

    await awaitApproval(request);
    await approveTransaction(request);
    await signTransaction(request);
    const submitting = submitTransaction(request);

    expect(request.transactionMeta.rawTx).toBe('0xsigned');
    expect(request.transactionMeta.txParams.nonce).toBe('0x1');
    expect(releaseNonce).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();

    balance.resolve('0x123');
    await submitting;
    cleanupTransaction(request);

    expect(releaseNonce).toHaveBeenCalledTimes(1);
    expect(events.indexOf('release')).toBeLessThan(events.indexOf('publish'));
    expect(events.indexOf('publish')).toBeLessThan(events.indexOf('approved'));
    expect(request.transactionMeta.preTxBalance).toBe('0x123');

    expect(
      isTransactionApproving(request.dependencies, request.transactionMeta.id),
    ).toBe(false);

    expect(request.dependencies.skipSimulationTransactionIds.size).toBe(0);
    await expect(finishTransaction(request)).resolves.toBe('0xhash');
  });

  it('releases execution resources when signing fails and preserves the execution error payload', async () => {
    const { request, releaseNonce, publish, fail } = createRequest();
    const error = new Error('Hardware wallet disconnected');
    request.addTransactionRequest.options.actionId = 'action';
    jest.mocked(request.dependencies.messenger.call).mockRejectedValue(error);

    await awaitApproval(request);
    await approveTransaction(request);

    await signTransaction(request).catch((failure) =>
      handleTransactionError(request, failure),
    );

    cleanupTransaction(request);

    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ status: TransactionStatus.approved }),
      error,
    );

    expect(releaseNonce).toHaveBeenCalledTimes(1);

    expect(
      isTransactionApproving(request.dependencies, request.transactionMeta.id),
    ).toBe(false);

    expect(publish).not.toHaveBeenCalled();
    await expect(finishTransaction(request)).rejects.toThrow(error.message);
  });

  it('settles skipped-publish approval callbacks after releasing the lock, without submitting', async () => {
    const { request, releaseNonce, publish, finish } = createRequest();

    const success = jest.fn(() => {
      expect(releaseNonce).toHaveBeenCalledTimes(1);

      expect(
        isTransactionApproving(
          request.dependencies,
          request.transactionMeta.id,
        ),
      ).toBe(false);
    });

    request.addTransactionRequest.options.requireApproval = true;

    jest.mocked(request.dependencies.messenger.call).mockResolvedValueOnce({
      resultCallbacks: { success, error: jest.fn() },
    });

    request.constructorOptions.hooks.beforePublish = jest
      .fn()
      .mockResolvedValue(false);

    await awaitApproval(request);
    await approveTransaction(request);
    await signTransaction(request);
    await submitTransaction(request);
    cleanupTransaction(request);

    expect(success).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();

    expect(request.dependencies.messenger.publish).toHaveBeenCalledWith(
      'TransactionController:transactionPublishingSkipped',
      request.transactionMeta,
    );

    finish.resolve({
      ...request.transactionMeta,
      hash: '0xexternal',
      status: TransactionStatus.submitted,
    });

    await expect(finishTransaction(request)).resolves.toBe('0xexternal');
    expect(success).toHaveBeenCalledTimes(2);
  });

  it('never releases an approval lock owned by another invocation', async () => {
    const { request, releaseNonce, publish } = createRequest();

    const releaseApproval = startTransactionApproval(
      request.dependencies,
      request.transactionMeta.id,
    );

    await awaitApproval(request);
    await approveTransaction(request);
    await signTransaction(request);
    await submitTransaction(request);
    cleanupTransaction(request);

    expect(
      isTransactionApproving(request.dependencies, request.transactionMeta.id),
    ).toBe(true);

    expect(request.dependencies.getNonceLock).not.toHaveBeenCalled();
    expect(releaseNonce).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    releaseApproval();
  });

  it('isolates approval locks and signing cancellation between controllers', async () => {
    const first = createRequest();
    const second = createRequest();
    const firstStarted = createDeferredPromise<void>();
    const secondStarted = createDeferredPromise<void>();

    const firstSignature = createDeferredPromise<{
      r: bigint;
      s: bigint;
      v: bigint;
    }>();

    const secondSignature = createDeferredPromise<{
      r: bigint;
      s: bigint;
      v: bigint;
    }>();

    jest
      .mocked(first.request.dependencies.messenger.call)
      .mockImplementation(() => {
        firstStarted.resolve();
        return firstSignature.promise;
      });

    jest
      .mocked(second.request.dependencies.messenger.call)
      .mockImplementation(() => {
        secondStarted.resolve();
        return secondSignature.promise;
      });

    await awaitApproval(first.request);
    await awaitApproval(second.request);
    await approveTransaction(first.request);
    await approveTransaction(second.request);

    const firstSigning = signTransaction(first.request).catch((error) =>
      handleTransactionError(first.request, error),
    );

    const secondSigning = signTransaction(second.request);

    await Promise.all([firstStarted.promise, secondStarted.promise]);

    abortTransactionSigning(
      first.request.dependencies,
      first.request.transactionMeta.id,
    );

    await firstSigning;
    cleanupTransaction(first.request);

    expect(first.fail).toHaveBeenCalledWith(
      expect.anything(),
      new Error('Signing aborted by user'),
    );

    expect(
      isTransactionApproving(
        first.request.dependencies,
        first.request.transactionMeta.id,
      ),
    ).toBe(false);

    expect(
      isTransactionApproving(
        second.request.dependencies,
        second.request.transactionMeta.id,
      ),
    ).toBe(true);

    expect(second.releaseNonce).not.toHaveBeenCalled();
    expect(second.fail).not.toHaveBeenCalled();

    firstSignature.resolve({ r: 1n, s: 2n, v: 27n });
    secondSignature.resolve({ r: 3n, s: 4n, v: 27n });

    await secondSigning;
    cleanupTransaction(second.request);

    expect(second.request.transactionMeta).toMatchObject({
      r: '0x3',
      rawTx: '0xsigned',
      s: '0x4',
      status: TransactionStatus.signed,
      v: '0x1b',
    });
  });

  it('preserves actionId for approval failures and does not acquire execution resources', async () => {
    const { request, fail, releaseNonce } = createRequest();
    const error = new Error('Approval unavailable');
    request.addTransactionRequest.options.actionId = 'action';
    request.addTransactionRequest.options.requireApproval = true;
    jest.mocked(request.dependencies.messenger.call).mockRejectedValue(error);

    await awaitApproval(request).catch((failure) =>
      handleTransactionError(request, failure),
    );

    cleanupTransaction(request);

    expect(fail).toHaveBeenCalledWith(request.transactionMeta, error, 'action');
    expect(releaseNonce).not.toHaveBeenCalled();
    await expect(finishTransaction(request)).rejects.toThrow(error.message);
  });

  it('signs the latest persisted approval edits rather than the initial metadata', async () => {
    const { request } = createRequest();
    request.addTransactionRequest.options.requireApproval = true;
    const approvedMeta = cloneDeep(request.transactionMeta);
    approvedMeta.txParams.gasPrice = '0x9';

    jest.mocked(request.dependencies.messenger.call).mockResolvedValueOnce({
      resultCallbacks: { error: jest.fn(), success: jest.fn() },
      value: { txMeta: approvedMeta },
    });

    await awaitApproval(request);
    await approveTransaction(request);
    await signTransaction(request);
    cleanupTransaction(request);

    expect(prepareTransaction).toHaveBeenCalledWith(
      '0x1',
      expect.objectContaining({
        gasPrice: '0x9',
        nonce: '0x1',
      }),
    );

    expect(request.transactionMeta.txParams.gasPrice).toBe('0x9');
  });

  it('uses the shared publisher when constructor publish hooks are omitted', async () => {
    const { request, publish } = createRequest();
    request.constructorOptions.hooks = {};

    jest
      .mocked(request.dependencies.publishTransaction)
      .mockResolvedValue('0xfallback');

    await awaitApproval(request);
    await approveTransaction(request);
    await signTransaction(request);
    await submitTransaction(request);
    cleanupTransaction(request);

    expect(publish).not.toHaveBeenCalled();

    expect(request.dependencies.publishTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        networkClientId: 'mainnet',
        rawTx: '0xsigned',
      }),
    );

    await expect(finishTransaction(request)).resolves.toBe('0xfallback');
  });

  it('prefers the per-transaction publish hook over the constructor hook', async () => {
    const { request, publish } = createRequest();

    const publishOverride = jest
      .fn()
      .mockResolvedValue({ transactionHash: '0xoverride' });

    request.addTransactionRequest.options.publishHook = publishOverride;

    await awaitApproval(request);
    await approveTransaction(request);
    await signTransaction(request);
    await submitTransaction(request);
    cleanupTransaction(request);

    expect(publish).not.toHaveBeenCalled();
    expect(request.dependencies.publishTransaction).not.toHaveBeenCalled();
    expect(publishOverride).toHaveBeenCalledWith(expect.anything(), '0xsigned');
    await expect(finishTransaction(request)).resolves.toBe('0xoverride');
  });
});

/** Create a real metadata store with observable I/O and resource ownership. */
function createRequest() {
  const transactionMeta: TransactionMeta = {
    chainId: '0x1',
    id: 'transaction',
    networkClientId: 'mainnet',
    status: TransactionStatus.unapproved,
    time: 1,
    txParams: {
      from: '0x1234567890123456789012345678901234567890',
      gas: '0x5208',
      gasPrice: '0x1',
      to: '0x2234567890123456789012345678901234567890',
      value: '0x0',
    },
    type: TransactionType.simpleSend,
  };

  let current = transactionMeta;
  const internalEvents = new EventEmitter();

  const finish = {
    resolve: (meta: TransactionMeta) => {
      current = meta;
      internalEvents.emit(`${transactionMeta.id}:finished`, meta);
    },
  };

  const events: string[] = [];
  const releaseNonce = jest.fn(() => events.push('release'));

  const publish = jest.fn(async () => {
    events.push('publish');
    return { transactionHash: '0xhash' };
  });

  const fail = jest.fn(
    (meta: TransactionMeta, error: Error, _actionId?: string) => {
      current = {
        ...meta,
        error: { message: error.message, name: error.name },
        status: TransactionStatus.failed,
      };

      finish.resolve(current);
    },
  );

  const request: TransactionLifecycleRequest = {
    addTransactionRequest: {
      options: { networkClientId: 'mainnet', requireApproval: false },
      txParams: cloneDeep(transactionMeta.txParams),
    },
    constructorOptions: {
      disableSwaps: false,
      hooks: { publish },
      trace: ((_options, callback) =>
        callback?.()) as TransactionLifecycleRequest['constructorOptions']['trace'],
    },
    delegationAddressPromise: Promise.resolve(undefined),
    dependencies: {
      addTransactionBatch: jest.fn(),
      failTransaction: fail,
      fetchGasFeeTokens: jest.fn(),
      gasFeeFlows: [],
      getNonceLock: jest
        .fn()
        .mockResolvedValue({ nextNonce: 1, releaseLock: releaseNonce }),
      getState: () => ({
        batchTransactionCounts: {},
        lastFetchedBlockNumbers: {},
        methodData: {},
        submitHistory: [],
        transactionBatches: [],
        transactions: [current],
      }),
      hasNetworkClient: () => true,
      internalEvents,
      layer1GasFeeFlows: [],
      messenger: {
        call: jest.fn().mockResolvedValue({ r: 1n, s: 2n, v: 27n }),
        publish: jest.fn((event: string) => {
          if (event === 'TransactionController:transactionApproved') {
            events.push('approved');
          }
        }),
      } as unknown as TransactionLifecycleRequest['dependencies']['messenger'],
      publishTransaction: jest.fn(),
      skipSimulationTransactionIds: new Set([transactionMeta.id]),
      updateGasEstimate: jest.fn(),
      updateSimulationData: jest.fn(),
      updateState: jest.fn(),
      updateTransaction: (meta) => {
        current = cloneDeep(meta);
      },
      updateTransactionInternal: (_options, update) => {
        const draft = cloneDeep(current);
        current = update(draft) ?? draft;
        return current;
      },
    },
    lifecycle: {},
    transactionMeta,
  };

  return { events, fail, finish, publish, releaseNonce, request };
}
