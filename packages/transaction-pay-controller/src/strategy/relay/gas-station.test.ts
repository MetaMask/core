import type { GasFeeToken } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  getGasStationEligibility,
  getGasStationCostInSourceTokenRaw,
} from './gas-station';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { getMessengerMock } from '../../tests/messenger-mock';
import { calculateGasFeeTokenCost } from '../../utils/gas';

jest.mock('../../utils/gas');

const REQUEST_MOCK = {
  from: '0x1234567890123456789012345678901234567891' as Hex,
  sourceChainId: '0x1' as Hex,
  sourceTokenAddress: '0xabc' as Hex,
};

const FIRST_STEP_DATA_MOCK = {
  data: '0x123',
  to: '0x2',
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

describe('gas-station', () => {
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);

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

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_eip_7702: {
          supportedChains: [REQUEST_MOCK.sourceChainId],
        },
      },
    });
  });

  it('returns eligible gas-station status for enabled supported chain', () => {
    const result = getGasStationEligibility(
      messenger,
      REQUEST_MOCK.sourceChainId,
    );

    expect(result).toStrictEqual({
      chainSupportsGasStation: true,
      isDisabledChain: false,
      isEligible: true,
    });
  });

  it('returns ineligible status when chain is disabled', () => {
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

    const result = getGasStationEligibility(
      messenger,
      REQUEST_MOCK.sourceChainId,
    );

    expect(result).toStrictEqual({
      chainSupportsGasStation: true,
      isDisabledChain: true,
      isEligible: false,
    });
  });

  it('returns undefined when no matching gas fee token exists', async () => {
    getGasFeeTokensMock.mockResolvedValue([
      {
        ...MATCHING_GAS_FEE_TOKEN,
        tokenAddress: '0xdef' as Hex,
      },
    ]);

    const result = await getGasStationCostInSourceTokenRaw({
      firstStepData: FIRST_STEP_DATA_MOCK,
      messenger,
      request: REQUEST_MOCK,
      totalGasEstimate: 100,
      totalItemCount: 1,
    });

    expect(result).toBeUndefined();
  });

  it('normalizes amount for multi-item gas estimation', async () => {
    getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);

    await getGasStationCostInSourceTokenRaw({
      firstStepData: FIRST_STEP_DATA_MOCK,
      messenger,
      request: REQUEST_MOCK,
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
      {
        ...MATCHING_GAS_FEE_TOKEN,
        amount: '300' as Hex,
        gas: '100' as Hex,
      },
    ]);

    await getGasStationCostInSourceTokenRaw({
      firstStepData: FIRST_STEP_DATA_MOCK,
      messenger,
      request: REQUEST_MOCK,
      totalGasEstimate: 100,
      totalItemCount: 2,
    });

    expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gasFeeToken: expect.objectContaining({ amount: '0x12c' }),
      }),
    );
  });
});
