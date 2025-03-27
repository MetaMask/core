import { Messenger } from '@metamask/base-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionControllerFeatureFlags } from './feature-flags';
import {
  FEATURE_FLAG_EIP_7702,
  FEATURE_FLAG_TRANSACTIONS,
  getBatchSizeLimit,
  getEIP7702ContractAddresses,
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
  getDefaultGasEstimateFallback,
  getGasEstimateFallback,
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
const DEFAULT_IS_FIXED_GAS_MOCK = false;
const CUSTOM_GAS_ESTIMATE_FALLBACK_MOCK = 50;
const CUSTOM_IS_FIXED_GAS_MOCK = true;
const CUSTOM_GAS_ESTIMATE_FALLBACK_HEX_MOCK = '0x5208' as Hex;

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

  describe('getDefaultGasEstimateFallback', () => {
    it('returns default gas estimate fallback from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          defaultGasEstimateFallback: {
            value: CUSTOM_GAS_ESTIMATE_FALLBACK_MOCK,
            isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
          },
        },
      });

      expect(getDefaultGasEstimateFallback(controllerMessenger)).toStrictEqual({
        gasEstimateFallback: CUSTOM_GAS_ESTIMATE_FALLBACK_MOCK,
        isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
      });
    });

    it('returns default gas estimate fallback as Hex from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          defaultGasEstimateFallback: {
            value: CUSTOM_GAS_ESTIMATE_FALLBACK_HEX_MOCK,
            isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
          },
        },
      });

      expect(getDefaultGasEstimateFallback(controllerMessenger)).toStrictEqual({
        gasEstimateFallback: CUSTOM_GAS_ESTIMATE_FALLBACK_HEX_MOCK,
        isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
      });
    });

    it('returns default values if undefined', () => {
      mockFeatureFlags({});
      expect(getDefaultGasEstimateFallback(controllerMessenger)).toStrictEqual({
        gasEstimateFallback: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
        isFixedGas: DEFAULT_IS_FIXED_GAS_MOCK,
      });
    });
  });

  describe('getGasEstimateFallback', () => {
    it('returns gas estimate fallback for specific chain ID from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasEstimateFallbacks: {
            [CHAIN_ID_MOCK]: {
              value: CUSTOM_GAS_ESTIMATE_FALLBACK_MOCK,
              isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
            },
          },
        },
      });

      expect(
        getGasEstimateFallback(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        gasEstimateFallback: CUSTOM_GAS_ESTIMATE_FALLBACK_MOCK,
        isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
      });
    });

    it('returns gas estimate fallback as Hex for specific chain ID from remote feature flag controller', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          gasEstimateFallbacks: {
            [CHAIN_ID_MOCK]: {
              value: CUSTOM_GAS_ESTIMATE_FALLBACK_HEX_MOCK,
              isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
            },
          },
        },
      });

      expect(
        getGasEstimateFallback(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        gasEstimateFallback: CUSTOM_GAS_ESTIMATE_FALLBACK_HEX_MOCK,
        isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
      });
    });

    it('returns default gas estimate fallback if specific chain ID is not found', () => {
      mockFeatureFlags({
        [FEATURE_FLAG_TRANSACTIONS]: {
          defaultGasEstimateFallback: {
            value: CUSTOM_GAS_ESTIMATE_FALLBACK_MOCK,
            isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
          },
        },
      });

      expect(
        getGasEstimateFallback(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        gasEstimateFallback: CUSTOM_GAS_ESTIMATE_FALLBACK_MOCK,
        isFixedGas: CUSTOM_IS_FIXED_GAS_MOCK,
      });
    });

    it('returns default values if both specific chain ID and default are undefined', () => {
      mockFeatureFlags({});
      expect(
        getGasEstimateFallback(CHAIN_ID_MOCK, controllerMessenger),
      ).toStrictEqual({
        gasEstimateFallback: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
        isFixedGas: DEFAULT_IS_FIXED_GAS_MOCK,
      });
    });
  });
});
