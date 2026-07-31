import type { InternalAccount } from '@metamask/keyring-internal-api';

import { mockBridgeQuotesSolErc20V1 } from '../../tests/mock-quotes-sol-erc20.js';
import { ChainId } from '../types.js';
import type {
  BridgeControllerMessenger,
  NonEvmBalanceError,
} from '../types.js';
import type { QuoteResponseV1 } from '../validators/quote-response-v1.js';
import { appendFeesToQuotes } from './quote-fees.js';

const balanceError: NonEvmBalanceError = {
  code: 'InsufficientBalance',
  assetId: 'stellar:pubnet/slip44:148',
  availableAmount: '0',
  requiredAmount: '1.25',
};

const balanceFeeError: NonEvmBalanceError = {
  ...balanceError,
  code: 'InsufficientBalanceToCoverFee',
};

const balanceErrorWithReserve: NonEvmBalanceError = {
  ...balanceError,
  reserveAmount: '1.5',
};

const stellarQuote: QuoteResponseV1 = {
  ...mockBridgeQuotesSolErc20V1[0],
  quote: {
    ...mockBridgeQuotesSolErc20V1[0].quote,
    srcChainId: ChainId.STELLAR,
  },
};

const selectedAccount = {
  id: 'stellar-account',
  metadata: {
    snap: {
      id: 'npm:@metamask/stellar-wallet-snap',
    },
  },
} as InternalAccount;

const getQuotesWithFeeError = async (
  error: unknown,
): Promise<Awaited<ReturnType<typeof appendFeesToQuotes>>> => {
  const messenger = {
    call: jest.fn().mockRejectedValue(error),
  } as unknown as BridgeControllerMessenger;

  return await appendFeesToQuotes(
    [stellarQuote],
    messenger,
    jest.fn(),
    selectedAccount,
  );
};

describe('appendFeesToQuotes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      'directly on the error data',
      {
        data: balanceError,
      },
      balanceError,
    ],
    [
      'on nested cause data',
      {
        data: {
          cause: {
            data: balanceFeeError,
          },
        },
      },
      balanceFeeError,
    ],
    [
      'with a reserve amount',
      {
        data: balanceErrorWithReserve,
      },
      balanceErrorWithReserve,
    ],
  ])(
    'returns a balance error found %s',
    async (_description, error, expectedBalanceError) => {
      const quotes = await getQuotesWithFeeError(error);

      expect(quotes).toStrictEqual([
        {
          ...stellarQuote,
          nonEvmFeesInNative: undefined,
          nonEvmBalanceError: expectedBalanceError,
        },
      ]);
    },
  );

  it.each([
    ['a non-object error', new Error('Failed to compute fees')],
    ['missing data', {}],
    ['non-object data', { data: null }],
    ['missing nested cause', { data: {} }],
    ['a non-object nested cause', { data: { cause: null } }],
    ['missing nested cause data', { data: { cause: {} } }],
    ['non-object nested cause data', { data: { cause: { data: null } } }],
    [
      'an unsupported code',
      { data: { ...balanceError, code: 'UnknownError' } },
    ],
    ['a missing asset ID', { data: { ...balanceError, assetId: undefined } }],
    ['a non-string asset ID', { data: { ...balanceError, assetId: 1 } }],
    ['an empty asset ID', { data: { ...balanceError, assetId: '' } }],
    [
      'a missing available amount',
      { data: { ...balanceError, availableAmount: undefined } },
    ],
    [
      'a non-string available amount',
      { data: { ...balanceError, availableAmount: 0 } },
    ],
    [
      'an invalid available amount',
      { data: { ...balanceError, availableAmount: '01' } },
    ],
    [
      'a missing required amount',
      { data: { ...balanceError, requiredAmount: undefined } },
    ],
    [
      'a non-string required amount',
      { data: { ...balanceError, requiredAmount: 1 } },
    ],
    [
      'an invalid required amount',
      { data: { ...balanceError, requiredAmount: '-1' } },
    ],
    [
      'a non-string reserve amount',
      { data: { ...balanceError, reserveAmount: 1 } },
    ],
    [
      'an invalid reserve amount',
      { data: { ...balanceError, reserveAmount: 'abc' } },
    ],
  ])('ignores %s', async (_description, error) => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(jest.fn());

    const quotes = await getQuotesWithFeeError(error);

    expect(quotes).toStrictEqual([
      {
        ...stellarQuote,
        nonEvmFeesInNative: undefined,
      },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to compute non-EVM fees for quote ${stellarQuote.quote.requestId}:`,
      error,
    );
  });
});
