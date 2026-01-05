import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionControllerFeatureFlags } from './feature-flags';
import {
  getAcceleratedPollingParams,
  getBatchSizeLimit,
  getEIP7702ContractAddresses,
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
  getGasFeeRandomisation,
  getGasEstimateFallback,
  getGasEstimateBuffer,
  FeatureFlag,
  getIncomingTransactionsPollingInterval,
  getTimeoutAttempts,
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
const GAS_BUFFER_MOCK = 1.1;
const GAS_BUFFER_2_MOCK = 1.2;
const GAS_BUFFER_3_MOCK = 1.3;
const GAS_BUFFER_4_MOCK = 1.4;
const GAS_BUFFER_5_MOCK = 1.5;

describe('Feature Flags Utils', () => {
  let rootMessenger: Messenger<
    MockAnyNamespace,
    MessengerActions<TransactionControllerMessenger>,
    MessengerEvents<TransactionControllerMessenger>
  >;

  let controllerMessenger: TransactionControllerMessenger;

  let remoteFeatureFlagControllerMessenger: Messenger<
    'RemoteFeatureFlagController',
    RemoteFeatureFlagControllerGetStateAction,
    never,
    typeof rootMessenger
  >;

  let getFeatureFlagsMock: jest.MockedFn<
    RemoteFeatureFlagControllerGetStateAction['handler']
  >;

  const isValidSignatureMock = jest.mocked(isValidSignature);

  /**
   * Mocks the feature flags returned by the remote feature flag controller.
   *
   * @param featureFlags - The feature flags to mock.
   */
  function mockFeatureFlags(
    featureFlags: TransactionControllerFeatureFlags,
  ): void {
    getFeatureFlagsMock.mockReturnValue({
      cacheTimestamp: 0,
      remoteFeatureFlags: featureFlags,
      rawRemoteFeatureFlags: {},
      localOverrides: {},
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    getFeatureFlagsMock = jest.fn();

    rootMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });

    remoteFeatureFlagControllerMessenger = new Messenger({
      namespace: 'RemoteFeatureFlagController',
      parent: rootMessenger,
    });

    remoteFeatureFlagControllerMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      getFeatureFlagsMock,
    );

    controllerMessenger = new Messenger({
      namespace: 'TransactionController',
      parent: rootMessenger,
    });
    rootMessenger.delegate({
      messenger: controllerMessenger,
      actions: ['RemoteFeatureFlagController:getState'],
    });

    isValidSignatureMock.mockReturnValue(true);
  });

  describe('getEIP7702SupportedChains', () => {
    it('returns value from remote feature flag controller', () => {
      mockFeatureFlags({
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.EIP7702]: {
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
        [FeatureFlag.Transactions]: {
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
        CHAIN_ID_MOCK,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        blockTime: 12000,
        countMax: 10,
        intervalMs: 3000,
      });
    });

    it('returns values from chain-specific config when available', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          acceleratedPolling: {
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                blockTime: 15000,
                countMax: 5,
                intervalMs: 2000,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        blockTime: 15000,
        countMax: 5,
        intervalMs: 2000,
      });
    });

    it('returns default values from feature flag when no chain-specific config', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        blockTime: 12000,
        countMax: 15,
        intervalMs: 4000,
      });
    });

    it('uses chain-specific over default values', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                blockTime: 10000,
                countMax: 5,
                intervalMs: 2000,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        blockTime: 10000,
        countMax: 5,
        intervalMs: 2000,
      });
    });

    it('uses defaults if chain not found in perChainConfig', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
            perChainConfig: {
              [CHAIN_ID_2_MOCK]: {
                blockTime: 8000,
                countMax: 5,
                intervalMs: 2000,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        blockTime: 12000,
        countMax: 15,
        intervalMs: 4000,
      });
    });

    it('merges partial chain-specific config with defaults', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          acceleratedPolling: {
            defaultCountMax: 15,
            defaultIntervalMs: 4000,
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                // Only specify countMax, intervalMs and blockTime should use default
                countMax: 5,
              },
            },
          },
        },
      });

      const params = getAcceleratedPollingParams(
        CHAIN_ID_MOCK,
        controllerMessenger,
      );

      expect(params).toStrictEqual({
        blockTime: 12000,
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
        [FeatureFlag.Transactions]: {
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
        [FeatureFlag.Transactions]: {
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
        [FeatureFlag.Transactions]: {
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
        [FeatureFlag.Transactions]: {
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
    it('returns local default if nothing defined', () => {
      mockFeatureFlags({
        [FeatureFlag.GasBuffer]: {},
      });

      expect(
        getGasEstimateBuffer({
          chainId: CHAIN_ID_MOCK,
          isCustomRPC: false,
          isUpgradeWithDataToSelf: false,
          messenger: controllerMessenger,
        }),
      ).toBe(1.0);
    });

    it('returns default if no chain ID override', () => {
      mockFeatureFlags({
        [FeatureFlag.GasBuffer]: {
          default: GAS_BUFFER_MOCK,
        },
      });

      expect(
        getGasEstimateBuffer({
          chainId: CHAIN_ID_MOCK,
          isCustomRPC: false,
          isUpgradeWithDataToSelf: false,
          messenger: controllerMessenger,
        }),
      ).toBe(GAS_BUFFER_MOCK);
    });

    it('returns default included if not custom network', () => {
      mockFeatureFlags({
        [FeatureFlag.GasBuffer]: {
          default: GAS_BUFFER_MOCK,
          included: GAS_BUFFER_2_MOCK,
        },
      });

      expect(
        getGasEstimateBuffer({
          chainId: CHAIN_ID_MOCK,
          isCustomRPC: false,
          isUpgradeWithDataToSelf: false,
          messenger: controllerMessenger,
        }),
      ).toBe(GAS_BUFFER_2_MOCK);
    });

    it('returns chain base if defined', () => {
      mockFeatureFlags({
        [FeatureFlag.GasBuffer]: {
          default: GAS_BUFFER_MOCK,
          included: GAS_BUFFER_2_MOCK,
          perChainConfig: {
            [CHAIN_ID_MOCK]: {
              base: GAS_BUFFER_3_MOCK,
            },
          },
        },
      });

      expect(
        getGasEstimateBuffer({
          chainId: CHAIN_ID_MOCK,
          isCustomRPC: false,
          isUpgradeWithDataToSelf: false,
          messenger: controllerMessenger,
        }),
      ).toBe(GAS_BUFFER_3_MOCK);
    });

    it('returns chain included if defined and not custom RPC', () => {
      mockFeatureFlags({
        [FeatureFlag.GasBuffer]: {
          default: GAS_BUFFER_MOCK,
          included: GAS_BUFFER_2_MOCK,
          perChainConfig: {
            [CHAIN_ID_MOCK]: {
              base: GAS_BUFFER_3_MOCK,
              included: GAS_BUFFER_4_MOCK,
            },
          },
        },
      });

      expect(
        getGasEstimateBuffer({
          chainId: CHAIN_ID_MOCK,
          isCustomRPC: false,
          isUpgradeWithDataToSelf: false,
          messenger: controllerMessenger,
        }),
      ).toBe(GAS_BUFFER_4_MOCK);
    });

    it('returns eip7702 buffer if defined and is upgrade to self', () => {
      mockFeatureFlags({
        [FeatureFlag.GasBuffer]: {
          default: GAS_BUFFER_MOCK,
          included: GAS_BUFFER_2_MOCK,
          perChainConfig: {
            [CHAIN_ID_MOCK]: {
              base: GAS_BUFFER_3_MOCK,
              included: GAS_BUFFER_4_MOCK,
              eip7702: GAS_BUFFER_5_MOCK,
            },
          },
        },
      });

      expect(
        getGasEstimateBuffer({
          chainId: CHAIN_ID_MOCK,
          isCustomRPC: false,
          isUpgradeWithDataToSelf: true,
          messenger: controllerMessenger,
        }),
      ).toBe(GAS_BUFFER_5_MOCK);
    });
  });

  describe('getIncomingTransactionsPollingInterval', () => {
    it('returns default value if no feature flags set', () => {
      mockFeatureFlags({});

      expect(getIncomingTransactionsPollingInterval(controllerMessenger)).toBe(
        1000 * 60 * 4,
      );
    });

    it('returns value from remote feature flag controller', () => {
      mockFeatureFlags({
        [FeatureFlag.IncomingTransactions]: {
          pollingIntervalMs: 5000,
        },
      });

      expect(getIncomingTransactionsPollingInterval(controllerMessenger)).toBe(
        5000,
      );
    });
  });

  describe('getTimeoutAttempts', () => {
    it('returns undefined if no feature flags set', () => {
      mockFeatureFlags({});

      expect(
        getTimeoutAttempts(CHAIN_ID_MOCK, controllerMessenger),
      ).toBeUndefined();
    });

    it('returns undefined if timeoutAttempts not set', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {},
      });

      expect(
        getTimeoutAttempts(CHAIN_ID_MOCK, controllerMessenger),
      ).toBeUndefined();
    });

    it('returns default value if no chain-specific config', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          timeoutAttempts: {
            default: 3,
          },
        },
      });

      expect(getTimeoutAttempts(CHAIN_ID_MOCK, controllerMessenger)).toBe(3);
    });

    it('returns chain-specific value when available', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          timeoutAttempts: {
            default: 3,
            perChainConfig: {
              [CHAIN_ID_MOCK]: 5,
            },
          },
        },
      });

      expect(getTimeoutAttempts(CHAIN_ID_MOCK, controllerMessenger)).toBe(5);
    });

    it('returns chain-specific zero value when explicitly set', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          timeoutAttempts: {
            default: 3,
            perChainConfig: {
              [CHAIN_ID_MOCK]: 0,
            },
          },
        },
      });

      expect(getTimeoutAttempts(CHAIN_ID_MOCK, controllerMessenger)).toBe(0);
    });

    it('returns default zero value when explicitly set', () => {
      mockFeatureFlags({
        [FeatureFlag.Transactions]: {
          timeoutAttempts: {
            default: 0,
          },
        },
      });

      expect(getTimeoutAttempts(CHAIN_ID_MOCK, controllerMessenger)).toBe(0);
    });
  });
});
