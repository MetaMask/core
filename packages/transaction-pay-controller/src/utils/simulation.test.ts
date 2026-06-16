import { defaultAbiCoder } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '../types';
import { isChainExcludedFromInfura } from './feature-flags';
import { rpcRequest } from './provider';
import { SentinelSimulationError, simulateTransactions } from './sentinel';
import { simulateQuoteTransactions } from './simulation';
import type { SimulationRequest } from './simulation';

jest.mock('./feature-flags', () => ({
  ...jest.requireActual<typeof import('./feature-flags')>('./feature-flags'),
  isChainExcludedFromInfura: jest.fn(),
}));
jest.mock('./provider', () => ({
  ...jest.requireActual<typeof import('./provider')>('./provider'),
  rpcRequest: jest.fn(),
}));
jest.mock('./sentinel', () => ({
  ...jest.requireActual<typeof import('./sentinel')>('./sentinel'),
  simulateTransactions: jest.fn(),
}));

const CHAIN_ID_MOCK = '0x38' as Hex;
const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const TOKEN_ADDRESS_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const EIP7702_DELEGATOR_ADDRESS =
  '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b' as Hex;

const CHAIN_UNSUPPORTED_ERROR = new SentinelSimulationError(
  `Simulation is not supported for chain ${CHAIN_ID_MOCK}`,
);

const ERROR_STRING_SELECTOR = '0x08c379a0';
const PANIC_SELECTOR = '0x4e487b71';

const ERROR_DATA_MOCK =
  `${ERROR_STRING_SELECTOR}${defaultAbiCoder.encode(['string'], ['ERC20: transfer failed']).slice(2)}` as Hex;
const PANIC_DATA_MOCK = `${PANIC_SELECTOR}${'0'.repeat(64)}` as Hex;
const MALFORMED_ERROR_SELECTOR_MOCK = ERROR_STRING_SELECTOR as Hex;
const UNKNOWN_SELECTOR_DATA_MOCK = `0xdeadbeef${'0'.repeat(64)}` as Hex;

function buildRequest(
  overrides?: Partial<SimulationRequest>,
): SimulationRequest {
  return {
    chainId: CHAIN_ID_MOCK,
    messenger: null as unknown as TransactionPayControllerMessenger,
    transactions: [{ from: FROM_MOCK, to: TOKEN_ADDRESS_MOCK }],
    ...overrides,
  };
}

describe('simulateQuoteTransactions', () => {
  const isChainExcludedFromInfuraMock = jest.mocked(isChainExcludedFromInfura);
  const rpcRequestMock = jest.mocked(rpcRequest);
  const simulateTransactionsMock = jest.mocked(simulateTransactions);

  beforeEach(() => {
    jest.resetAllMocks();
    isChainExcludedFromInfuraMock.mockReturnValue(false);
    rpcRequestMock.mockResolvedValue({} as never);
    simulateTransactionsMock.mockResolvedValue({ transactions: [{}] });
  });

  describe('catch block — Sentinel throws', () => {
    it('throws quote_simulation_failed when Sentinel throws a generic non-SentinelSimulationError', async () => {
      simulateTransactionsMock.mockRejectedValue(new Error('network timeout'));
      rpcRequestMock
        .mockRejectedValueOnce(
          new Error('method debug_traceCall not supported'),
        )
        .mockRejectedValueOnce(
          new Error('method eth_estimateGas not supported'),
        );

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        code: 'quote_simulation_failed',
      });
    });

    it('throws quote_validation_unavailable when Sentinel fails with a non-critical SentinelSimulationError and both fallbacks are unavailable', async () => {
      simulateTransactionsMock.mockRejectedValue(
        new SentinelSimulationError('Internal server error'),
      );
      rpcRequestMock
        .mockRejectedValueOnce(
          new Error('method debug_traceCall not supported'),
        )
        .mockRejectedValueOnce(
          new Error('method eth_estimateGas not supported'),
        );

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        code: 'quote_validation_unavailable',
        message: 'Internal server error',
      });
    });

    it('throws quote_simulation_failed with fallback error when debug_traceCall error has a non-revert string in .data', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockRejectedValueOnce({ data: '0x1234abcd' });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: '0x1234abcd',
      });
    });

    it('throws quote_simulation_failed with Panic decode when debug_traceCall error .data is a PANIC selector', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockRejectedValueOnce({ data: PANIC_DATA_MOCK });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'Panic(0)',
      });
    });

    it('throws quote_simulation_failed with decoded ABI error when debug_traceCall trace output is an ERROR_STRING_SELECTOR', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockResolvedValueOnce({ output: ERROR_DATA_MOCK });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'ERC20: transfer failed',
      });
    });

    it('uses fallback error message from trace .error when debug_traceCall trace has a direct error', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockResolvedValueOnce({ error: 'fallback route error' });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'fallback route error',
      });
    });

    it('is non-blocking when debug_traceCall trace output is a malformed error selector', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockResolvedValueOnce({
        output: MALFORMED_ERROR_SELECTOR_MOCK,
      });

      expect(await simulateQuoteTransactions(buildRequest())).toBeUndefined();
    });

    it('is non-blocking when debug_traceCall trace output has an unrecognized selector', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockResolvedValueOnce({
        output: UNKNOWN_SELECTOR_DATA_MOCK,
      });

      expect(await simulateQuoteTransactions(buildRequest())).toBeUndefined();
    });

    it('uses isQuoteSimulationFailure with String() when the thrown error is not an Error instance', async () => {
      simulateTransactionsMock.mockRejectedValue({
        code: 999,
        message: 'custom error',
      });
      rpcRequestMock
        .mockRejectedValueOnce(
          new Error('method debug_traceCall not supported'),
        )
        .mockRejectedValueOnce(
          new Error('method eth_estimateGas not supported'),
        );

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'custom error',
      });
    });

    it('passes stateOverrides to debug_traceCall when request has 7702 account overrides', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);

      await simulateQuoteTransactions(
        buildRequest({ mock7702From: FROM_MOCK }),
      );

      expect(rpcRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'debug_traceCall',
          params: expect.arrayContaining([
            expect.objectContaining({ stateOverrides: expect.any(Object) }),
          ]),
        }),
      );
    });

    it('passes overrides to eth_estimateGas params when request has 7702 account overrides', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock
        .mockRejectedValueOnce(
          new Error('method debug_traceCall not supported'),
        )
        .mockResolvedValueOnce({} as never);

      await simulateQuoteTransactions(
        buildRequest({ mock7702From: FROM_MOCK }),
      );

      expect(rpcRequestMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          method: 'eth_estimateGas',
          params: [expect.any(Object), 'latest', expect.any(Object)],
        }),
      );
    });

    it('uses error .message string directly when findErrorMessage traversal resolves via message property', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockRejectedValueOnce({
        code: 3,
        message: 'rpc error string',
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'rpc error string',
      });
    });

    it('falls through to nested data messages when the top-level message is missing', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockRejectedValueOnce({
        data: { message: 'nested rpc error string' },
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'nested rpc error string',
      });
    });

    it('falls through to nested error messages when message and data are missing', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockRejectedValueOnce({
        error: { message: 'nested error rpc string' },
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'nested error rpc string',
      });
    });

    it('falls through to original error messages when earlier fields are missing', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockRejectedValueOnce({
        originalError: { message: 'nested original rpc string' },
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'nested original rpc string',
      });
    });

    it('ignores unsupported chain errors when no RPC fallback message can be extracted', async () => {
      simulateTransactionsMock.mockRejectedValue(CHAIN_UNSUPPORTED_ERROR);
      rpcRequestMock.mockRejectedValueOnce({ code: 3 });

      expect(await simulateQuoteTransactions(buildRequest())).toBeUndefined();
    });
  });

  describe('validateSimulationResponse — response transaction errors', () => {
    it('throws when Sentinel returns an error in the second response transaction while request has one transaction', async () => {
      simulateTransactionsMock.mockResolvedValue({
        transactions: [{}, { error: 'tx2 route error' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'tx2 route error',
      });
    });

    it('throws when Sentinel response transaction has a direct callTrace error', async () => {
      simulateTransactionsMock.mockResolvedValue({
        transactions: [{ callTrace: { error: 'callTrace direct error' } }],
      });
      rpcRequestMock
        .mockRejectedValueOnce(
          new Error('method debug_traceCall not supported'),
        )
        .mockRejectedValueOnce(
          new Error('method eth_estimateGas not supported'),
        );

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'callTrace direct error',
      });
    });

    it('throws when Sentinel response transaction has a nested callTrace error', async () => {
      simulateTransactionsMock.mockResolvedValue({
        transactions: [
          {
            callTrace: {
              calls: [{}, { error: 'nested callTrace error' }],
            },
          },
        ],
      });
      rpcRequestMock
        .mockRejectedValueOnce(
          new Error('method debug_traceCall not supported'),
        )
        .mockRejectedValueOnce(
          new Error('method eth_estimateGas not supported'),
        );

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        code: 'quote_simulation_failed',
        message: 'nested callTrace error',
      });
    });
  });

  describe('7702 account override', () => {
    it('adds account code override when mock7702From is provided', async () => {
      await simulateQuoteTransactions(
        buildRequest({ mock7702From: FROM_MOCK }),
      );

      expect(simulateTransactionsMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        expect.objectContaining({
          overrides: {
            [FROM_MOCK.toLowerCase()]: {
              code: `0xef0100${EIP7702_DELEGATOR_ADDRESS.slice(2)}`,
            },
          },
        }),
      );
    });
  });
});
