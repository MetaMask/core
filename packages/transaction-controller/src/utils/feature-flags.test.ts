import { Messenger } from '@metamask/base-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionControllerFeatureFlags } from './feature-flags';
import {
  FEATURE_FLAG_EIP_7702,
  FEATURE_FLAG_TRANSACTIONS,
  getAcceleratedPollingParams,
  getBatchSizeLimit,
  getEIP7702ContractAddresses,
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
  getGasFeeRandomisation,
  getGasEstimateFallback,
  getGasEstimateBuffer,
} from './feature-flags';
import { isValidSignature } from './signature';
import type { TransactionControllerMessenger } from '..';

jest.mock('./signature');

const CHAIN_ID_MOCK = '0x123' as Hex;
const CHAIN_ID_2_MOCK = '0xabc' as Hex;
const ADDRESS_MOCK = '0x1234567890abcdef1234567890abcdef12345678' as Hex;
const ADDRESS_2_MOCK = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const PUBLIC_KEY_MOCK = '0x321' as Hex;
const SIGNATURE_MOCK = '0xcba' as Hex;
const DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK = 35;
const GAS_ESTIMATE_FALLBACK_MOCK = 50;
const FIXED_GAS_MOCK = 100000;
const GAS_BUFFER_MOCK = 1.2;
const GAS_BUFFER_2_MOCK = 1.5;
const GAS_BUFFER_3_MOCK = 2.0;

describe('Feature Flags Utils', () => {
  let baseMessenger: Messenger<
    RemoteFeatureFlagControllerGetStateAction,
    never
  >;

  let controllerMessenger: TransactionControllerMessenger;

  let getFeatureFlagsMock: jest.MockedFn<
    RemoteFeatureFlagControllerGetStateAction['handler']
  >;

  const isValidSignatureMock = jest.mocked(isValidSignature);

  /**
   * Mocks the feature flags returned by the remote feature flag controller.
   *
   * @param featureFlags - The feature flags to mock.
   */
  function mockFeatureFlags(featureFlags: TransactionControllerFeatureFlags) {
    getFeatureFlagsMock.mockReturnValue({
      cacheTimestamp: 0,
      remoteFeatureFlags: featureFlags,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    getFeatureFlagsMock = jest.fn();

    baseMessenger = new Messenger();

    baseMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      getFeatureFlagsMock,
    );

    controllerMessenger = baseMessenger.getRestricted({
      name: 'TransactionController',
      allowedActions: ['RemoteFeatureFlagController:getState'],
      allowedEvents: [],
    });

    isValidSignatureMock.mockReturnValue(true);
  });

  describe('getEIP7702SupportedChains', () => {
    it('returns value from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          supportedChains: [CHAIN_ID_MOCK, CHAIN_ID_2_MOCK],
        },
      });

      expect(getEIP7702SupportedChains(controllerMessenger)).toStrictEqual([
        CHAIN_ID_MOCK,
        CHAIN_ID_2_MOCK,
      ]);
    });

    it('returns empty array if undefined', () => {
      mockFeatureFlags({});
      expect(getEIP7702SupportedChains(controllerMessenger)).toStrictEqual([]);
    });
  });

  describe('getEIP7702ContractAddresses', () => {
    it('returns value from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [CHAIN_ID_MOCK]: [
              { address: ADDRESS_MOCK, signature: SIGNATURE_MOCK },
              { address: ADDRESS_2_MOCK, signature: SIGNATURE_MOCK },
            ],
          },
        },
      });

      expect(
        getEIP7702ContractAddresses(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toStrictEqual([ADDRESS_MOCK, ADDRESS_2_MOCK]);
    });

    it('returns empty array if undefined', () => {
      mockFeatureFlags({});

      expect(
        getEIP7702ContractAddresses(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toStrictEqual([]);
    });

    it('returns empty array if chain ID not found', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [CHAIN_ID_2_MOCK]: [
              { address: ADDRESS_MOCK, signature: SIGNATURE_MOCK },
              { address: ADDRESS_2_MOCK, signature: SIGNATURE_MOCK },
            ],
          },
        },
      });

      expect(
        getEIP7702ContractAddresses(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toStrictEqual([]);
    });

    it('does not return contracts with invalid signature', () => {
      isValidSignatureMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [CHAIN_ID_MOCK]: [
              { address: ADDRESS_MOCK, signature: SIGNATURE_MOCK },
              { address: ADDRESS_2_MOCK, signature: SIGNATURE_MOCK },
            ],
          },
        },
      });

      expect(
        getEIP7702ContractAddresses(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toStrictEqual([ADDRESS_2_MOCK]);
    });

    it('does not return contracts with missing signature', () => {
      isValidSignatureMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [CHAIN_ID_MOCK]: [
              { address: ADDRESS_MOCK, signature: undefined as never },
              { address: ADDRESS_2_MOCK, signature: SIGNATURE_MOCK },
            ],
          },
        },
      });

      expect(
        getEIP7702ContractAddresses(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toStrictEqual([ADDRESS_2_MOCK]);
    });

    it('validates signature using padded chain ID', () => {
      const chainId = '0x539' as const;

      isValidSignatureMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [chainId]: [{ address: ADDRESS_MOCK, signature: SIGNATURE_MOCK }],
          },
        },
      });

      getEIP7702ContractAddresses(
        chainId,
        controllerMessenger,
        PUBLIC_KEY_MOCK,
      );

      expect(isValidSignatureMock).toHaveBeenCalledWith(
        [ADDRESS_MOCK, `0x0539`],
        SIGNATURE_MOCK,
        PUBLIC_KEY_MOCK,
      );
    });
  });

  describe('getEIP7702UpgradeContractAddress', () => {
    it('returns first contract address for chain', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [CHAIN_ID_MOCK]: [
              { address: ADDRESS_MOCK, signature: SIGNATURE_MOCK },
              { address: ADDRESS_2_MOCK, signature: SIGNATURE_MOCK },
            ],
          },
        },
      });

      expect(
        getEIP7702UpgradeContractAddress(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toStrictEqual(ADDRESS_MOCK);
    });

    it('returns undefined if no contract addresses', () => {
      mockFeatureFlags({});

      expect(
        getEIP7702UpgradeContractAddress(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toBeUndefined();
    });

    it('returns undefined if empty contract addresses', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [CHAIN_ID_MOCK]: [],
          },
        },
      });

      expect(
        getEIP7702UpgradeContractAddress(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toBeUndefined();
    });

    it('returns first contract address with valid signature', () => {
      isValidSignatureMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

      mockFeatureFlags({
        [FEATURE_FLAG_EIP_7702]: {
          contracts: {
            [CHAIN_ID_MOCK]: [
              { address: ADDRESS_MOCK, signature: SIGNATURE_MOCK },
              { address: ADDRESS_2_MOCK, signature: SIGNATURE_MOCK },
            ],
          },
        },
      });

      expect(
        getEIP7702UpgradeContractAddress(
          CHAIN_ID_MOCK,
          controllerMessenger,
          PUBLIC_KEY_MOCK,
        ),
      ).toStrictEqual(ADDRESS_2_MOCK);
    });
  });

  describe('getBatchSizeLimit', () => {
    it('returns value from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          batchSizeLimit: 5,
        },
      });

      expect(getBatchSizeLimit(controllerMessenger)).toBe(5);
    });

    it('returns default value if undefined', () => {
      mockFeatureFlags({});
      expect(getBatchSizeLimit(controllerMessenger)).toBe(10);
    });
  });

  describe('getAcceleratedPollingParams', () => {
    it('returns default values if no feature flags set', () => {
      mockFeatureFlags({});

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK as Hex,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        countMax: 10,
        intervalMs: 3000,
      });
    });

    it('returns values from chain-specific config when available', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          acceleratedPolling: {
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                countMax: 5,
                intervalMs: 2000,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK as Hex,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        countMax: 5,
        intervalMs: 2000,
      });
    });

    it('returns default values from feature flag when no chain-specific config', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK as Hex,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        countMax: 15,
        intervalMs: 4000,
      });
    });

    it('uses chain-specific over default values', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                countMax: 5,
                intervalMs: 2000,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK as Hex,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        countMax: 5,
        intervalMs: 2000,
      });
    });

    it('uses defaults if chain not found in perChainConfig', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
            perChainConfig: {
              [CHAIN_ID_2_MOCK]: {
                countMax: 5,
                intervalMs: 2000,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK as Hex,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        countMax: 15,
        intervalMs: 4000,
      });
    });

    it('merges partial chain-specific config with defaults', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                // Only specify countMax, intervalMs should use default
                countMax: 5,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK as Hex,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        countMax: 5,
        intervalMs: 4000,
      });
    });
  });

  describe('getGasFeeRandomisation', () => {
    it('returns empty objects if no feature flags set', () => {
      mockFeatureFlags({});

      expect(getGasFeeRandomisation(controllerMessenger)).toStrictEqual({
        randomisedGasFeeDigits: {},
        preservedNumberOfDigits: undefined,
      });
    });

    it('returns values from feature flags when set', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasFeeRandomisation: {
            randomisedGasFeeDigits: {
              [CHAIN_ID_MOCK]: 3,
              [CHAIN_ID_2_MOCK]: 5,
            },
            preservedNumberOfDigits: 2,
          },
        },
      });

      expect(getGasFeeRandomisation(controllerMessenger)).toStrictEqual({
        randomisedGasFeeDigits: {
          [CHAIN_ID_MOCK]: 3,
          [CHAIN_ID_2_MOCK]: 5,
        },
        preservedNumberOfDigits: 2,
      });
    });

    it('returns empty randomisedGasFeeDigits if not set in feature flags', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasFeeRandomisation: {
            preservedNumberOfDigits: 2,
          },
        },
      });

      expect(getGasFeeRandomisation(controllerMessenger)).toStrictEqual({
        randomisedGasFeeDigits: {},
        preservedNumberOfDigits: 2,
      });
    });
  });

  describe('getGasEstimateFallback', () => {
    it('returns gas estimate fallback for specific chain ID from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasEstimateFallback: {
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                fixed: FIXED_GAS_MOCK,
                percentage: GAS_ESTIMATE_FALLBACK_MOCK,
              },
            },
          },
        },
      });

      expect(
        getGasEstimateFallback(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        fixed: FIXED_GAS_MOCK,
        percentage: GAS_ESTIMATE_FALLBACK_MOCK,
      });
    });

    it('returns default gas estimate fallback if specific chain ID is not found', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasEstimateFallback: {
            default: {
              fixed: undefined,
              percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
            },
          },
        },
      });

      expect(
        getGasEstimateFallback(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        fixed: undefined,
        percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
      });
    });
  });

  describe('getGasBufferEstimate', () => {
    it('returns default if no chain ID override', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasEstimateBuffer: {
            default: GAS_BUFFER_MOCK,
          },
        },
      });

      expect(
        getGasEstimateBuffer(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        buffer: GAS_BUFFER_MOCK,
        eip7702: undefined,
      });
    });

    it('returns chain ID override if defined', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasEstimateBuffer: {
            default: GAS_BUFFER_MOCK,
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                buffer: GAS_BUFFER_2_MOCK,
              },
            },
          },
        },
      });

      expect(
        getGasEstimateBuffer(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        buffer: GAS_BUFFER_2_MOCK,
        eip7702: undefined,
      });
    });

    it('returns eip7702 buffer if defined', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasEstimateBuffer: {
            default: GAS_BUFFER_MOCK,
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                buffer: GAS_BUFFER_2_MOCK,
                eip7702: GAS_BUFFER_3_MOCK,
              },
            },
          },
        },
      });

      expect(
        getGasEstimateBuffer(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        buffer: GAS_BUFFER_2_MOCK,
        eip7702: GAS_BUFFER_3_MOCK,
      });
    });

    it('returns no buffer if not defined', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {},
      });

      expect(
        getGasEstimateBuffer(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        buffer: 1.0,
        eip7702: undefined,
      });
    });
  });
});
