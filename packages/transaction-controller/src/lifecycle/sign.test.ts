import type { TypedTxData } from '@ethereumjs/tx';

import {
  buildLifecycleMocks,
  buildTransactionMeta,
  CHAIN_ID_MOCK,
  FROM_MOCK,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import { TransactionStatus } from '../types.js';
import { signAuthorizationList } from '../utils/eip7702.js';
import { checkGasFeeTokenBeforePublish } from '../utils/gas-fee-tokens.js';
import { prepareTransaction, serializeTransaction } from '../utils/prepare.js';
import {
  abortTransactionSigning,
  signTransaction,
  signTransactionMeta,
  updateTransactionMetaRSV,
} from './sign.js';

jest.mock('../utils/prepare.js');
jest.mock('../utils/provider.js');
jest.mock('../utils/eip7702.js');
jest.mock('../utils/gas-fee-tokens.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAW_TX_MOCK = '0xsigned';
const SIGNED_TX_MOCK: TypedTxData = { r: 1n, s: 2n, v: 27n };

// ---------------------------------------------------------------------------
// Helpers (module-level)
// ---------------------------------------------------------------------------

/**
 * Flush enough microtask queue turns to let `signTransactionMeta` proceed
 * past its internal awaits (beforeSign, checkGasFeeTokenBeforePublish,
 * signAuthorizationList) and register the signing abort callback.
 *
 * @returns A promise that resolves after several microtask turns.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve(); // eslint-disable-line no-await-in-loop
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build mocks with common defaults for sign tests.
 *
 * Sets up `prepareTransaction`, `serializeTransaction`, `signAuthorizationList`,
 * `checkGasFeeTokenBeforePublish`, and the keyring messenger call so that
 * `signTransactionMeta` succeeds out of the box.
 *
 * @returns Handles returned by `buildLifecycleMocks`, plus the keyring sign mock.
 */
function buildSignMocks(): ReturnType<typeof buildLifecycleMocks> & {
  keyringSign: jest.Mock;
} {
  const mocks = buildLifecycleMocks();

  // Set lifecycle.execution so signTransaction doesn't short-circuit.
  mocks.request.lifecycle.execution = {
    networkClientId: mocks.request.transactionMeta.networkClientId ?? 'mainnet',
  };

  jest
    .mocked(prepareTransaction)
    .mockReturnValue({} as ReturnType<typeof prepareTransaction>);
  jest.mocked(serializeTransaction).mockReturnValue(RAW_TX_MOCK);
  jest.mocked(signAuthorizationList).mockResolvedValue(undefined);
  jest.mocked(checkGasFeeTokenBeforePublish).mockResolvedValue(undefined);

  const keyringSign = jest.fn().mockResolvedValue(SIGNED_TX_MOCK);
  mocks.messengerCall.mockImplementation(keyringSign);

  return { ...mocks, keyringSign };
}

// ---------------------------------------------------------------------------
// Tests – signTransaction
// ---------------------------------------------------------------------------

describe('signTransaction', () => {
  it('returns immediately when lifecycle.execution is not set', async () => {
    const { request, messengerCall } = buildLifecycleMocks();
    // lifecycle.execution is undefined by default in the fixture.

    await signTransaction(request);

    expect(messengerCall).not.toHaveBeenCalled();
  });

  it('delegates to signTransactionMeta when lifecycle.execution is set', async () => {
    const { request, messengerCall } = buildSignMocks();

    await signTransaction(request);

    expect(messengerCall).toHaveBeenCalledWith(
      'KeyringController:signTransaction',
      expect.anything(),
      FROM_MOCK,
    );
  });

  it('refreshes request.transactionMeta from state after signing', async () => {
    const { request, setTransaction } = buildSignMocks();

    const updatedMeta = buildTransactionMeta({
      status: TransactionStatus.signed,
    });

    setTransaction(updatedMeta);

    await signTransaction(request);

    expect(request.transactionMeta).toMatchObject({
      status: TransactionStatus.signed,
    });
  });

  it('wraps the inner sign call inside the trace function', async () => {
    const { request } = buildSignMocks();
    const traceSpy = jest.spyOn(request.constructorOptions, 'trace');

    await signTransaction(request);

    expect(traceSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sign' }),
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests – signTransactionMeta
// ---------------------------------------------------------------------------

describe('signTransactionMeta', () => {
  it('calls the beforeSign hook with the transaction metadata', async () => {
    const { request } = buildSignMocks();
    const beforeSignHook = jest.mocked(
      request.constructorOptions.hooks.beforeSign,
    );
    beforeSignHook?.mockResolvedValue({});

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(beforeSignHook).toHaveBeenCalledTimes(1);
    const [callArg] = beforeSignHook?.mock.calls[0] ?? [];
    expect(
      (callArg as { transactionMeta: { id: string } }).transactionMeta.id,
    ).toBe(TRANSACTION_ID_MOCK);
  });

  it('applies updateTransaction from the beforeSign hook when provided', async () => {
    const { request } = buildSignMocks();
    const updatedGasPrice = '0x99';

    jest
      .mocked(request.constructorOptions.hooks.beforeSign)
      ?.mockResolvedValue({
        updateTransaction: (txMeta) => {
          txMeta.txParams.gasPrice = updatedGasPrice;
        },
      });

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(
      jest.mocked(request.dependencies.updateTransactionInternal),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: TRANSACTION_ID_MOCK,
        skipResimulateCheck: true,
      }),
      expect.any(Function),
    );
  });

  it('does NOT call updateTransactionInternal for the beforeSign result when updateTransaction is absent', async () => {
    const { request } = buildSignMocks();

    // beforeSign returns an object without updateTransaction
    jest
      .mocked(request.constructorOptions.hooks.beforeSign)
      ?.mockResolvedValue({});

    const updateTransactionInternalMock = jest.mocked(
      request.dependencies.updateTransactionInternal,
    );
    updateTransactionInternalMock.mockClear();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    // updateTransactionInternal is called for the authorization list path only,
    // not for a missing beforeSign result.
    expect(updateTransactionInternalMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ skipResimulateCheck: true }),
      expect.any(Function),
    );
  });

  it('skips signing and returns undefined for external-sign transactions', async () => {
    const externalMeta = buildTransactionMeta({ isExternalSign: true });
    const { request } = buildLifecycleMocks({ transactionMeta: externalMeta });

    jest.mocked(checkGasFeeTokenBeforePublish).mockResolvedValue(undefined);

    const result = await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      externalMeta,
    );

    expect(result).toBeUndefined();
    expect(jest.mocked(prepareTransaction)).not.toHaveBeenCalled();
  });

  it('calls checkGasFeeTokenBeforePublish with the current transaction', async () => {
    const { request } = buildSignMocks();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(jest.mocked(checkGasFeeTokenBeforePublish)).toHaveBeenCalledTimes(1);
    const [gasFeeArg] = jest.mocked(checkGasFeeTokenBeforePublish).mock
      .calls[0];
    expect((gasFeeArg as { transaction: { id: string } }).transaction.id).toBe(
      TRANSACTION_ID_MOCK,
    );
  });

  it('calls prepareTransaction with chainId and txParams', async () => {
    const { request } = buildSignMocks();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(jest.mocked(prepareTransaction)).toHaveBeenCalledWith(
      CHAIN_ID_MOCK,
      expect.objectContaining({ from: FROM_MOCK }),
    );
  });

  it('calls KeyringController:signTransaction with unsignedEthTx and from address', async () => {
    const { request, messengerCall } = buildSignMocks();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(messengerCall).toHaveBeenCalledWith(
      'KeyringController:signTransaction',
      expect.anything(),
      FROM_MOCK,
    );
  });

  it('persists status=signed after signing', async () => {
    const { request } = buildSignMocks();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(
      jest.mocked(request.dependencies.updateTransaction),
    ).toHaveBeenCalledWith(
      expect.objectContaining({ status: TransactionStatus.signed }),
      expect.stringContaining('Transaction signed'),
    );
  });

  it('publishes transactionStatusUpdated after signing', async () => {
    const { request, messengerPublish } = buildSignMocks();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    const publishedCalls = messengerPublish.mock.calls.filter(
      ([event]: [string]) =>
        event === 'TransactionController:transactionStatusUpdated',
    );
    expect(publishedCalls.length).toBeGreaterThanOrEqual(1);
    const [, publishedArg] = publishedCalls[0] as [
      string,
      { transactionMeta: { status: string } },
    ];
    expect(publishedArg.transactionMeta.status).toBe(TransactionStatus.signed);
  });

  it('persists rawTx after serialization', async () => {
    const { request } = buildSignMocks();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(
      jest.mocked(request.dependencies.updateTransaction),
    ).toHaveBeenCalledWith(
      expect.objectContaining({ rawTx: RAW_TX_MOCK }),
      expect.stringContaining('RawTransaction added'),
    );
  });

  it('returns the serialized raw transaction', async () => {
    const { request } = buildSignMocks();

    const result = await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    expect(result).toBe(RAW_TX_MOCK);
  });

  it('applies signed authorization list when signAuthorizationList returns a list', async () => {
    const { request } = buildSignMocks();
    const signedList = [
      {
        address: '0xabc',
        chainId: '0x1',
        nonce: '0x0',
        r: '0x1',
        s: '0x2',
        yParity: '0x1',
      },
    ];

    jest
      .mocked(signAuthorizationList)
      .mockResolvedValue(
        signedList as Awaited<ReturnType<typeof signAuthorizationList>>,
      );

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    // updateTransactionInternal is called to write the signed list.
    expect(
      jest.mocked(request.dependencies.updateTransactionInternal),
    ).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: TRANSACTION_ID_MOCK }),
      expect.any(Function),
    );
  });

  it('does NOT call updateTransactionInternal for auth list when signAuthorizationList returns undefined', async () => {
    const { request } = buildSignMocks();
    jest.mocked(signAuthorizationList).mockResolvedValue(undefined);

    jest
      .mocked(request.constructorOptions.hooks.beforeSign)
      ?.mockResolvedValue({});
    const updateTransactionInternalMock = jest.mocked(
      request.dependencies.updateTransactionInternal,
    );
    updateTransactionInternalMock.mockClear();

    await signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    // There is no auth list, so updateTransactionInternal is not called.
    expect(updateTransactionInternalMock).not.toHaveBeenCalled();
  });

  it('rejects when keyring signing rejects', async () => {
    const { request, messengerCall } = buildSignMocks();
    const signingError = new Error('Hardware wallet disconnected');
    messengerCall.mockRejectedValue(signingError);

    await expect(
      signTransactionMeta(
        request.constructorOptions,
        request.dependencies,
        request.transactionMeta,
      ),
    ).rejects.toThrow('Hardware wallet disconnected');
  });
});

// ---------------------------------------------------------------------------
// Tests – updateTransactionMetaRSV
// ---------------------------------------------------------------------------

describe('updateTransactionMetaRSV', () => {
  it('copies r, s, v from signedTx onto a cloned transaction meta', () => {
    const meta = buildTransactionMeta();
    const signedTx: TypedTxData = { r: 1n, s: 2n, v: 27n };

    const result = updateTransactionMetaRSV(meta, signedTx);

    expect(result.r).toBe('0x1');
    expect(result.s).toBe('0x2');
    expect(result.v).toBe('0x1b');
  });

  it('does not mutate the original transaction meta', () => {
    const meta = buildTransactionMeta();
    const signedTx: TypedTxData = { r: 1n, s: 2n, v: 27n };

    updateTransactionMetaRSV(meta, signedTx);

    expect((meta as { r?: string }).r).toBeUndefined();
  });

  it('skips undefined r/s/v fields without throwing', () => {
    const meta = buildTransactionMeta();
    const signedTx: TypedTxData = { r: undefined, s: undefined, v: undefined };

    const result = updateTransactionMetaRSV(meta, signedTx);

    expect((result as { r?: string }).r).toBeUndefined();
    expect((result as { s?: string }).s).toBeUndefined();
    expect((result as { v?: string }).v).toBeUndefined();
  });

  it('skips null r/s/v fields without throwing', () => {
    const meta = buildTransactionMeta();
    const signedTx: TypedTxData = {
      r: null as unknown as bigint,
      s: null as unknown as bigint,
      v: null as unknown as bigint,
    };

    const result = updateTransactionMetaRSV(meta, signedTx);

    expect((result as { r?: string }).r).toBeUndefined();
  });

  it('handles numeric values for r, s, v', () => {
    const meta = buildTransactionMeta();
    const signedTx: TypedTxData = {
      r: 255 as unknown as bigint,
      s: 256 as unknown as bigint,
      v: 1 as unknown as bigint,
    };

    const result = updateTransactionMetaRSV(meta, signedTx);

    expect(result.r).toBe('0xff');
    expect(result.s).toBe('0x100');
    expect(result.v).toBe('0x1');
  });

  it('handles string values for r, s, v', () => {
    const meta = buildTransactionMeta();
    const signedTx: TypedTxData = {
      r: '255' as unknown as bigint,
      s: '256' as unknown as bigint,
      v: '27' as unknown as bigint,
    };

    const result = updateTransactionMetaRSV(meta, signedTx);

    expect(result.r).toBe('0xff');
    expect(result.s).toBe('0x100');
    expect(result.v).toBe('0x1b');
  });
});

// ---------------------------------------------------------------------------
// Tests – abortTransactionSigning
// ---------------------------------------------------------------------------

describe('abortTransactionSigning', () => {
  it('throws when no transaction metadata is found for the given id', () => {
    const { request } = buildLifecycleMocks();

    expect(() =>
      abortTransactionSigning(request.dependencies, 'unknown-tx-id'),
    ).toThrow('Cannot abort signing as no transaction metadata found');
  });

  it('throws when the transaction exists but is not waiting for signing', () => {
    const { request } = buildLifecycleMocks();

    expect(() =>
      abortTransactionSigning(request.dependencies, TRANSACTION_ID_MOCK),
    ).toThrow('Cannot abort signing as transaction is not waiting for signing');
  });

  it('rejects the in-progress signing promise when abort is called', async () => {
    const { request } = buildSignMocks();

    // Start a sign that will not resolve until we abort it.
    const neverResolve = new Promise<TypedTxData>(() => undefined);
    jest
      .spyOn(request.dependencies.messenger, 'call')
      .mockReturnValue(neverResolve);

    const signing = signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    // Flush past the multiple awaits inside signTransactionMeta (beforeSign,
    // checkGasFeeTokenBeforePublish, signAuthorizationList, getTransactionOrThrow
    // calls) so that the signing Promise is created and the abort callback
    // is registered.
    await flushMicrotasks();

    abortTransactionSigning(request.dependencies, TRANSACTION_ID_MOCK);

    await expect(signing).rejects.toThrow('Signing aborted by user');
  });

  it('removes the abort callback after aborting so a second abort throws', async () => {
    const { request } = buildSignMocks();

    const neverResolve = new Promise<TypedTxData>(() => undefined);
    jest
      .spyOn(request.dependencies.messenger, 'call')
      .mockReturnValue(neverResolve);

    const signing = signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    await flushMicrotasks();

    abortTransactionSigning(request.dependencies, TRANSACTION_ID_MOCK);

    // Second abort should throw because the callback was deleted.
    expect(() =>
      abortTransactionSigning(request.dependencies, TRANSACTION_ID_MOCK),
    ).toThrow('Cannot abort signing as transaction is not waiting for signing');

    await signing.catch(() => undefined);
  });

  it('does not affect signing of a different transaction on the same dependencies', async () => {
    // Use a second independent mock with a different transaction ID.
    const otherMeta = buildTransactionMeta({ id: 'other-tx' });
    const otherMocks = buildLifecycleMocks({ transactionMeta: otherMeta });

    const { request } = buildSignMocks();

    const neverResolve = new Promise<TypedTxData>(() => undefined);
    jest
      .spyOn(request.dependencies.messenger, 'call')
      .mockReturnValue(neverResolve);

    const signing = signTransactionMeta(
      request.constructorOptions,
      request.dependencies,
      request.transactionMeta,
    );

    await flushMicrotasks();

    // Aborting on the OTHER dependencies object should not affect the first.
    expect(() =>
      abortTransactionSigning(
        otherMocks.request.dependencies,
        TRANSACTION_ID_MOCK,
      ),
    ).toThrow('Cannot abort signing as no transaction metadata found');

    abortTransactionSigning(request.dependencies, TRANSACTION_ID_MOCK);
    await signing.catch(() => undefined);
  });
});
