import type {
  AccountsControllerGetStateAction,
  AccountsControllerState,
} from '@metamask/accounts-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  type MockAnyNamespace,
  type MessengerActions,
} from '@metamask/messenger';
import type {
  PreferencesControllerGetStateAction,
  PreferencesState,
} from '@metamask/preferences-controller';
import type { TransactionController } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getCapabilities } from './getCapabilities';
import type { EIP5792Messenger } from '../types';

const CHAIN_ID_MOCK = '0x123';
const FROM_MOCK = '0xabc123';
const FROM_MOCK_HARDWARE = '0xdef456';
const FROM_MOCK_SIMPLE = '0x789abc';
const DELEGATION_ADDRESS_MOCK = '0x1234567890abcdef1234567890abcdef12345678';

type AllActions = MessengerActions<EIP5792Messenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions>;

describe('EIP-5792', () => {
  const isAtomicBatchSupportedMock: jest.MockedFn<
    TransactionController['isAtomicBatchSupported']
  > = jest.fn();

  const getIsSmartTransactionMock: jest.MockedFn<(chainId: Hex) => boolean> =
    jest.fn();

  const isRelaySupportedMock: jest.Mock = jest.fn();

  const getSendBundleSupportedChainsMock: jest.Mock = jest.fn();

  const getDismissSmartAccountSuggestionEnabledMock: jest.MockedFn<
    () => boolean
  > = jest.fn();

  const getAccountsStateMock: jest.MockedFn<
    AccountsControllerGetStateAction['handler']
  > = jest.fn();

  const getPreferencesStateMock: jest.MockedFn<
    PreferencesControllerGetStateAction['handler']
  > = jest.fn();

  const isAuxiliaryFundsSupportedMock: jest.Mock = jest.fn();

  let rootMessenger: RootMessenger;

  let messenger: Messenger<'EIP5792', AllActions, never, RootMessenger>;

  const getCapabilitiesHooks = {
    getDismissSmartAccountSuggestionEnabled:
      getDismissSmartAccountSuggestionEnabledMock,
    isAtomicBatchSupported: isAtomicBatchSupportedMock,
    getIsSmartTransaction: getIsSmartTransactionMock,
    isRelaySupported: isRelaySupportedMock,
    getSendBundleSupportedChains: getSendBundleSupportedChainsMock,
    isAuxiliaryFundsSupported: isAuxiliaryFundsSupportedMock,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    rootMessenger = new Messenger<MockAnyNamespace, AllActions>({
      namespace: MOCK_ANY_NAMESPACE,
    });

    rootMessenger.registerActionHandler(
      'AccountsController:getState',
      getAccountsStateMock,
    );

    rootMessenger.registerActionHandler(
      'PreferencesController:getState',
      getPreferencesStateMock,
    );

    messenger = new Messenger({
      namespace: 'EIP5792',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger,
      actions: [
        'AccountsController:getState',
        'PreferencesController:getState',
        'NetworkController:getState',
      ],
    });

    isAtomicBatchSupportedMock.mockResolvedValue([
      {
        chainId: CHAIN_ID_MOCK,
        delegationAddress: undefined,
        isSupported: false,
        upgradeContractAddress: DELEGATION_ADDRESS_MOCK,
      },
    ]);

    getAccountsStateMock.mockReturnValue({
      internalAccounts: {
        accounts: {
          [FROM_MOCK]: {
            address: FROM_MOCK,
            metadata: {
              keyring: {
                type: KeyringTypes.hd,
              },
            },
          },
          [FROM_MOCK_HARDWARE]: {
            address: FROM_MOCK_HARDWARE,
            metadata: {
              keyring: {
                type: KeyringTypes.ledger,
              },
            },
          },
          [FROM_MOCK_SIMPLE]: {
            address: FROM_MOCK_SIMPLE,
            metadata: {
              keyring: {
                type: KeyringTypes.simple,
              },
            },
          },
        },
      },
    } as unknown as AccountsControllerState);
  });

  describe('getCapabilities', () => {
    beforeEach(() => {
      getPreferencesStateMock.mockReturnValue({
        useTransactionSimulations: true,
      } as unknown as PreferencesState);

      isRelaySupportedMock.mockResolvedValue(true);
      getSendBundleSupportedChainsMock.mockResolvedValue({
        [CHAIN_ID_MOCK]: true,
      });
    });

    it('includes atomic capability if already upgraded', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'supported',
          },
          alternateGasFees: {
            supported: true,
          },
        },
      });
    });

    it('includes atomic capability if not yet upgraded', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: DELEGATION_ADDRESS_MOCK,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'ready',
          },
        },
      });
    });

    it('includes atomic capability if not yet upgraded and simple keyring', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: DELEGATION_ADDRESS_MOCK,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK_SIMPLE,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'ready',
          },
        },
      });
    });

    it('does not include atomic capability if chain not supported', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({});
    });

    it('does not include atomic capability if all upgrades disabled', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: DELEGATION_ADDRESS_MOCK,
        },
      ]);

      getDismissSmartAccountSuggestionEnabledMock.mockReturnValue(true);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({});
    });

    it('does not include atomic capability if no upgrade contract address', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: undefined,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({});
    });

    it('does not include atomic capability if keyring type not supported', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: DELEGATION_ADDRESS_MOCK,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK_HARDWARE,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({});
    });

    it('does not include atomic capability if keyring type not found', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: DELEGATION_ADDRESS_MOCK,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        '0x456',
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({});
    });

    it('does not return alternateGasFees if transaction simulations are not enabled', async () => {
      getPreferencesStateMock.mockReturnValue({
        useTransactionSimulations: false,
      } as unknown as PreferencesState);
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'supported',
          },
        },
      });
    });

    it('does not return alternateGasFees if smart transaction are not supported and also not 7702', async () => {
      getIsSmartTransactionMock.mockReturnValue(false);
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: false,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({});
    });

    it('does not return alternateGasFees if smart transaction are not supported and also 7702 but not relay of transaction', async () => {
      getIsSmartTransactionMock.mockReturnValue(false);
      isRelaySupportedMock.mockResolvedValue(false);
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'supported',
          },
        },
      });
    });

    it('returns alternateGasFees true if send bundle is supported', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
      ]);
      getSendBundleSupportedChainsMock.mockResolvedValue({
        [CHAIN_ID_MOCK]: true,
      });

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'supported',
          },
          alternateGasFees: {
            supported: true,
          },
        },
      });
    });

    it('does not add alternateGasFees property if send bundle is not supported', async () => {
      isRelaySupportedMock.mockResolvedValue(false);
      getSendBundleSupportedChainsMock.mockResolvedValue({
        [CHAIN_ID_MOCK]: false,
      });

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'ready',
          },
        },
      });
    });

    it('fetches all network configurations when chainIds is undefined', async () => {
      const networkConfigurationsMock = {
        '0x1': { chainId: '0x1' },
        '0x89': { chainId: '0x89' },
      };

      rootMessenger.registerActionHandler(
        'NetworkController:getState',
        jest.fn().mockReturnValue({
          networkConfigurationsByChainId: networkConfigurationsMock,
        }),
      );

      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: '0x1',
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
        {
          chainId: '0x89',
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: DELEGATION_ADDRESS_MOCK,
        },
      ]);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        undefined,
      );

      expect(capabilities).toStrictEqual({
        '0x1': {
          atomic: {
            status: 'supported',
          },
          alternateGasFees: {
            supported: true,
          },
        },
        '0x89': {
          atomic: {
            status: 'ready',
          },
        },
      });
    });

    it('includes auxiliary funds capability when supported', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
      ]);

      isAuxiliaryFundsSupportedMock.mockReturnValue(true);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'supported',
          },
          alternateGasFees: {
            supported: true,
          },
          auxiliaryFunds: {
            supported: true,
          },
        },
      });
    });

    it('does not include auxiliary funds capability when not supported', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
      ]);

      isAuxiliaryFundsSupportedMock.mockReturnValue(false);

      const capabilities = await getCapabilities(
        getCapabilitiesHooks,
        messenger,
        FROM_MOCK,
        [CHAIN_ID_MOCK],
      );

      expect(capabilities).toStrictEqual({
        [CHAIN_ID_MOCK]: {
          atomic: {
            status: 'supported',
          },
          alternateGasFees: {
            supported: true,
          },
        },
      });
    });
  });
});
