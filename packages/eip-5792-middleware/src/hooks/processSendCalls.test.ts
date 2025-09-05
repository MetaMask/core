import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetStateAction,
  AccountsControllerState,
} from '@metamask/accounts-controller';
import { Messenger } from '@metamask/base-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type { TransactionController } from '@metamask/transaction-controller';
import type { JsonRpcRequest } from '@metamask/utils';

import { processSendCalls } from './processSendCalls';
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

  let messenger: EIP5792Messenger;

  const sendCallsHooks = {
    addTransactionBatch: addTransactionBatchMock,
    addTransaction: addTransactionMock,
    getDismissSmartAccountSuggestionEnabled:
      getDismissSmartAccountSuggestionEnabledMock,
    isAtomicBatchSupported: isAtomicBatchSupportedMock,
    validateSecurity: validateSecurityMock,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    messenger = new Messenger();

    messenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientByIdMock,
    );

    messenger.registerActionHandler(
      'AccountsController:getSelectedAccount',
      getSelectedAccountMock,
    );

    messenger.registerActionHandler(
      'AccountsController:getState',
      getAccountsStateMock,
    );

    getNetworkClientByIdMock.mockReturnValue({
      configuration: {
        chainId: CHAIN_ID_MOCK,
      },
    } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>);

    addTransactionBatchMock.mockResolvedValue({
      batchId: BATCH_ID_MOCK,
    });

    getDismissSmartAccountSuggestionEnabledMock.mockReturnValue(false);

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
  });
});
