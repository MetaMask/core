import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import {
  decodeRevertData,
  extractErrorData,
  extractRevertReason,
  OnChainFailureError,
} from './extract-revert-reason';
import { rpcRequest } from './provider';

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

describe('decodeRevertData', () => {
  it('decodes Error(string) reverts', () => {
    expect(decodeRevertData(ERROR_DATA_TRANSFER_EXCEEDS_BALANCE)).toBe(
      'ERC20: transfer amount exceeds balance',
    );
  });

  it('decodes Panic(uint256) reverts with a known code', () => {
    expect(decodeRevertData(PANIC_DATA_OVERFLOW)).toBe(
      'Panic: arithmetic overflow or underflow (0x11)',
    );
  });

  it('decodes Panic(uint256) reverts with an unknown code', () => {
    const data =
      '0x4e487b7100000000000000000000000000000000000000000000000000000000000000ff';
    expect(decodeRevertData(data)).toBe('Panic: unknown panic (0xff)');
  });

  it('falls back to the selector for custom errors', () => {
    expect(decodeRevertData(CUSTOM_ERROR_DATA)).toBe(
      'reverted with custom error 0xdeadbeef',
    );
  });

  it('returns undefined for empty revert data', () => {
    expect(decodeRevertData('0x')).toBeUndefined();
  });

  it('returns undefined for non-hex input', () => {
    expect(decodeRevertData(undefined)).toBeUndefined();
    expect(decodeRevertData(123)).toBeUndefined();
    expect(decodeRevertData('not hex')).toBeUndefined();
  });

  it('surfaces raw hex for short data without a full selector', () => {
    expect(decodeRevertData('0x1234')).toBe('execution reverted (0x1234)');
  });

  it('returns undefined when Error(string) payload is malformed', () => {
    const data = '0x08c379a0deadbeef';
    expect(decodeRevertData(data)).toBeUndefined();
  });

  it('returns undefined when Panic(uint256) payload is malformed', () => {
    const data = '0x4e487b71deadbeef';
    expect(decodeRevertData(data)).toBeUndefined();
  });
});

describe('extractErrorData', () => {
  it('finds data on the top-level error (standard JSON-RPC shape)', () => {
    expect(extractErrorData({ data: '0xabcd' })).toBe('0xabcd');
  });

  it('finds data nested one level under data.data (older node forks)', () => {
    expect(extractErrorData({ data: { data: '0xabcd' } })).toBe('0xabcd');
  });

  it('returns undefined when no hex data is present', () => {
    expect(extractErrorData({ message: 'oops' })).toBeUndefined();
    expect(extractErrorData(undefined)).toBeUndefined();
    expect(extractErrorData('string')).toBeUndefined();
    expect(extractErrorData(null)).toBeUndefined();
  });

  it('returns undefined when data is a non-hex string', () => {
    expect(extractErrorData({ data: 'not hex' })).toBeUndefined();
  });
});

describe('extractRevertReason', () => {
  const rpcRequestMock = jest.mocked(rpcRequest);

  beforeEach(() => {
    rpcRequestMock.mockReset();
  });

  it('returns a decoded reason from provider error data', async () => {
    rpcRequestMock.mockRejectedValueOnce({
      message: 'execution reverted',
      data: ERROR_DATA_TRANSFER_EXCEEDS_BALANCE,
    });

    const reason = await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    expect(reason).toBe('ERC20: transfer amount exceeds balance');
    expect(rpcRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'eth_estimateGas',
        params: [
          expect.objectContaining({
            from: TRANSACTION_META_MOCK.txParams.from,
            to: TRANSACTION_META_MOCK.txParams.to,
            data: TRANSACTION_META_MOCK.txParams.data,
          }),
        ],
      }),
    );
  });

  it('falls back to the provider error message when data is missing', async () => {
    rpcRequestMock.mockRejectedValueOnce({
      message: 'execution reverted: Custom message from node',
    });

    const reason = await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    expect(reason).toBe('Custom message from node');
  });

  it('returns undefined when the replay does not revert', async () => {
    rpcRequestMock.mockResolvedValueOnce('0x');

    const reason = await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    expect(reason).toBeUndefined();
  });

  it('returns undefined when neither data nor a useful message is present', async () => {
    rpcRequestMock.mockRejectedValueOnce({ message: 'unrelated network error' });

    const reason = await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    expect(reason).toBeUndefined();
  });

  it('skips extraction when txParams has neither `to` nor `data`', async () => {
    const reason = await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: {
        ...TRANSACTION_META_MOCK,
        txParams: {},
      } as unknown as TransactionMeta,
    });

    expect(reason).toBeUndefined();
    expect(rpcRequestMock).not.toHaveBeenCalled();
  });

  it('returns undefined for non-object provider errors', async () => {
    rpcRequestMock.mockRejectedValueOnce('boom');

    const reason = await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    expect(reason).toBeUndefined();
  });

  it('returns undefined when provider error has a non-string message', async () => {
    rpcRequestMock.mockRejectedValueOnce({ message: 12345 });

    const reason = await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    expect(reason).toBeUndefined();
  });

  it('does not pass `gas` from txParams (forces full estimation)', async () => {
    rpcRequestMock.mockResolvedValueOnce('0x5208');

    await extractRevertReason({
      messenger: messengerMock,
      transactionMeta: TRANSACTION_META_MOCK,
    });

    const [callArgs] = rpcRequestMock.mock.calls[0];
    expect((callArgs.params as [Record<string, unknown>])[0]).not.toHaveProperty(
      'gas',
    );
  });
});

describe('OnChainFailureError', () => {
  it('formats the message with a revert reason when present', () => {
    const error = new OnChainFailureError('insufficient funds');
    expect(error.message).toBe('Transaction failed on-chain: insufficient funds');
    expect(error.revertReason).toBe('insufficient funds');
    expect(error.name).toBe('OnChainFailureError');
  });

  it('formats the message without a suffix when reason is missing', () => {
    const error = new OnChainFailureError();
    expect(error.message).toBe('Transaction failed on-chain');
    expect(error.revertReason).toBeUndefined();
  });
});
