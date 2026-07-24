import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../tests/messenger-mock.js';
import type { TransactionPayQuote } from '../types.js';
import {
  simulateQuoteTransactions,
  TransactionPaySimulationError,
} from './simulation.js';
import * as tokenModule from './token.js';
import {
  isQuoteError,
  QuoteError,
  validateQuoteExecution,
} from './validation.js';
import type { QuoteSimulation } from './validation.js';

jest.mock('./simulation', () => ({
  ...jest.requireActual('./simulation'),
  simulateQuoteTransactions: jest.fn(),
}));
jest.mock('./token');

const CHAIN_ID_MOCK = '0x38' as Hex;
const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const TOKEN_ADDRESS_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const RECIPIENT_MOCK = '0x3333333333333333333333333333333333333333' as Hex;

// ERC-20 transfer(address,uint256) selector + padded args
// transfer(RECIPIENT_MOCK, 500)
const TRANSFER_DATA_MOCK = `0xa9059cbb${RECIPIENT_MOCK.slice(2).padStart(64, '0')}${BigInt(500).toString(16).padStart(64, '0')}`;

function buildQuote(
  overrides: Partial<TransactionPayQuote<unknown>['request']> = {},
  sourceAmountRaw = '500',
): TransactionPayQuote<unknown> {
  return {
    original: {},
    request: {
      from: FROM_MOCK,
      sourceBalanceRaw: '1000',
      sourceChainId: CHAIN_ID_MOCK,
      sourceTokenAddress: TOKEN_ADDRESS_MOCK,
      sourceTokenAmount: sourceAmountRaw,
      targetAmountMinimum: '0',
      targetChainId: '0x1' as Hex,
      targetTokenAddress: '0x4444444444444444444444444444444444444444' as Hex,
      ...overrides,
    },
    sourceAmount: { fiat: '0', human: '0', raw: sourceAmountRaw, usd: '0' },
    strategy: 'relay' as never,
  };
}

function buildSimulation(
  overrides: Partial<QuoteSimulation> = {},
): QuoteSimulation {
  return {
    transactions: [
      {
        data: TRANSFER_DATA_MOCK as Hex,
        from: FROM_MOCK,
        to: TOKEN_ADDRESS_MOCK,
      },
    ],
    ...overrides,
  };
}

describe('validateQuoteExecution', () => {
  let messengerMock: ReturnType<typeof getMessengerMock>;
  const simulateQuoteTransactionsMock = jest.mocked(simulateQuoteTransactions);
  const getLiveTokenBalanceMock = jest.mocked(tokenModule.getLiveTokenBalance);
  const getNativeTokenMock = jest.mocked(tokenModule.getNativeToken);
  const getTokenInfoMock = jest.mocked(tokenModule.getTokenInfo);
  const normalizeTokenAddressMock = jest.mocked(
    tokenModule.normalizeTokenAddress,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    messengerMock = getMessengerMock();

    // Default: balance is sufficient
    getLiveTokenBalanceMock.mockResolvedValue('1000');
    // Default: simulation passes
    simulateQuoteTransactionsMock.mockResolvedValue(undefined);
    // Default: native token is ETH (not the source token)
    getNativeTokenMock.mockReturnValue(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    );
    // Default: normalizeTokenAddress returns the address unchanged
    normalizeTokenAddressMock.mockImplementation((addr) => addr);
    // Default: no token info
    getTokenInfoMock.mockReturnValue(undefined);
  });

  describe('balance check', () => {
    it('passes when live balance equals required amount', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('500');

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '500'),
          simulation: buildSimulation(),
        }),
      ).toBeUndefined();
    });

    it('passes when live balance exceeds required amount', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('9999');

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '500'),
          simulation: buildSimulation(),
        }),
      ).toBeUndefined();
    });

    it('throws insufficient-source-balance when live balance is too low', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('100');

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '500'),
          simulation: buildSimulation(),
        }),
      ).rejects.toMatchObject({
        info: {
          reason: 'insufficient-source-balance',
          message: 'Insufficient source balance for quote',
        },
      });
    });

    it('includes formatted shortfall detail rows when token info is available', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('100');
      getTokenInfoMock.mockReturnValue({ decimals: 6, symbol: 'USDC' });

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '500'),
          simulation: buildSimulation(),
        }),
      ).rejects.toMatchObject({
        info: {
          reason: 'insufficient-source-balance',
          detail: [
            'Required: 0.0005 USDC',
            'Current: 0.0001 USDC',
            'Missing: 0.0004 USDC',
          ],
        },
      });
    });

    it('includes raw shortfall detail rows when token info is unavailable', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('100');
      getTokenInfoMock.mockReturnValue(undefined);

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '500'),
          simulation: buildSimulation(),
        }),
      ).rejects.toMatchObject({
        info: {
          reason: 'insufficient-source-balance',
          detail: ['Required: 500', 'Current: 100', 'Missing: 400'],
        },
      });
    });

    it('skips balance check when isPostQuote is true', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('0');

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({ isPostQuote: true }, '500'),
          simulation: buildSimulation({ transactions: [] }),
        }),
      ).toBeUndefined();
    });

    it('skips balance check when paymentOverride is set', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('0');

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote(
            { paymentOverride: { amount: '0', token: {} as never } },
            '500',
          ),
          simulation: buildSimulation({ transactions: [] }),
        }),
      ).toBeUndefined();
    });

    it('throws balance-unavailable when getLiveTokenBalance rejects', async () => {
      getLiveTokenBalanceMock.mockRejectedValue(new Error('RPC timeout'));

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote(),
          simulation: buildSimulation(),
        }),
      ).rejects.toMatchObject({
        info: {
          reason: 'balance-unavailable',
          message: 'Unable to verify balance',
          detail: ['RPC timeout'],
        },
      });
    });
  });

  describe('decoded transfer check', () => {
    it('throws insufficient-transfer-balance when decoded transfer exceeds live balance', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('100');

      // Build a simulation with a transfer of 500 to the source token address
      const simulation = buildSimulation({
        transactions: [
          {
            data: TRANSFER_DATA_MOCK as Hex,
            from: FROM_MOCK,
            to: TOKEN_ADDRESS_MOCK,
          },
        ],
      });

      // Make balance check pass but decoded transfer check fail
      // by making the required source amount small but the decoded transfer large
      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '50'), // source amount 50 < balance 100 → passes
          simulation,
        }),
      ).rejects.toMatchObject({
        info: {
          reason: 'insufficient-transfer-balance',
          message: 'Insufficient source balance for decoded transfer',
        },
      });
    });

    it('skips decoded transfer check for native source token', async () => {
      const nativeAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      getNativeTokenMock.mockReturnValue(nativeAddress);

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({ sourceTokenAddress: nativeAddress }, '50'),
          simulation: buildSimulation({
            transactions: [
              {
                data: TRANSFER_DATA_MOCK as Hex,
                from: FROM_MOCK,
                to: nativeAddress as Hex,
              },
            ],
          }),
        }),
      ).toBeUndefined();
    });

    it('ignores transactions with no data when decoding transfers', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('1000');

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '50'),
          simulation: buildSimulation({
            transactions: [
              { from: FROM_MOCK, to: TOKEN_ADDRESS_MOCK }, // no data
            ],
          }),
        }),
      ).toBeUndefined();
    });

    it('ignores transactions with non-transfer data', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('1000');

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote({}, '50'),
          simulation: buildSimulation({
            transactions: [
              {
                data: '0xdeadbeef' as Hex, // not a transfer selector
                from: FROM_MOCK,
                to: TOKEN_ADDRESS_MOCK,
              },
            ],
          }),
        }),
      ).toBeUndefined();
    });
  });

  describe('simulation', () => {
    it('passes when simulation succeeds', async () => {
      simulateQuoteTransactionsMock.mockResolvedValue(undefined);

      expect(
        await validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote(),
          simulation: buildSimulation(),
        }),
      ).toBeUndefined();
    });

    it('throws simulation-failed QuoteError when simulation throws TransactionPaySimulationError', async () => {
      simulateQuoteTransactionsMock.mockRejectedValue(
        new TransactionPaySimulationError('execution reverted'),
      );

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote(),
          simulation: buildSimulation(),
        }),
      ).rejects.toMatchObject({
        info: {
          reason: 'simulation-failed',
          message: 'Quote simulation failed',
          detail: ['execution reverted'],
        },
      });
    });

    it('re-throws non-simulation errors from simulation step', async () => {
      const unexpectedError = new Error('unexpected');
      simulateQuoteTransactionsMock.mockRejectedValue(unexpectedError);

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote(),
          simulation: buildSimulation(),
        }),
      ).rejects.toThrow('unexpected');
    });
  });

  describe('abort signal', () => {
    it('throws when signal is already aborted before validation starts', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote(),
          signal: controller.signal,
          simulation: buildSimulation(),
        }),
      ).rejects.toThrow('Quote validation aborted');
    });

    it('throws when signal is aborted after simulation throws', async () => {
      const controller = new AbortController();

      simulateQuoteTransactionsMock.mockImplementation(async () => {
        controller.abort();
        throw new TransactionPaySimulationError('sim error');
      });

      await expect(
        validateQuoteExecution({
          messenger: messengerMock.messenger,
          quote: buildQuote(),
          signal: controller.signal,
          simulation: buildSimulation(),
        }),
      ).rejects.toThrow('Quote validation aborted');
    });
  });
});

describe('isQuoteError', () => {
  it('returns true for a QuoteError instance', () => {
    const error = new QuoteError({
      message: 'test',
      reason: 'simulation-failed',
    });
    expect(isQuoteError(error)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isQuoteError(new Error('plain'))).toBe(false);
  });

  it('returns false for a non-error value', () => {
    expect(isQuoteError('string error')).toBe(false);
    expect(isQuoteError(null)).toBe(false);
    expect(isQuoteError(undefined)).toBe(false);
  });
});
