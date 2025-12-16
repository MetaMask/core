import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetStateAction,
  AccountsControllerState,
} from '@metamask/accounts-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MessengerActions, MockAnyNamespace } from '@metamask/messenger';
import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type { TransactionController } from '@metamask/transaction-controller';
import type { Hex, JsonRpcRequest } from '@metamask/utils';

import { processSendCalls } from './processSendCalls';
import { SupportedCapabilities } from '../constants';
import type {
  SendCallsPayload,
  SendCallsParams,
  EIP5792Messenger,
} from '../types';

const CHAIN_ID_MOCK = '0x123';
const CHAIN_ID_2_MOCK = '0xabc';
const BATCH_ID_MOCK = '0xf3472db2a4134607a17213b7e9ca26e3';
const NETWORK_CLIENT_ID_MOCK = 'test-client';
const FROM_MOCK = '0xabc123';
const FROM_MOCK_HARDWARE = '0xdef456';
const FROM_MOCK_SIMPLE = '0x789abc';
const ORIGIN_MOCK = 'test.com';
const DELEGATION_ADDRESS_MOCK = '0x1234567890abcdef1234567890abcdef12345678';

const SEND_CALLS_MOCK: SendCallsPayload = {
  version: '2.0.0',
  calls: [{ to: '0x123' }, { to: '0x456' }],
  chainId: CHAIN_ID_MOCK,
  from: FROM_MOCK,
  atomicRequired: true,
};

const REQUEST_MOCK = {
  id: 1,
  jsonrpc: '2.0',
  method: 'wallet_sendCalls',
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  origin: ORIGIN_MOCK,
  params: [SEND_CALLS_MOCK],
} as JsonRpcRequest<SendCallsParams> & { networkClientId: string };

type AllActions = MessengerActions<EIP5792Messenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions>;

describe('EIP-5792', () => {
  const addTransactionBatchMock: jest.MockedFn<
    TransactionController['addTransactionBatch']
  > = jest.fn();

  const addTransactionMock: jest.MockedFn<
    TransactionController['addTransaction']
  > = jest.fn();

  const getNetworkClientByIdMock: jest.MockedFn<
    NetworkControllerGetNetworkClientByIdAction['handler']
  > = jest.fn();

  const getSelectedAccountMock: jest.MockedFn<
    AccountsControllerGetSelectedAccountAction['handler']
  > = jest.fn();

  const isAtomicBatchSupportedMock: jest.MockedFn<
    TransactionController['isAtomicBatchSupported']
  > = jest.fn();

  const validateSecurityMock: jest.MockedFunction<
    Parameters<typeof processSendCalls>[0]['validateSecurity']
  > = jest.fn();

  const getDismissSmartAccountSuggestionEnabledMock: jest.MockedFn<
    () => boolean
  > = jest.fn();

  const getAccountsStateMock: jest.MockedFn<
    AccountsControllerGetStateAction['handler']
  > = jest.fn();

  const isAuxiliaryFundsSupportedMock: jest.Mock = jest.fn();

  let rootMessenger: RootMessenger;

  let messenger: Messenger<'EIP5792', AllActions, never, RootMessenger>;

  const sendCallsHooks = {
    addTransactionBatch: addTransactionBatchMock,
    addTransaction: addTransactionMock,
    getDismissSmartAccountSuggestionEnabled:
      getDismissSmartAccountSuggestionEnabledMock,
    isAtomicBatchSupported: isAtomicBatchSupportedMock,
    validateSecurity: validateSecurityMock,
    isAuxiliaryFundsSupported: isAuxiliaryFundsSupportedMock,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    rootMessenger = new Messenger<MockAnyNamespace, AllActions>({
      namespace: MOCK_ANY_NAMESPACE,
    });

    rootMessenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientByIdMock,
    );

    rootMessenger.registerActionHandler(
      'AccountsController:getSelectedAccount',
      getSelectedAccountMock,
    );

    rootMessenger.registerActionHandler(
      'AccountsController:getState',
      getAccountsStateMock,
    );

    messenger = new Messenger({
      namespace: 'EIP5792',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger,
      actions: [
        'AccountsController:getState',
        'AccountsController:getSelectedAccount',
        'PreferencesController:getState',
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
        'TransactionController:getState',
      ],
    });

    getNetworkClientByIdMock.mockReturnValue({
      configuration: {
        chainId: CHAIN_ID_MOCK,
      },
    } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>);

    addTransactionBatchMock.mockResolvedValue({
      batchId: BATCH_ID_MOCK,
    });

    getDismissSmartAccountSuggestionEnabledMock.mockReturnValue(false);

    isAuxiliaryFundsSupportedMock.mockReturnValue(true);

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

  describe('processSendCalls', () => {
    it('calls adds transaction batch hook', async () => {
      await processSendCalls(
        sendCallsHooks,
        messenger,
        SEND_CALLS_MOCK,
        REQUEST_MOCK,
      );

      expect(addTransactionBatchMock).toHaveBeenCalledWith({
        from: SEND_CALLS_MOCK.from,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        origin: ORIGIN_MOCK,
        requestId: '1',
        securityAlertId: expect.any(String),
        transactions: [
          { params: SEND_CALLS_MOCK.calls[0] },
          { params: SEND_CALLS_MOCK.calls[1] },
        ],
        validateSecurity: expect.any(Function),
      });
    });

    it('calls adds transaction hook if there is only 1 nested transaction', async () => {
      await processSendCalls(
        sendCallsHooks,
        messenger,
        { ...SEND_CALLS_MOCK, calls: [{ to: '0x123' }] },
        REQUEST_MOCK,
      );

      expect(addTransactionMock).toHaveBeenCalledWith(
        {
          from: SEND_CALLS_MOCK.from,
          to: '0x123',
          type: '0x2',
        },
        {
          batchId: expect.any(String),
          networkClientId: 'test-client',
          origin: 'test.com',
          requestId: '1',
          securityAlertResponse: {
            securityAlertId: expect.any(String),
          },
        },
      );
      expect(validateSecurityMock).toHaveBeenCalled();
    });

    it('calls adds transaction batch hook if simple keyring', async () => {
      await processSendCalls(
        sendCallsHooks,
        messenger,
        { ...SEND_CALLS_MOCK, from: FROM_MOCK_SIMPLE },
        REQUEST_MOCK,
      );

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
    });

    it('calls adds transaction batch hook with selected account if no from', async () => {
      getSelectedAccountMock.mockReturnValue({
        address: SEND_CALLS_MOCK.from,
      } as InternalAccount);

      await processSendCalls(
        sendCallsHooks,
        messenger,
        { ...SEND_CALLS_MOCK, from: undefined },
        REQUEST_MOCK,
      );

      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: SEND_CALLS_MOCK.from,
        }),
      );
    });

    it('returns batch ID from hook', async () => {
      expect(
        await processSendCalls(
          sendCallsHooks,
          messenger,
          SEND_CALLS_MOCK,
          REQUEST_MOCK,
        ),
      ).toStrictEqual({ id: BATCH_ID_MOCK });
    });

    it('throws if version not supported for single nested transaction', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          { ...SEND_CALLS_MOCK, calls: [{ to: '0x123' }], version: '1.0' },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(`Version not supported: Got 1.0, expected 2.0.0`);
    });

    it('throws if version not supported', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          { ...SEND_CALLS_MOCK, version: '1.0' },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(`Version not supported: Got 1.0, expected 2.0.0`);
    });

    it('throws if chain ID does not match network client', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          { ...SEND_CALLS_MOCK, chainId: CHAIN_ID_2_MOCK },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(
        `Chain ID must match the dApp selected network: Got ${CHAIN_ID_2_MOCK}, expected ${CHAIN_ID_MOCK}`,
      );
    });

    it('throws if user enabled preference to dismiss option to upgrade account', async () => {
      getDismissSmartAccountSuggestionEnabledMock.mockReturnValue(true);

      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          SEND_CALLS_MOCK,
          REQUEST_MOCK,
        ),
      ).rejects.toThrow('EIP-7702 upgrade disabled by the user');
    });

    it('does not throw if user enabled preference to dismiss option to upgrade account for single nested transaction', async () => {
      getDismissSmartAccountSuggestionEnabledMock.mockReturnValue(true);

      const result = await processSendCalls(
        sendCallsHooks,
        messenger,
        { ...SEND_CALLS_MOCK, calls: [{ to: '0x123' }] },
        REQUEST_MOCK,
      );
      expect(result.id).toBeDefined();
    });

    it('does not throw if user enabled preference to dismiss option to upgrade account if already upgraded', async () => {
      getDismissSmartAccountSuggestionEnabledMock.mockReturnValue(true);

      isAtomicBatchSupportedMock.mockResolvedValueOnce([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: DELEGATION_ADDRESS_MOCK,
          isSupported: true,
        },
      ]);

      expect(
        await processSendCalls(
          sendCallsHooks,
          messenger,
          SEND_CALLS_MOCK,
          REQUEST_MOCK,
        ),
      ).toBeDefined();
    });

    it('throws if top-level capability is required', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          {
            ...SEND_CALLS_MOCK,
            capabilities: {
              test: {},
              test2: { optional: true },
              test3: { optional: false },
            },
          },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow('Unsupported non-optional capabilities: test, test3');
    });

    it('throws if top-level capability is required for single nested transaction', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          {
            ...SEND_CALLS_MOCK,
            calls: [{ to: '0x123' }],
            capabilities: {
              test: {},
              test2: { optional: true },
              test3: { optional: false },
            },
          },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow('Unsupported non-optional capabilities: test, test3');
    });

    it('throws if call capability is required', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          {
            ...SEND_CALLS_MOCK,
            calls: [
              ...SEND_CALLS_MOCK.calls,
              {
                ...SEND_CALLS_MOCK.calls[0],
                capabilities: {
                  test: {},
                  test2: { optional: true },
                  test3: { optional: false },
                },
              },
            ],
          },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow('Unsupported non-optional capabilities: test, test3');
    });

    it('throws if chain does not support EIP-7702', async () => {
      isAtomicBatchSupportedMock.mockResolvedValueOnce([]);

      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          SEND_CALLS_MOCK,
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(`EIP-7702 not supported on chain: ${CHAIN_ID_MOCK}`);
    });

    it('throws if keyring type not supported', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          { ...SEND_CALLS_MOCK, from: FROM_MOCK_HARDWARE },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(`EIP-7702 upgrade not supported on account`);
    });

    it('throws if keyring type not found', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          { ...SEND_CALLS_MOCK, from: '0x456' },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(
        `EIP-7702 upgrade not supported as account type is unknown`,
      );
    });

    it('validates auxiliary funds with unsupported account type', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          {
            ...SEND_CALLS_MOCK,
            from: FROM_MOCK_HARDWARE,
            capabilities: {
              auxiliaryFunds: {
                optional: false,
                requiredAssets: [
                  {
                    address: '0x123',
                    amount: '0x2',
                    standard: 'erc20',
                  },
                  {
                    address: '0x123',
                    amount: '0x2',
                    standard: 'erc20',
                  },
                ],
              },
            },
          },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(
        `Unsupported non-optional capability: ${SupportedCapabilities.AuxiliaryFunds}`,
      );
    });

    it('validates auxiliary funds with unsupported chain', async () => {
      isAuxiliaryFundsSupportedMock.mockReturnValue(false);

      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          {
            ...SEND_CALLS_MOCK,
            capabilities: {
              auxiliaryFunds: {
                optional: false,
                requiredAssets: [
                  {
                    address: '0x123' as Hex,
                    amount: '0x1' as Hex,
                    standard: 'erc20',
                  },
                ],
              },
            },
          },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(
        `The wallet no longer supports auxiliary funds on the requested chain: ${CHAIN_ID_MOCK}`,
      );
    });

    it('validates auxiliary funds with unsupported token standard', async () => {
      await expect(
        processSendCalls(
          sendCallsHooks,
          messenger,
          {
            ...SEND_CALLS_MOCK,
            capabilities: {
              auxiliaryFunds: {
                optional: false,
                requiredAssets: [
                  {
                    address: '0x123',
                    amount: '0x1',
                    standard: 'erc777',
                  },
                ],
              },
            },
          },
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(
        /The requested asset 0x123 is not available through the wallet.*s auxiliary fund system: unsupported token standard erc777/u,
      );
    });

    it('validates auxiliary funds with valid ERC-20 asset', async () => {
      const result = await processSendCalls(
        sendCallsHooks,
        messenger,
        {
          ...SEND_CALLS_MOCK,
          capabilities: {
            auxiliaryFunds: {
              optional: true,
              requiredAssets: [
                {
                  address: '0x123',
                  amount: '0x1',
                  standard: 'erc20',
                },
              ],
            },
          },
        },
        REQUEST_MOCK,
      );

      expect(result).toBeDefined();
    });

    it('validates auxiliary funds with no requiredAssets', async () => {
      const result = await processSendCalls(
        sendCallsHooks,
        messenger,
        {
          ...SEND_CALLS_MOCK,
          capabilities: {
            auxiliaryFunds: {
              optional: true,
            },
          },
        },
        REQUEST_MOCK,
      );

      expect(result).toBeDefined();
    });

    it('validates auxiliary funds with optional false and no requiredAssets', async () => {
      const result = await processSendCalls(
        sendCallsHooks,
        messenger,
        {
          ...SEND_CALLS_MOCK,
          capabilities: {
            auxiliaryFunds: {
              optional: false,
            },
          },
        },
        REQUEST_MOCK,
      );

      expect(result).toBeDefined();
    });

    it('deduplicates auxiliary funds requiredAssets by address and standard, summing amounts', async () => {
      const payload: SendCallsPayload = {
        ...SEND_CALLS_MOCK,
        capabilities: {
          auxiliaryFunds: {
            optional: true,
            requiredAssets: [
              {
                address: '0x123' as Hex,
                amount: '0x2' as Hex,
                standard: 'erc20',
              },
              {
                address: '0x123' as Hex,
                amount: '0x3' as Hex,
                standard: 'erc20',
              },
            ],
          },
        },
      };

      const result = await processSendCalls(
        sendCallsHooks,
        messenger,
        payload,
        REQUEST_MOCK,
      );

      expect(result).toBeDefined();
      const requiredAssets =
        payload.capabilities?.auxiliaryFunds?.requiredAssets;
      expect(requiredAssets).toHaveLength(1);
      expect(requiredAssets?.[0]).toMatchObject({
        amount: '0x5',
        address: '0x123',
        standard: 'erc20',
      });
    });
  });
});
