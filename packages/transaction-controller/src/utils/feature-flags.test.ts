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
});
