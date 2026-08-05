import type {
  Quote as RampsQuote,
  QuotesResponse as RampsQuotesResponse,
} from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  NATIVE_TOKEN_ADDRESS,
  TransactionPayStrategy,
} from '../../constants.js';
import type {
  PayStrategyGetQuotesRequest,
  TransactionFiatPayment,
  TransactionPayQuote,
  TransactionPayRequiredToken,
} from '../../types.js';
import {
  buildCaipAssetType,
  computeRawFromFiatAmount,
  getTokenFiatRate,
  getTokenInfo,
} from '../../utils/token.js';
import { getRelayQuotes } from '../relay/relay-quotes.js';
import type { RelayQuote } from '../relay/types.js';
import type { TransactionPayFiatAsset } from './constants.js';
import { DEFAULT_FIAT_CURRENCY, MUSD_MONAD_FIAT_ASSET } from './constants.js';
import { getFiatQuotes } from './fiat-quotes.js';
import {
  deriveFiatAssetForFiatPayment,
  getRawSourceAmountFromOrderCryptoAmount,
  isMoneyAccountDepositTransaction,
} from './utils.js';

jest.mock('../relay/relay-quotes');
jest.mock('../../utils/token');
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  deriveFiatAssetForFiatPayment: jest.fn(),
  getRawSourceAmountFromOrderCryptoAmount: jest.fn(),
  isMoneyAccountDepositTransaction: jest.fn(),
}));

const TRANSACTION_ID = 'tx-id';
const WALLET_ADDRESS = '0x1111111111111111111111111111111111111111' as Hex;

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID,
  txParams: { from: WALLET_ADDRESS },
  type: TransactionType.predictDeposit,
} as TransactionMeta;

const REQUIRED_TOKEN_MOCK: TransactionPayRequiredToken = {
  address: '0x2222222222222222222222222222222222222222' as Hex,
  allowUnderMinimum: false,
  amountFiat: '12',
  amountHuman: '12',
  amountRaw: '12000000',
  amountUsd: '12',
  balanceFiat: '0',
  balanceHuman: '0',
  balanceRaw: '0',
  balanceUsd: '0',
  chainId: '0x89',
  decimals: 6,
  skipIfBalance: false,
  symbol: 'USDC',
};

const FIAT_ASSET_MOCK: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000001010',
  chainId: '0x89',
};

const FIAT_QUOTE_MOCK: RampsQuote = {
  provider: '/providers/transak-native-staging',
  quote: {
    amountIn: 20,
    amountOut: 5,
    networkFee: 0.2,
    paymentMethod: '/payments/debit-credit-card',
    providerFee: 0.5,
  },
};

const FIAT_QUOTES_RESPONSE_MOCK: RampsQuotesResponse = {
  customActions: [],
  error: [],
  sorted: [],
  success: [FIAT_QUOTE_MOCK],
};

const AMOUNT_MOCK = {
  fiat: '0',
  human: '0',
  raw: '0',
  usd: '0',
};

function getRelayQuoteMock({
  isExecute,
  metaMaskUsd = '4',
  providerUsd = '1',
  sourceNetworkUsd = '2',
  targetNetworkUsd = '3',
}: {
  isExecute?: boolean;
  metaMaskUsd?: string;
  providerUsd?: string;
  sourceNetworkUsd?: string;
  targetNetworkUsd?: string;
} = {}): TransactionPayQuote<RelayQuote> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 1,
    fees: {
      isSourceGasFeeToken: false,
      isTargetGasFeeToken: false,
      metaMask: { fiat: metaMaskUsd, usd: metaMaskUsd },
      provider: { fiat: providerUsd, usd: providerUsd },
      sourceNetwork: {
        estimate: {
          fiat: sourceNetworkUsd,
          human: '0',
          raw: '0',
          usd: sourceNetworkUsd,
        },
        max: AMOUNT_MOCK,
      },
      targetNetwork: { fiat: targetNetworkUsd, usd: targetNetworkUsd },
    },
    original: (isExecute === undefined
      ? {}
      : { metamask: { isExecute } }) as RelayQuote,
    request: {} as never,
    sourceAmount: AMOUNT_MOCK,
    strategy: TransactionPayStrategy.Relay,
    targetAmount: { fiat: '0', usd: '0' },
  };
}

function getRequest({
  amountFiat = '10',
  fiatPaymentMethod = '/payments/debit-credit-card',
  rampsQuotes = FIAT_QUOTES_RESPONSE_MOCK,
  tokens = [REQUIRED_TOKEN_MOCK],
  throwsOnRampsQuotes,
}: {
  amountFiat?: string;
  fiatPaymentMethod?: string;
  rampsQuotes?: RampsQuotesResponse;
  tokens?: TransactionPayRequiredToken[];
  throwsOnRampsQuotes?: Error;
} = {}): {
  callMock: jest.Mock;
  request: PayStrategyGetQuotesRequest;
} {
  const callMock = jest.fn(
    (action: string, requestArg?: Record<string, unknown>) => {
      if (action === 'TransactionPayController:getState') {
        return {
          transactionData: {
            [TRANSACTION_ID]: {
              fiatPayment: {
                amountFiat,
              },
              isLoading: false,
              tokens,
            },
          },
        };
      }

      if (action === 'RampsController:getQuotes') {
        if (throwsOnRampsQuotes) {
          throw throwsOnRampsQuotes;
        }

        return rampsQuotes;
      }

      if (action === 'TransactionPayController:updateFiatPayment') {
        const { callback } = requestArg as unknown as {
          callback: (fiatPayment: TransactionFiatPayment) => void;
        };
        const fiatPayment: TransactionFiatPayment = {};
        callback(fiatPayment);
        return undefined;
      }

      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
      }

      throw new Error(`Unexpected action: ${action}`);
    },
  );

  return {
    callMock,
    request: {
      accountSupports7702: false,
      fiatPaymentMethod,
      from: WALLET_ADDRESS,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyGetQuotesRequest['messenger'],
      requests: [],
      transaction: TRANSACTION_MOCK,
    },
  };
}

const FIAT_ASSET_CAIP_ID_MOCK = 'eip155:137/slip44:966';

describe('getFiatQuotes', () => {
  const buildCaipAssetTypeMock = jest.mocked(buildCaipAssetType);
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const computeRawFromFiatAmountMock = jest.mocked(computeRawFromFiatAmount);
  const getRawSourceAmountFromOrderCryptoAmountMock = jest.mocked(
    getRawSourceAmountFromOrderCryptoAmount,
  );
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );
  const isMoneyAccountDepositTransactionMock = jest.mocked(
    isMoneyAccountDepositTransaction,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    buildCaipAssetTypeMock.mockReturnValue(FIAT_ASSET_CAIP_ID_MOCK);
    deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);
    isMoneyAccountDepositTransactionMock.mockReturnValue(false);
    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '2',
    });
    getTokenInfoMock.mockReturnValue({ decimals: 18, symbol: 'POL' });
    computeRawFromFiatAmountMock.mockReturnValue('5000000000000000000');
    getRawSourceAmountFromOrderCryptoAmountMock.mockReturnValue(
      '5000000000000000000',
    );
    getRelayQuotesMock.mockResolvedValue([getRelayQuoteMock()]);
  });

  describe('standard flow', () => {
    it('returns combined fiat quote and calls ramps with adjusted amount', async () => {
      const { callMock, request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
      expect(getRelayQuotesMock.mock.calls[0][0].requests).toStrictEqual([
        expect.objectContaining({
          from: WALLET_ADDRESS,
          isPostQuote: true,
          sourceChainId: FIAT_ASSET_MOCK.chainId,
          sourceTokenAddress: FIAT_ASSET_MOCK.address,
          sourceTokenAmount: '5000000000000000000',
          targetAmountMinimum: REQUIRED_TOKEN_MOCK.amountRaw,
          targetChainId: REQUIRED_TOKEN_MOCK.chainId,
          targetTokenAddress: REQUIRED_TOKEN_MOCK.address,
        }),
      ]);

      expect(callMock).toHaveBeenCalledWith(
        'RampsController:getQuotes',
        expect.objectContaining({
          amount: 18,
          assetId: FIAT_ASSET_CAIP_ID_MOCK,
          autoSelectProvider: true,
          fiat: 'USD',
          paymentMethods: ['/payments/debit-credit-card'],
          restrictToKnownOrNativeProviders: true,
          walletAddress: WALLET_ADDRESS,
        }),
      );

      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:updateFiatPayment',
        expect.objectContaining({
          callback: expect.any(Function),
          transactionId: TRANSACTION_ID,
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0].strategy).toBe(TransactionPayStrategy.Fiat);
      // provider = relay(1) + ramps(0.7) = 1.7
      expect(result[0].fees.provider).toStrictEqual({
        fiat: '1.7',
        usd: '1.7',
      });
      // providerFiat = ramps only (0.5 + 0.2 = 0.7)
      expect(result[0].fees.providerFiat).toStrictEqual({
        fiat: '0.7',
        usd: '0.7',
      });
      expect(result[0].fees.metaMask).toStrictEqual({
        fiat: '0.28',
        usd: '0.28',
      });
      expect(result[0].original).toStrictEqual({
        rampsQuote: FIAT_QUOTE_MOCK,
        relayQuote: {},
      });
    });

    it('includes sourceNetwork gas in adjusted amount when source is native token', async () => {
      const nativeFiatAsset: TransactionPayFiatAsset = {
        address: NATIVE_TOKEN_ADDRESS,
        chainId: '0x1',
      };
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(nativeFiatAsset);

      const { request } = getRequest();
      const result = await getFiatQuotes(request);

      expect(result).toHaveLength(1);
      // amountFiat(10) + provider(1) + sourceNetwork(2) + targetNetwork(3) + metaMask(4) = 20
      // ramps gets amount=20, providerFiat = ramps(0.5+0.2)=0.7
      expect(result[0].fees.provider).toStrictEqual({
        fiat: '1.7',
        usd: '1.7',
      });
    });

    it('returns empty array if amountFiat is missing', async () => {
      const { request } = getRequest({ amountFiat: '' });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if payment method is missing', async () => {
      const { request } = getRequest({ fiatPaymentMethod: '' });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if tokens array is empty', async () => {
      const { request } = getRequest({
        tokens: [],
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if tokens are undefined in transaction data', async () => {
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getState') {
          return {
            transactionData: {
              [TRANSACTION_ID]: {
                fiatPayment: {
                  amountFiat: '10',
                },
                isLoading: false,
              },
            },
          };
        }

        if (action === 'RemoteFeatureFlagController:getState') {
          return { remoteFeatureFlags: {} };
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      const result = await getFiatQuotes({
        accountSupports7702: false,
        fiatPaymentMethod: '/payments/debit-credit-card',
        from: WALLET_ADDRESS,
        messenger: {
          call: callMock,
        } as unknown as PayStrategyGetQuotesRequest['messenger'],
        requests: [],
        transaction: TRANSACTION_MOCK,
      });

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if source token fiat rate is missing', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined);
      const { request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if token info is unavailable', async () => {
      getTokenInfoMock.mockReturnValue(undefined);
      const { request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if computeRawFromFiatAmount returns undefined', async () => {
      computeRawFromFiatAmountMock.mockReturnValue(undefined);
      const { request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if source amount resolves to zero', async () => {
      computeRawFromFiatAmountMock.mockReturnValue(undefined);
      const { request } = getRequest({ amountFiat: '0' });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty array if relay quotes are unavailable', async () => {
      getRelayQuotesMock.mockResolvedValue([]);
      const { request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array if adjusted amount is non-positive', async () => {
      getRelayQuotesMock.mockResolvedValue([
        getRelayQuoteMock({
          metaMaskUsd: '0',
          providerUsd: '-20',
          sourceNetworkUsd: '0',
          targetNetworkUsd: '0',
        }),
      ]);
      const { callMock, request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(callMock).not.toHaveBeenCalledWith(
        'RampsController:getQuotes',
        expect.anything(),
      );
    });

    it('returns empty array if BigNumber adjusted amount is not finite', async () => {
      getRelayQuotesMock.mockResolvedValue([
        getRelayQuoteMock({
          metaMaskUsd: 'Infinity',
          providerUsd: '0',
          sourceNetworkUsd: '0',
          targetNetworkUsd: '0',
        }),
      ]);
      const { callMock, request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(callMock).not.toHaveBeenCalledWith(
        'RampsController:getQuotes',
        expect.anything(),
      );
    });

    it('returns empty array if adjusted amount overflows Number precision', async () => {
      getRelayQuotesMock.mockResolvedValue([
        getRelayQuoteMock({
          metaMaskUsd: '0',
          providerUsd: '1e309',
          sourceNetworkUsd: '0',
          targetNetworkUsd: '0',
        }),
      ]);
      const { callMock, request } = getRequest();

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(callMock).not.toHaveBeenCalledWith(
        'RampsController:getQuotes',
        expect.anything(),
      );
    });

    it('returns empty array if no quotes in success array', async () => {
      const { request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [],
          sorted: [],
          success: [],
        },
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('handles ramps response without success property', async () => {
      const { request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [],
          sorted: [],
        } as unknown as RampsQuotesResponse,
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('stores rampsQuote on fiat payment state via updateFiatPayment', async () => {
      const fiatPaymentState: TransactionFiatPayment = {};
      const callMock = jest.fn(
        (action: string, requestArg?: Record<string, unknown>) => {
          if (action === 'TransactionPayController:getState') {
            return {
              transactionData: {
                [TRANSACTION_ID]: {
                  fiatPayment: { amountFiat: '10' },
                  isLoading: false,
                  tokens: [REQUIRED_TOKEN_MOCK],
                },
              },
            };
          }

          if (action === 'RampsController:getQuotes') {
            return FIAT_QUOTES_RESPONSE_MOCK;
          }

          if (action === 'TransactionPayController:updateFiatPayment') {
            const { callback } = requestArg as unknown as {
              callback: (fp: TransactionFiatPayment) => void;
            };
            callback(fiatPaymentState);
            return undefined;
          }

          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }

          throw new Error(`Unexpected action: ${action}`);
        },
      );

      await getFiatQuotes({
        accountSupports7702: false,
        fiatPaymentMethod: '/payments/debit-credit-card',
        from: WALLET_ADDRESS,
        messenger: {
          call: callMock,
        } as unknown as PayStrategyGetQuotesRequest['messenger'],
        requests: [],
        transaction: TRANSACTION_MOCK,
      });

      expect(fiatPaymentState.rampsQuote).toStrictEqual(FIAT_QUOTE_MOCK);
    });

    it('returns empty array if ramps quotes fetch throws', async () => {
      const { request } = getRequest({
        throwsOnRampsQuotes: new Error('ramps failed'),
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('clears rampsQuote on fiat payment state when quote fetch fails', async () => {
      const fiatPaymentState: TransactionFiatPayment = {
        rampsQuote: FIAT_QUOTE_MOCK,
      };

      const callMock = jest.fn(
        (action: string, requestArg?: Record<string, unknown>) => {
          if (action === 'TransactionPayController:getState') {
            return {
              transactionData: {
                [TRANSACTION_ID]: {
                  fiatPayment: { amountFiat: '10' },
                  isLoading: false,
                  tokens: [REQUIRED_TOKEN_MOCK],
                },
              },
            };
          }

          if (action === 'RampsController:getQuotes') {
            throw new Error('ramps failed');
          }

          if (action === 'TransactionPayController:updateFiatPayment') {
            const { callback } = requestArg as unknown as {
              callback: (fp: TransactionFiatPayment) => void;
            };
            callback(fiatPaymentState);
            return undefined;
          }

          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }

          throw new Error(`Unexpected action: ${action}`);
        },
      );

      await getFiatQuotes({
        accountSupports7702: false,
        fiatPaymentMethod: '/payments/debit-credit-card',
        from: WALLET_ADDRESS,
        messenger: {
          call: callMock,
        } as unknown as PayStrategyGetQuotesRequest['messenger'],
        requests: [],
        transaction: TRANSACTION_MOCK,
      });

      expect(fiatPaymentState.rampsQuote).toBeUndefined();
    });

    it('returns empty array if multiple required tokens exist', async () => {
      const secondToken = {
        ...REQUIRED_TOKEN_MOCK,
        address: '0x3333333333333333333333333333333333333333' as Hex,
      };
      const { request } = getRequest({
        tokens: [REQUIRED_TOKEN_MOCK, secondToken],
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('sets providerFiat fee to zero when ramps provider/network fees are missing', async () => {
      const quoteWithoutFees: RampsQuote = {
        provider: '/providers/transak-native-staging',
        quote: {
          amountIn: 20,
          amountOut: 5,
          paymentMethod: '/payments/debit-credit-card',
        },
      };
      const { request } = getRequest({
        rampsQuotes: {
          customActions: [],
          error: [],
          sorted: [],
          success: [quoteWithoutFees],
        },
      });

      const result = await getFiatQuotes(request);

      expect(result).toHaveLength(1);
      expect(result[0].fees.providerFiat).toStrictEqual({
        fiat: '0',
        usd: '0',
      });
      // provider = relay(1) + ramps(0) = 1
      expect(result[0].fees.provider).toStrictEqual({ fiat: '1', usd: '1' });
    });
  });

  describe('direct mUSD flow', () => {
    const MONEY_ACCOUNT_ADDRESS =
      '0x2222222222222222222222222222222222222222' as Hex;

    const MONEY_ACCOUNT_TX = {
      id: TRANSACTION_ID,
      txParams: { from: MONEY_ACCOUNT_ADDRESS },
      type: TransactionType.batch,
      nestedTransactions: [
        { type: TransactionType.tokenMethodApprove },
        { type: TransactionType.moneyAccountDeposit },
      ],
    } as unknown as TransactionMeta;

    const MUSD_CAIP_ID_MOCK =
      'eip155:143/erc20:0xaca92e438df0b2401ff60da7e4337b687a2435da';

    const MUSD_TOKEN_MOCK: TransactionPayRequiredToken = {
      address: '0x3333333333333333333333333333333333333333' as Hex,
      allowUnderMinimum: false,
      amountFiat: '10',
      amountHuman: '10',
      amountRaw: '10000000',
      amountUsd: '10',
      balanceFiat: '0',
      balanceHuman: '0',
      balanceRaw: '0',
      balanceUsd: '0',
      chainId: '0x8f' as Hex,
      decimals: 6,
      skipIfBalance: false,
      symbol: 'MUSD',
    };

    function getDirectRequest({
      amountFiat = '10',
      fiatPaymentMethod = '/payments/debit-credit-card',
      rampsQuotes = FIAT_QUOTES_RESPONSE_MOCK,
      tokens = [MUSD_TOKEN_MOCK],
      throwsOnRampsQuotes,
    }: {
      amountFiat?: string;
      fiatPaymentMethod?: string;
      rampsQuotes?: RampsQuotesResponse;
      tokens?: TransactionPayRequiredToken[];
      throwsOnRampsQuotes?: Error;
    } = {}): {
      callMock: jest.Mock;
      request: PayStrategyGetQuotesRequest;
    } {
      const callMock = jest.fn(
        (action: string, requestArg?: Record<string, unknown>) => {
          if (action === 'TransactionPayController:getState') {
            return {
              transactionData: {
                [TRANSACTION_ID]: {
                  fiatPayment: { amountFiat },
                  isLoading: false,
                  tokens,
                },
              },
            };
          }

          if (action === 'RampsController:getQuotes') {
            if (throwsOnRampsQuotes) {
              throw throwsOnRampsQuotes;
            }

            return rampsQuotes;
          }

          if (action === 'TransactionPayController:updateFiatPayment') {
            const { callback } = requestArg as unknown as {
              callback: (fiatPayment: TransactionFiatPayment) => void;
            };
            const fiatPayment: TransactionFiatPayment = {};
            callback(fiatPayment);
            return undefined;
          }

          if (action === 'RemoteFeatureFlagController:getState') {
            return {
              remoteFeatureFlags: {
                confirmations_pay_fiat: {
                  directMoneyMusdEnabled: true,
                },
              },
            };
          }

          throw new Error(`Unexpected action: ${action}`);
        },
      );

      return {
        callMock,
        request: {
          accountSupports7702: true,
          fiatPaymentMethod,
          from: WALLET_ADDRESS,
          messenger: {
            call: callMock,
          } as unknown as PayStrategyGetQuotesRequest['messenger'],
          requests: [],
          transaction: MONEY_ACCOUNT_TX,
        },
      };
    }

    beforeEach(() => {
      isMoneyAccountDepositTransactionMock.mockReturnValue(true);
      buildCaipAssetTypeMock.mockReturnValue(MUSD_CAIP_ID_MOCK);
      getRelayQuotesMock.mockImplementation(async ({ requests }) => [
        {
          ...getRelayQuoteMock({ isExecute: true }),
          request: requests[0],
        },
      ]);
    });

    it('calls ramps quote with mUSD asset and money account address', async () => {
      const { callMock, request } = getDirectRequest();

      await getFiatQuotes(request);

      expect(callMock).toHaveBeenCalledWith('RampsController:getQuotes', {
        amount: 10,
        assetId: MUSD_CAIP_ID_MOCK,
        autoSelectProvider: true,
        fiat: DEFAULT_FIAT_CURRENCY,
        paymentMethods: ['/payments/debit-credit-card'],
        restrictToKnownOrNativeProviders: true,
        walletAddress: MONEY_ACCOUNT_ADDRESS,
      });
    });

    it('builds a direct pure-fiat quote without calling Relay', async () => {
      const { request } = getDirectRequest();

      const result = await getFiatQuotes(request);

      expect(getRelayQuotesMock).not.toHaveBeenCalled();
      expect(result[0]).toStrictEqual(
        expect.objectContaining({
          fees: expect.objectContaining({
            sourceNetwork: {
              estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
              max: { fiat: '0', human: '0', raw: '0', usd: '0' },
            },
            targetNetwork: { fiat: '0', usd: '0' },
          }),
          original: expect.objectContaining({
            relayQuote: undefined,
          }),
          request: expect.objectContaining({
            from: MONEY_ACCOUNT_ADDRESS,
            isDirectMusdMoneyAccount: true,
            recipient: MONEY_ACCOUNT_ADDRESS,
            sourceChainId: MUSD_MONAD_FIAT_ASSET.chainId,
            sourceTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
          }),
          strategy: TransactionPayStrategy.Fiat,
        }),
      );
    });

    it('does not require Relay execute for direct mUSD quoting', async () => {
      const { request } = getDirectRequest();

      const result = await getFiatQuotes(request);

      expect(result).toHaveLength(1);
      expect(result[0].original.relayQuote).toBeUndefined();
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns combined quote when direct quote succeeds', async () => {
      const { request } = getDirectRequest();

      const result = await getFiatQuotes(request);

      expect(result).toHaveLength(1);
      expect(result[0].strategy).toBe(TransactionPayStrategy.Fiat);
    });

    it('uses money account address as walletAddress for ramps quote', async () => {
      const { callMock, request } = getDirectRequest();

      await getFiatQuotes(request);

      const rampsCalls = callMock.mock.calls.filter(
        ([action]: [string]) => action === 'RampsController:getQuotes',
      );
      expect(rampsCalls[0]?.[1]).toStrictEqual(
        expect.objectContaining({
          walletAddress: MONEY_ACCOUNT_ADDRESS,
        }),
      );
    });

    it('returns empty when direct quote returns no providers', async () => {
      const { request } = getDirectRequest({
        rampsQuotes: { customActions: [], error: [], sorted: [], success: [] },
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty when direct quote throws', async () => {
      const { request } = getDirectRequest({
        throwsOnRampsQuotes: new Error('Network error'),
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty when direct flow inputs are missing', async () => {
      const emptyAmountResult = await getFiatQuotes(
        getDirectRequest({ amountFiat: '' }).request,
      );
      const emptyMethodResult = await getFiatQuotes(
        getDirectRequest({ fiatPaymentMethod: '' }).request,
      );
      const emptyTokensResult = await getFiatQuotes(
        getDirectRequest({ tokens: [] }).request,
      );

      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getState') {
          return {
            transactionData: {
              [TRANSACTION_ID]: {
                fiatPayment: { amountFiat: '10' },
                isLoading: false,
              },
            },
          };
        }
        if (action === 'RampsController:getQuotes') {
          return PROBE_SUCCESS_RESPONSE;
        }
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              confirmations_pay_fiat: {
                directMoneyMusdEnabled: true,
              },
            },
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      });
      const undefinedTokensResult = await getFiatQuotes({
        accountSupports7702: false,
        fiatPaymentMethod: '/payments/debit-credit-card',
        from: WALLET_ADDRESS,
        messenger: {
          call: callMock,
        } as unknown as PayStrategyGetQuotesRequest['messenger'],
        requests: [],
        transaction: MONEY_ACCOUNT_TX,
      });

      expect(emptyAmountResult).toStrictEqual([]);
      expect(emptyMethodResult).toStrictEqual([]);
      expect(emptyTokensResult).toStrictEqual([]);
      expect(undefinedTokensResult).toStrictEqual([]);
    });

    it('returns empty when direct flow has multiple tokens or invalid fiat amount', async () => {
      computeRawFromFiatAmountMock.mockReturnValue('5000000000000000000');

      const multiTokenResult = await getFiatQuotes(
        getDirectRequest({
          tokens: [
            MUSD_TOKEN_MOCK,
            {
              ...MUSD_TOKEN_MOCK,
              address: '0x4444444444444444444444444444444444444444' as Hex,
            },
          ],
        }).request,
      );

      const overflowResult = await getFiatQuotes(
        getDirectRequest({ amountFiat: '1e+309' }).request,
      );

      expect(multiTokenResult).toStrictEqual([]);
      expect(overflowResult).toStrictEqual([]);
    });

    it('returns empty when direct pure-fiat quote fails', async () => {
      getRawSourceAmountFromOrderCryptoAmountMock.mockImplementation(() => {
        throw new Error('Invalid fiat order crypto amount: 0');
      });

      const result = await getFiatQuotes(getDirectRequest().request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });

    it('sets caipAssetId and rampsQuote via updateFiatPayment', async () => {
      const { callMock, request } = getDirectRequest();

      await getFiatQuotes(request);

      const updateCalls = callMock.mock.calls.filter(
        ([action]: [string]) =>
          action === 'TransactionPayController:updateFiatPayment',
      );
      expect(updateCalls).toHaveLength(1);
    });

    it('returns empty when direct quote response has no success property', async () => {
      const { request } = getDirectRequest({
        rampsQuotes: {
          customActions: [],
          error: [],
          sorted: [],
        } as unknown as RampsQuotesResponse,
      });

      const result = await getFiatQuotes(request);

      expect(result).toStrictEqual([]);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
    });
  });
});
