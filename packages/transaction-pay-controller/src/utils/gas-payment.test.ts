import type { GasFeeToken } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import { getMessengerMock } from '../tests/messenger-mock.js';
import type { GasPayment } from './gas-payment.js';
import {
  shouldUseGasStation,
  GasPaymentMode,
  resolveGasPayment,
  resolveGasStationCost,
} from './gas-payment.js';
import { calculateGasFeeTokenCost } from './gas.js';
import { getTokenBalance } from './token.js';

jest.mock('./gas');
jest.mock('./token', () => ({
  ...jest.requireActual('./token'),
  getTokenBalance: jest.fn(),
}));

const REQUEST_MOCK = {
  from: '0x1234567890123456789012345678901234567891' as Hex,
  sourceChainId: '0x1' as Hex,
  sourceTokenAddress: '0xabc' as Hex,
};

const FIRST_STEP_DATA_MOCK = {
  data: '0x123' as Hex,
  to: '0x2' as Hex,
  value: '0x0',
};

const MATCHING_GAS_FEE_TOKEN: GasFeeToken = {
  amount: '0x64',
  balance: '0x0',
  decimals: 6,
  gas: '0x64',
  maxFeePerGas: '0x1',
  maxPriorityFeePerGas: '0x1',
  rateWei: '0x1',
  recipient: REQUEST_MOCK.from,
  symbol: 'USDC',
  tokenAddress: REQUEST_MOCK.sourceTokenAddress,
};

const TRANSACTION_MOCK = {
  chainId: REQUEST_MOCK.sourceChainId,
  isGasFeeSponsored: true,
};

const SPONSORED_ROUTE_REQUEST_MOCK = {
  sourceChainId: REQUEST_MOCK.sourceChainId,
  targetChainId: REQUEST_MOCK.sourceChainId,
};

describe('gas-payment', () => {
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);

  const {
    messenger,
    getGasFeeTokensMock,
    getRemoteFeatureFlagControllerStateMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    getTokenBalanceMock.mockReturnValue('0');

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_eip_7702: {
          supportedChains: [REQUEST_MOCK.sourceChainId],
        },
      },
    });
  });

  describe('shouldUseGasStation', () => {
    const RESERVE_REQUEST_MOCK = {
      messenger,
      nativeGasCostRaw: undefined,
      request: REQUEST_MOCK,
    };

    it('returns true for an enabled supported chain', () => {
      expect(shouldUseGasStation(RESERVE_REQUEST_MOCK)).toBe(true);
    });

    it('returns false when native balance already covers the gas cost', () => {
      getTokenBalanceMock.mockReturnValue('100');

      expect(
        shouldUseGasStation({
          ...RESERVE_REQUEST_MOCK,
          nativeGasCostRaw: '100',
        }),
      ).toBe(false);
    });

    it('returns true when native balance is insufficient', () => {
      getTokenBalanceMock.mockReturnValue('99');

      expect(
        shouldUseGasStation({
          ...RESERVE_REQUEST_MOCK,
          nativeGasCostRaw: '100',
        }),
      ).toBe(true);
    });

    it('returns false when the chain is explicitly disabled', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_eip_7702: {
            supportedChains: [REQUEST_MOCK.sourceChainId],
          },
          confirmations_pay: {
            relayDisabledGasStationChains: [REQUEST_MOCK.sourceChainId],
          },
        },
      });

      expect(shouldUseGasStation(RESERVE_REQUEST_MOCK)).toBe(false);
    });

    it('returns false when the chain does not support EIP-7702', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(shouldUseGasStation(RESERVE_REQUEST_MOCK)).toBe(false);
    });
  });

  describe('resolveGasPayment', () => {
    const PAYMENT_REQUEST_MOCK = {
      sourceTokenAddress: REQUEST_MOCK.sourceTokenAddress,
    };

    const SPONSORED_MOCK = {
      accountSupports7702: true,
      request: SPONSORED_ROUTE_REQUEST_MOCK,
      transaction: TRANSACTION_MOCK,
    };

    const UNSPONSORED_MOCK = {
      ...SPONSORED_MOCK,
      accountSupports7702: false,
    };

    it('prefers delegation over every other funding source', () => {
      expect(
        resolveGasPayment({
          ...PAYMENT_REQUEST_MOCK,
          excludeNativeTokenForFee: true,
          isDelegated: true,
          isSourceGasFeeToken: true,
          sponsorship: SPONSORED_MOCK,
        }),
      ).toStrictEqual({ mode: GasPaymentMode.Delegation });
    });

    it('prefers sponsorship over a gas fee token', () => {
      expect(
        resolveGasPayment({
          ...PAYMENT_REQUEST_MOCK,
          isSourceGasFeeToken: true,
          sponsorship: SPONSORED_MOCK,
        }),
      ).toStrictEqual({
        isGasFeeSponsored: true,
        mode: GasPaymentMode.Sponsored,
      });
    });

    it('charges the source token when the quote priced gas in it', () => {
      expect(
        resolveGasPayment({
          ...PAYMENT_REQUEST_MOCK,
          isSourceGasFeeToken: true,
        }),
      ).toStrictEqual({
        gasFeeToken: REQUEST_MOCK.sourceTokenAddress,
        mode: GasPaymentMode.GasFeeToken,
      });
    });

    it('excludes native token for fee only when the strategy opts in', () => {
      expect(
        resolveGasPayment({
          ...PAYMENT_REQUEST_MOCK,
          excludeNativeTokenForFee: true,
          isSourceGasFeeToken: true,
        }),
      ).toStrictEqual({
        excludeNativeTokenForFee: true,
        gasFeeToken: REQUEST_MOCK.sourceTokenAddress,
        mode: GasPaymentMode.GasFeeToken,
      });
    });

    it('falls back to native gas', () => {
      expect(resolveGasPayment(PAYMENT_REQUEST_MOCK)).toStrictEqual({
        mode: GasPaymentMode.Native,
      });
    });

    it('keeps an explicit unsponsored flag distinct from no signal', () => {
      expect(
        resolveGasPayment({
          ...PAYMENT_REQUEST_MOCK,
          sponsorship: UNSPONSORED_MOCK,
        }),
      ).toStrictEqual({
        isGasFeeSponsored: false,
        mode: GasPaymentMode.Native,
      });
    });
  });

  describe('sponsorship', () => {
    const SPONSORSHIP_MOCK = {
      accountSupports7702: true,
      request: SPONSORED_ROUTE_REQUEST_MOCK,
      transaction: TRANSACTION_MOCK,
    };

    /**
     * Resolve the mode for a sponsorship input.
     *
     * @param sponsorship - Sponsorship overrides.
     * @returns The resolved gas payment.
     */
    function resolve(sponsorship: Record<string, unknown>): GasPayment {
      return resolveGasPayment({
        sourceTokenAddress: REQUEST_MOCK.sourceTokenAddress,
        sponsorship: { ...SPONSORSHIP_MOCK, ...sponsorship },
      });
    }

    it('sponsors a supported account on a same-chain route', () => {
      expect(resolve({})).toStrictEqual({
        isGasFeeSponsored: true,
        mode: GasPaymentMode.Sponsored,
      });
    });

    it('does not sponsor when the account cannot sign EIP-7702 authorizations', () => {
      expect(resolve({ accountSupports7702: false })).toStrictEqual({
        isGasFeeSponsored: false,
        mode: GasPaymentMode.Native,
      });
    });

    it.each(['sourceChainId', 'targetChainId'] as const)(
      'does not sponsor when %s differs from the transaction chain',
      (chainIdKey) => {
        expect(
          resolve({
            request: { ...SPONSORED_ROUTE_REQUEST_MOCK, [chainIdKey]: '0x2' },
          }),
        ).toStrictEqual({
          isGasFeeSponsored: false,
          mode: GasPaymentMode.Native,
        });
      },
    );

    it('leaves the flag unset when the transaction carries no sponsorship signal', () => {
      expect(
        resolve({ transaction: { chainId: REQUEST_MOCK.sourceChainId } }),
      ).toStrictEqual({ mode: GasPaymentMode.Native });
    });

    it('leaves the flag unset when the strategy never sponsors', () => {
      expect(
        resolveGasPayment({
          sourceTokenAddress: REQUEST_MOCK.sourceTokenAddress,
        }),
      ).toStrictEqual({ mode: GasPaymentMode.Native });
    });
  });

  describe('resolveGasStationCost', () => {
    const RESOLVE_REQUEST_MOCK = {
      firstStepData: FIRST_STEP_DATA_MOCK,
      messenger,
      request: REQUEST_MOCK,
      totalGasEstimate: 100,
      totalItemCount: 1,
    };

    it('returns the gas station cost when every gate passes', async () => {
      getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);

      expect(await resolveGasStationCost(RESOLVE_REQUEST_MOCK)).toStrictEqual({
        amount: { fiat: '0', human: '0', raw: '100', usd: '0' },
        isAvailable: true,
      });
    });

    it('reports availability when no fee token matches the source token', async () => {
      getGasFeeTokensMock.mockResolvedValue([]);

      expect(await resolveGasStationCost(RESOLVE_REQUEST_MOCK)).toStrictEqual({
        amount: undefined,
        isAvailable: true,
      });
    });

    it('ignores fee tokens that are not the source token', async () => {
      getGasFeeTokensMock.mockResolvedValue([
        { ...MATCHING_GAS_FEE_TOKEN, tokenAddress: '0xdef' as Hex },
      ]);

      expect(await resolveGasStationCost(RESOLVE_REQUEST_MOCK)).toStrictEqual({
        amount: undefined,
        isAvailable: true,
      });
    });

    it('scales the fee token amount across a multi-item estimate', async () => {
      getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);

      await resolveGasStationCost({
        ...RESOLVE_REQUEST_MOCK,
        totalGasEstimate: 300,
        totalItemCount: 2,
      });

      expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeToken: expect.objectContaining({ amount: '0x12c' }),
        }),
      );
    });

    it('supports decimal simulation values in gas fee token fields', async () => {
      getGasFeeTokensMock.mockResolvedValue([
        { ...MATCHING_GAS_FEE_TOKEN, amount: '300' as Hex, gas: '100' as Hex },
      ]);

      await resolveGasStationCost({
        ...RESOLVE_REQUEST_MOCK,
        totalItemCount: 2,
      });

      expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeToken: expect.objectContaining({ amount: '0x12c' }),
        }),
      );
    });

    it('defaults a missing step value to zero', async () => {
      getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);

      await resolveGasStationCost({
        ...RESOLVE_REQUEST_MOCK,
        firstStepData: { data: '0x123' as Hex, to: '0x2' as Hex },
      });

      expect(getGasFeeTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({ value: '0x0' }),
      );
    });

    it('keeps the raw fee token amount when the gas estimate is zero', async () => {
      getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);

      await resolveGasStationCost({
        ...RESOLVE_REQUEST_MOCK,
        totalGasEstimate: 0,
        totalItemCount: 2,
      });

      expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeToken: expect.objectContaining({ amount: '0x64' }),
        }),
      );
    });

    it('keeps the raw fee token amount when the fee token reports no gas', async () => {
      getGasFeeTokensMock.mockResolvedValue([
        { ...MATCHING_GAS_FEE_TOKEN, gas: '0x0' as Hex },
      ]);

      await resolveGasStationCost({
        ...RESOLVE_REQUEST_MOCK,
        totalItemCount: 2,
      });

      expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeToken: expect.objectContaining({ amount: '0x64' }),
        }),
      );
    });

    it('returns no amount when the gas fee token estimate fails', async () => {
      getGasFeeTokensMock.mockRejectedValue(new Error('estimate failed'));

      expect(await resolveGasStationCost(RESOLVE_REQUEST_MOCK)).toStrictEqual({
        amount: undefined,
        isAvailable: true,
      });
    });

    it('returns no amount when fiat rates cannot price the fee token', async () => {
      getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);
      calculateGasFeeTokenCostMock.mockReturnValue(undefined);

      expect(await resolveGasStationCost(RESOLVE_REQUEST_MOCK)).toStrictEqual({
        amount: undefined,
        isAvailable: true,
      });
    });

    it('simulates from the fee token account when overridden', async () => {
      const PROXY_ADDRESS_MOCK = '0xdeadbeef' as Hex;
      getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);

      await resolveGasStationCost({
        ...RESOLVE_REQUEST_MOCK,
        feeTokenAccount: PROXY_ADDRESS_MOCK,
      });

      expect(getGasFeeTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: PROXY_ADDRESS_MOCK }),
      );
    });

    it('skips the gas station when the account does not support EIP-7702', async () => {
      expect(
        await resolveGasStationCost({
          ...RESOLVE_REQUEST_MOCK,
          accountSupports7702: false,
        }),
      ).toStrictEqual({ isAvailable: false });

      expect(getGasFeeTokensMock).not.toHaveBeenCalled();
    });

    it('skips the gas station when native balance covers the gas cost', async () => {
      getTokenBalanceMock.mockReturnValue('100');

      expect(
        await resolveGasStationCost({
          ...RESOLVE_REQUEST_MOCK,
          nativeGasCostRaw: '100',
        }),
      ).toStrictEqual({ isAvailable: false });

      expect(getGasFeeTokensMock).not.toHaveBeenCalled();
    });

    it('consults the gas station when native balance is insufficient', async () => {
      getTokenBalanceMock.mockReturnValue('99');
      getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);

      expect(
        await resolveGasStationCost({
          ...RESOLVE_REQUEST_MOCK,
          nativeGasCostRaw: '100',
        }),
      ).toStrictEqual({
        amount: { fiat: '0', human: '0', raw: '100', usd: '0' },
        isAvailable: true,
      });
    });

    it('skips the gas station when the chain is ineligible', async () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {},
      });

      expect(await resolveGasStationCost(RESOLVE_REQUEST_MOCK)).toStrictEqual({
        isAvailable: false,
      });

      expect(getGasFeeTokensMock).not.toHaveBeenCalled();
    });
  });
});
