import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { rpcRequest } from './provider';
import {
  decodeRevert,
  extractRevert,
  OnChainFailureError,
  revertFromError,
} from './revert';

jest.mock('./provider', () => ({
  ...jest.requireActual('./provider'),
  rpcRequest: jest.fn(),
}));

const ERROR_DATA_TRANSFER_EXCEEDS_BALANCE =
  '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000';

const PANIC_DATA_OVERFLOW =
  '0x4e487b710000000000000000000000000000000000000000000000000000000000000011';

const CUSTOM_ERROR_DATA =
  '0xdeadbeef000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000001111111111111111111111111111111111111111';

const TRANSACTION_META_MOCK = {
  id: 'tx-1',
  networkClientId: 'networkClient1',
  txParams: {
    from: `0x${'11'.repeat(20)}`,
    to: `0x${'22'.repeat(20)}`,
    data: '0xa9059cbb',
    value: '0x0',
    gas: '0x5208',
  },
  txReceipt: {
    blockNumber: '0x123',
    status: '0x0',
  },
} as unknown as TransactionMeta;

const messengerMock = {} as unknown as TransactionControllerMessenger;

describe('decodeRevert', () => {
  it('decodes Error(string) reverts', () => {
    expect(decodeRevert(ERROR_DATA_TRANSFER_EXCEEDS_BALANCE)).toStrictEqual({
      message: 'ERC20: transfer amount exceeds balance',
      data: ERROR_DATA_TRANSFER_EXCEEDS_BALANCE,
    });
  });

  it('decodes Panic(uint256) reverts with a known code', () => {
    expect(decodeRevert(PANIC_DATA_OVERFLOW)).toStrictEqual({
      message: 'Panic (0x11): Arithmetic overflow or underflow',
      data: PANIC_DATA_OVERFLOW,
    });
  });

  it('decodes Panic(uint256) reverts with an unknown code', () => {
    const data =
      '0x4e487b7100000000000000000000000000000000000000000000000000000000000000ff';
    expect(decodeRevert(data)).toStrictEqual({
      message: 'Panic (0xff): Unknown panic code',
      data,
    });
  });

  it('falls back to the selector for custom errors', () => {
    expect(decodeRevert(CUSTOM_ERROR_DATA)).toStrictEqual({
      message: 'Custom error: 0xdeadbeef',
      data: CUSTOM_ERROR_DATA,
    });
  });

  it('returns undefined for empty revert data', () => {
    expect(decodeRevert('0x')).toBeUndefined();
  });

  it('returns undefined for non-hex input', () => {
    expect(decodeRevert(undefined)).toBeUndefined();
    expect(decodeRevert(123)).toBeUndefined();
    expect(decodeRevert('not hex')).toBeUndefined();
  });

  it('surfaces raw hex for short data without a full selector', () => {
    expect(decodeRevert('0x1234')).toStrictEqual({
      message: 'execution reverted (0x1234)',
      data: '0x1234',
    });
  });

  it('returns data only when Error(string) payload is malformed', () => {
    const data = '0x08c379a0deadbeef';
    expect(decodeRevert(data)).toStrictEqual({ data });
  });

  it('returns data only when Panic(uint256) payload is malformed', () => {
    const data = '0x4e487b71deadbeef';
    expect(decodeRevert(data)).toStrictEqual({ data });
  });
});

describe('revertFromError', () => {
  it('decodes data on the top-level error', () => {
    expect(revertFromError({ data: PANIC_DATA_OVERFLOW })).toStrictEqual({
      message: 'Panic (0x11): Arithmetic overflow or underflow',
      data: PANIC_DATA_OVERFLOW,
    });
  });

  it('decodes data nested one level deeper', () => {
    expect(
      revertFromError({ data: { data: PANIC_DATA_OVERFLOW } }),
    ).toStrictEqual({
      message: 'Panic (0x11): Arithmetic overflow or underflow',
      data: PANIC_DATA_OVERFLOW,
    });
  });

  it('returns undefined when no hex data is present', () => {
    expect(revertFromError({ message: 'oops' })).toBeUndefined();
    expect(revertFromError(undefined)).toBeUndefined();
    expect(revertFromError(null)).toBeUndefined();
    expect(revertFromError('string')).toBeUndefined();
  });
});

describe('extractRevert', () => {
  const rpcRequestMock = jest.mocked(rpcRequest);

  beforeEach(() => {
    rpcRequestMock.mockReset();
  });

  it('returns a Revert with decoded message and raw data from provider error', async () => {
    rpcRequestMock.mockRejectedValueOnce({
      message: 'execution reverted',
      data: ERROR_DATA_TRANSFER_EXCEEDS_BALANCE,
    });

    expect(
      await extractRevert({
        messenger: messengerMock,
        transactionMeta: TRANSACTION_META_MOCK,
      }),
    ).toStrictEqual({
      message: 'ERC20: transfer amount exceeds balance',
      data: ERROR_DATA_TRANSFER_EXCEEDS_BALANCE,
    });
  });

  it('returns undefined when the replay does not revert', async () => {
    rpcRequestMock.mockResolvedValueOnce('0x');

    expect(
      await extractRevert({
        messenger: messengerMock,
        transactionMeta: TRANSACTION_META_MOCK,
      }),
    ).toBeUndefined();
  });

  it('returns undefined when the error has no data, even if message looks like a revert', async () => {
    rpcRequestMock.mockRejectedValueOnce({
      message: 'execution reverted: Custom message from node',
    });

    expect(
      await extractRevert({
        messenger: messengerMock,
        transactionMeta: TRANSACTION_META_MOCK,
      }),
    ).toBeUndefined();
  });

  it('skips extraction when txParams has neither `to` nor `data`', async () => {
    expect(
      await extractRevert({
        messenger: messengerMock,
        transactionMeta: {
          ...TRANSACTION_META_MOCK,
          txParams: {},
        } as unknown as TransactionMeta,
      }),
    ).toBeUndefined();
    expect(rpcRequestMock).not.toHaveBeenCalled();
  });

  it('returns undefined for non-object provider errors', async () => {
    rpcRequestMock.mockRejectedValueOnce('boom');

    expect(
      await extractRevert({
        messenger: messengerMock,
        transactionMeta: TRANSACTION_META_MOCK,
      }),
    ).toBeUndefined();
  });

  it('does not pass `gas` from txParams (forces full estimation)', async () => {
    rpcRequestMock.mockResolvedValueOnce('0x5208');

    await extractRevert({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    const [callArgs] = rpcRequestMock.mock.calls[0];
    expect(
      (callArgs.params as [Record<string, unknown>])[0],
    ).not.toHaveProperty('gas');
  });
});

describe('OnChainFailureError', () => {
  it('formats the message with a revert reason when present', () => {
    const error = new OnChainFailureError({ message: 'insufficient funds' });
    expect(error.message).toBe(
      'Transaction failed on-chain: insufficient funds',
    );
    expect(error.revert).toStrictEqual({ message: 'insufficient funds' });
    expect(error.name).toBe('OnChainFailureError');
  });

  it('formats the message with raw data fallback when message is missing', () => {
    const error = new OnChainFailureError({ data: '0xabcd' });
    expect(error.message).toBe('Transaction failed on-chain');
    expect(error.revert).toStrictEqual({ data: '0xabcd' });
  });

  it('formats the message without a suffix when revert is missing', () => {
    const error = new OnChainFailureError();
    expect(error.message).toBe('Transaction failed on-chain');
    expect(error.revert).toBeUndefined();
  });
});
