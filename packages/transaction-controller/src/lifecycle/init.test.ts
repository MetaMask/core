import type { Hex } from '@metamask/utils';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTION_ID_MOCK,
  CHAIN_ID_MOCK,
  FROM_MOCK,
  NETWORK_CLIENT_ID_MOCK,
  TO_MOCK,
  buildLifecycleMocks,
  buildTransactionMeta,
} from '../../tests/LifecycleMocks.js';
import {
  TransactionEnvelopeType,
  TransactionStatus,
  TransactionType,
} from '../types.js';
import { getDelegationAddress } from '../utils/eip7702.js';
import { getChainId } from '../utils/provider.js';
import { determineTransactionType } from '../utils/transaction-type.js';
import { normalizeTransactionParams, setEnvelopeType } from '../utils/utils.js';
import {
  validateTransactionOrigin,
  validateTxParams,
} from '../utils/validation.js';
import { getEIP1559Compatibility, initTransaction } from './init.js';
import type { AddTransactionRequest } from './types.js';

vi.mock('../utils/eip7702.js');
vi.mock('../utils/provider.js');
vi.mock('../utils/transaction-type.js');
vi.mock('../utils/utils.js');
vi.mock('../utils/validation.js');

// ─── Constants ──────────────────────────────────────────────────────────────

const BATCH_ID_MOCK = '0xbatchid' as Hex;
const EXTERNAL_ORIGIN_MOCK = 'https://example.com';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a full set of lifecycle mocks with the messenger pre-configured to
 * handle all calls that initTransaction makes internally.
 *
 * @returns The lifecycle mocks with a configured messenger.
 */
function buildMocksWithDefaultMessenger(): ReturnType<
  typeof buildLifecycleMocks
> {
  const mocks = buildLifecycleMocks();
  setupDefaultMessengerMock(mocks.messengerCall);
  return mocks;
}

/**
 * Configure a messengerCall mock to handle all calls that initTransaction
 * makes: AccountsController:getState, NetworkController:getNetworkClientById,
 * and NetworkController:getEIP1559Compatibility.
 *
 * @param messengerCall - The mock to configure.
 * @param overrides - Responses to use instead of the defaults, keyed by action.
 */
function setupDefaultMessengerMock(
  messengerCall: Mock,
  overrides: Record<string, unknown> = {},
): void {
  const responses: Record<string, unknown> = {
    'AccountsController:getState': { internalAccounts: { accounts: {} } },
    'NetworkController:getEIP1559Compatibility': true,
    'NetworkController:getNetworkClientById': {
      configuration: { chainId: CHAIN_ID_MOCK },
    },
    ...overrides,
  };

  messengerCall.mockImplementation(
    (action: string) => responses[action] ?? null,
  );
}

/**
 * Build a minimal AddTransactionRequest using lifecycle mocks that have the
 * messenger pre-configured for all internal calls initTransaction makes.
 *
 * @param options - Optional partial overrides applied on top of the defaults.
 * @param options.addTransactionRequest - Override the inner add-transaction input.
 * @param options.constructorOptions - Override constructor-level options.
 * @returns A fully configured AddTransactionRequest and the underlying mocks.
 */
function buildRequest(
  options: Partial<
    Pick<AddTransactionRequest, 'addTransactionRequest' | 'constructorOptions'>
  > = {},
): {
  mocks: ReturnType<typeof buildLifecycleMocks>;
  request: AddTransactionRequest;
} {
  const mocks = buildMocksWithDefaultMessenger();

  const request: AddTransactionRequest = {
    addTransactionRequest:
      options.addTransactionRequest ?? mocks.request.addTransactionRequest,
    constructorOptions:
      options.constructorOptions ?? mocks.request.constructorOptions,
    dependencies: mocks.request.dependencies,
  };

  return { mocks, request };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('initTransaction', () => {
  beforeEach(() => {
    vi.mocked(getChainId).mockReturnValue(CHAIN_ID_MOCK);
    vi.mocked(normalizeTransactionParams).mockImplementation(
      (txParams) => txParams,
    );
    vi.mocked(validateTransactionOrigin).mockResolvedValue(undefined);
    vi.mocked(validateTxParams).mockReturnValue(undefined);
    vi.mocked(getDelegationAddress).mockResolvedValue(undefined);
    vi.mocked(determineTransactionType).mockResolvedValue({
      getCodeResponse: undefined,
      type: TransactionType.simpleSend,
    });
  });

  describe('network client validation', () => {
    it('throws if the network client does not exist', async () => {
      const { request, mocks } = buildRequest();
      vi.mocked(mocks.request.dependencies.hasNetworkClient).mockReturnValue(
        false,
      );

      await expect(initTransaction(request)).rejects.toThrow(
        `Network client not found - ${NETWORK_CLIENT_ID_MOCK}`,
      );
    });

    it('does not throw when the network client exists', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result).toBeDefined();
    });

    it('checks hasNetworkClient with the correct networkClientId', async () => {
      const { request, mocks } = buildRequest();
      const hasNetworkClient = vi.mocked(
        mocks.request.dependencies.hasNetworkClient,
      );

      await initTransaction(request);

      expect(hasNetworkClient).toHaveBeenCalledWith(NETWORK_CLIENT_ID_MOCK);
    });
  });

  describe('chain ID resolution', () => {
    it('calls getChainId with the messenger and networkClientId', async () => {
      const { request } = buildRequest();

      await initTransaction(request);

      expect(vi.mocked(getChainId)).toHaveBeenCalledWith({
        messenger: request.dependencies.messenger,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });
    });

    it('sets chainId on the resulting transactionMeta', async () => {
      const customChainId = '0xa' as Hex;
      vi.mocked(getChainId).mockReturnValue(customChainId);
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.chainId).toBe(customChainId);
    });
  });

  describe('origin validation', () => {
    it('calls validateTransactionOrigin with origin and tx params', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      await initTransaction(request);

      expect(vi.mocked(validateTransactionOrigin)).toHaveBeenCalledWith(
        expect.objectContaining({
          from: FROM_MOCK.toLowerCase(),
          origin: EXTERNAL_ORIGIN_MOCK,
        }),
      );
    });

    it('blocks external calldata to an internal EVM account', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: { data: '0x1234', from: FROM_MOCK, to: TO_MOCK },
        },
      });

      vi.mocked(validateTransactionOrigin).mockRejectedValue(
        new Error(
          'External transactions to internal accounts cannot include data',
        ),
      );

      await expect(initTransaction(request)).rejects.toThrow(
        'External transactions to internal accounts cannot include data',
      );
    });

    it('passes internalAccounts (EOAs only) from AccountsController state', async () => {
      const internalAddress = '0xeoa' as Hex;
      const { request, mocks } = buildRequest();

      setupDefaultMessengerMock(mocks.messengerCall, {
        'AccountsController:getState': {
          internalAccounts: {
            accounts: {
              evm: { address: internalAddress, type: 'eip155:eoa' },
              solana: {
                address: 'solana-account',
                type: 'solana:data-account',
              },
            },
          },
        },
      });

      await initTransaction(request);

      expect(vi.mocked(validateTransactionOrigin)).toHaveBeenCalledWith(
        expect.objectContaining({
          internalAccounts: [internalAddress],
        }),
      );
    });

    it('excludes non-EOA accounts from internalAccounts', async () => {
      const { request, mocks } = buildRequest();

      setupDefaultMessengerMock(mocks.messengerCall, {
        'AccountsController:getState': {
          internalAccounts: {
            accounts: {
              evm: { address: '0xeoa', type: 'eip155:eoa' },
              solana: {
                address: 'solana-account',
                type: 'solana:data-account',
              },
            },
          },
        },
      });

      await initTransaction(request);

      expect(vi.mocked(validateTransactionOrigin)).toHaveBeenCalledWith(
        expect.objectContaining({
          internalAccounts: ['0xeoa'],
        }),
      );
    });

    it('passes permittedAddresses when origin is set and getPermittedAccounts is configured', async () => {
      const permittedAccounts = [FROM_MOCK];
      const getPermittedAccounts = vi.fn().mockResolvedValue(permittedAccounts);

      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
        constructorOptions: {
          disableSwaps: false,
          getPermittedAccounts,
          hooks: {
            afterAdd: vi.fn().mockResolvedValue({}),
            beforePublish: vi.fn().mockResolvedValue(true),
            beforeSign: vi.fn().mockResolvedValue(true),
            publish: vi.fn().mockResolvedValue({ transactionHash: '0xhash' }),
          },
          trace: vi.fn(),
        },
      });

      await initTransaction(request);

      expect(vi.mocked(validateTransactionOrigin)).toHaveBeenCalledWith(
        expect.objectContaining({
          permittedAddresses: permittedAccounts,
        }),
      );
    });

    it('passes undefined permittedAddresses when origin is undefined', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: { networkClientId: NETWORK_CLIENT_ID_MOCK },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      await initTransaction(request);

      expect(vi.mocked(validateTransactionOrigin)).toHaveBeenCalledWith(
        expect.objectContaining({
          permittedAddresses: undefined,
        }),
      );
    });

    it('passes isInternal to validateTransactionOrigin when true', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            isInternal: true,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      await initTransaction(request);

      expect(vi.mocked(validateTransactionOrigin)).toHaveBeenCalledWith(
        expect.objectContaining({ isInternal: true }),
      );
    });
  });

  describe('EIP-1559 compatibility and envelope type', () => {
    it('calls validateTxParams with isEIP1559Compatible=true when network supports it', async () => {
      const { request, mocks } = buildRequest();

      setupDefaultMessengerMock(mocks.messengerCall, {
        'NetworkController:getEIP1559Compatibility': true,
      });

      await initTransaction(request);

      expect(vi.mocked(validateTxParams)).toHaveBeenCalledWith(
        expect.any(Object),
        true,
        CHAIN_ID_MOCK,
      );
    });

    it('calls validateTxParams with isEIP1559Compatible=false when network does not support it', async () => {
      const { request, mocks } = buildRequest();

      setupDefaultMessengerMock(mocks.messengerCall, {
        'NetworkController:getEIP1559Compatibility': false,
      });

      await initTransaction(request);

      expect(vi.mocked(validateTxParams)).toHaveBeenCalledWith(
        expect.any(Object),
        false,
        CHAIN_ID_MOCK,
      );
    });

    it('calls setEnvelopeType when txParams has no type', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: { networkClientId: NETWORK_CLIENT_ID_MOCK },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      await initTransaction(request);

      expect(vi.mocked(setEnvelopeType)).toHaveBeenCalled();
    });

    it('does not call setEnvelopeType when txParams already has a type', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: { networkClientId: NETWORK_CLIENT_ID_MOCK },
          txParams: {
            from: FROM_MOCK,
            to: TO_MOCK,
            type: TransactionEnvelopeType.legacy,
          },
        },
      });

      await initTransaction(request);

      expect(vi.mocked(setEnvelopeType)).not.toHaveBeenCalled();
    });
  });

  describe('tx params validation', () => {
    it('throws when validateTxParams throws', async () => {
      const { request } = buildRequest();
      vi.mocked(validateTxParams).mockImplementation(() => {
        throw new Error('Invalid gas params');
      });

      await expect(initTransaction(request)).rejects.toThrow(
        'Invalid gas params',
      );
    });

    it('passes the chainId to validateTxParams', async () => {
      const customChainId = '0x89' as Hex;
      vi.mocked(getChainId).mockReturnValue(customChainId);
      const { request } = buildRequest();

      await initTransaction(request);

      expect(vi.mocked(validateTxParams)).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Boolean),
        customChainId,
      );
    });
  });

  describe('duplicate batch ID rejection', () => {
    it('throws a JsonRpcError when an external transaction has a duplicate batchId', async () => {
      const existingMeta = buildTransactionMeta({ batchId: BATCH_ID_MOCK });
      const baseMocks = buildLifecycleMocks({ transactionMeta: existingMeta });
      setupDefaultMessengerMock(baseMocks.messengerCall);

      const request: AddTransactionRequest = {
        addTransactionRequest: {
          options: {
            batchId: BATCH_ID_MOCK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
        constructorOptions: baseMocks.request.constructorOptions,
        dependencies: baseMocks.request.dependencies,
      };

      await expect(initTransaction(request)).rejects.toThrow(
        'Batch ID already exists',
      );
    });

    it('does not throw for duplicate batchId when isInternal=true', async () => {
      const existingMeta = buildTransactionMeta({ batchId: BATCH_ID_MOCK });
      const baseMocks = buildLifecycleMocks({ transactionMeta: existingMeta });
      setupDefaultMessengerMock(baseMocks.messengerCall);

      const request: AddTransactionRequest = {
        addTransactionRequest: {
          options: {
            batchId: BATCH_ID_MOCK,
            isInternal: true,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
        constructorOptions: baseMocks.request.constructorOptions,
        dependencies: baseMocks.request.dependencies,
      };

      const result = await initTransaction(request);

      expect(result).toBeDefined();
    });

    it('does not throw when batchId is unique', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            batchId: '0xuniqueid',
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result).toBeDefined();
    });

    it('performs a case-insensitive batchId comparison', async () => {
      const existingMeta = buildTransactionMeta({ batchId: '0xABCD' });
      const baseMocks = buildLifecycleMocks({ transactionMeta: existingMeta });
      setupDefaultMessengerMock(baseMocks.messengerCall);

      const request: AddTransactionRequest = {
        addTransactionRequest: {
          options: {
            batchId: '0xabcd',
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
        constructorOptions: baseMocks.request.constructorOptions,
        dependencies: baseMocks.request.dependencies,
      };

      await expect(initTransaction(request)).rejects.toThrow(
        'Batch ID already exists',
      );
    });
  });

  describe('dapp-suggested gas fees', () => {
    it('sets dappSuggestedGasFees with gasPrice and gas when origin is external', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: {
            from: FROM_MOCK,
            gas: '0x5208',
            gasPrice: '0xff',
            to: TO_MOCK,
          },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.dappSuggestedGasFees).toStrictEqual({
        gas: '0x5208',
        gasPrice: '0xff',
      });
    });

    it('sets dappSuggestedGasFees with maxFeePerGas and maxPriorityFeePerGas for EIP-1559 fees', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: {
            from: FROM_MOCK,
            maxFeePerGas: '0x1',
            maxPriorityFeePerGas: '0x2',
            to: TO_MOCK,
          },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.dappSuggestedGasFees).toStrictEqual({
        maxFeePerGas: '0x1',
        maxPriorityFeePerGas: '0x2',
      });
    });

    it('returns undefined dappSuggestedGasFees when isInternal=true', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            isInternal: true,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: {
            from: FROM_MOCK,
            gasPrice: '0xff',
            to: TO_MOCK,
          },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.dappSuggestedGasFees).toBeUndefined();
    });

    it('returns undefined dappSuggestedGasFees when origin is undefined', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: { networkClientId: NETWORK_CLIENT_ID_MOCK },
          txParams: {
            from: FROM_MOCK,
            gasPrice: '0xff',
            to: TO_MOCK,
          },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.dappSuggestedGasFees).toBeUndefined();
    });

    it('returns undefined dappSuggestedGasFees when all gas fields are undefined', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.dappSuggestedGasFees).toBeUndefined();
    });

    it('sets only gas in dappSuggestedGasFees when only gas is provided', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: EXTERNAL_ORIGIN_MOCK,
          },
          txParams: {
            from: FROM_MOCK,
            gas: '0x5208',
            to: TO_MOCK,
          },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.dappSuggestedGasFees).toStrictEqual({
        gas: '0x5208',
      });
    });
  });

  describe('transaction type determination', () => {
    it('uses the type from options when provided', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            type: TransactionType.cancel,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.type).toBe(TransactionType.cancel);
      expect(vi.mocked(determineTransactionType)).not.toHaveBeenCalled();
    });

    it('calls determineTransactionType when type is not in options', async () => {
      vi.mocked(determineTransactionType).mockResolvedValue({
        getCodeResponse: undefined,
        type: TransactionType.contractInteraction,
      });
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(vi.mocked(determineTransactionType)).toHaveBeenCalledTimes(1);
      expect(result.transactionMeta.type).toBe(
        TransactionType.contractInteraction,
      );
    });

    it('passes the messenger and networkClientId to determineTransactionType', async () => {
      const { request } = buildRequest();

      await initTransaction(request);

      expect(vi.mocked(determineTransactionType)).toHaveBeenCalledWith(
        expect.any(Object),
        {
          messenger: request.dependencies.messenger,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );
    });
  });

  describe('transactionMeta assembly', () => {
    it('returns a transactionMeta with status unapproved', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.status).toBe(TransactionStatus.unapproved);
    });

    it('sets isInternal to false by default', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.isInternal).toBe(false);
    });

    it('sets isInternal to true when option is set', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            isInternal: true,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.isInternal).toBe(true);
    });

    it('propagates actionId onto transactionMeta', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            actionId: ACTION_ID_MOCK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.actionId).toBe(ACTION_ID_MOCK);
    });

    it('assigns a unique id to each transaction', async () => {
      const { request: request1 } = buildRequest();
      const { request: request2 } = buildRequest();

      const result1 = await initTransaction(request1);
      const result2 = await initTransaction(request2);

      expect(result1.transactionMeta.id).toBeDefined();
      expect(result2.transactionMeta.id).toBeDefined();
      expect(result1.transactionMeta.id).not.toBe(result2.transactionMeta.id);
    });

    it('sets verifiedOnBlockchain to false', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.verifiedOnBlockchain).toBe(false);
    });

    it('sets userEditedGasLimit to false', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.userEditedGasLimit).toBe(false);
    });

    it('sets isFirstTimeInteraction to undefined', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.isFirstTimeInteraction).toBeUndefined();
    });

    it('sets networkClientId from options', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.networkClientId).toBe(
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('sets isExternalSign to true when isGasFeeSponsored=true', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            isGasFeeSponsored: true,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.isExternalSign).toBe(true);
    });

    it('does not set isExternalSign when isGasFeeSponsored is not set', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.isExternalSign).toBeUndefined();
    });

    it('sets isGasFeeTokenIgnoredIfBalance to true when gasFeeToken is set without excludeNativeTokenForFee', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            gasFeeToken: '0xtoken',
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.isGasFeeTokenIgnoredIfBalance).toBe(true);
    });

    it('sets isGasFeeTokenIgnoredIfBalance to false when gasFeeToken is set with excludeNativeTokenForFee=true', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            excludeNativeTokenForFee: true,
            gasFeeToken: '0xtoken',
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.isGasFeeTokenIgnoredIfBalance).toBe(false);
    });

    it('sets isGasFeeTokenIgnoredIfBalance to false when gasFeeToken is not set', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.transactionMeta.isGasFeeTokenIgnoredIfBalance).toBe(false);
    });

    it('does not include excludeNativeTokenForFee in metadata when it is undefined', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(
        Object.prototype.hasOwnProperty.call(
          result.transactionMeta,
          'excludeNativeTokenForFee',
        ),
      ).toBe(false);
    });

    it('includes excludeNativeTokenForFee in metadata when it is explicitly set', async () => {
      const { request } = buildRequest({
        addTransactionRequest: {
          options: {
            excludeNativeTokenForFee: false,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
          txParams: { from: FROM_MOCK, to: TO_MOCK },
        },
      });

      const result = await initTransaction(request);

      expect(result.transactionMeta.excludeNativeTokenForFee).toBe(false);
    });

    it('sets the time to approximately now', async () => {
      const before = Date.now();
      const { request } = buildRequest();

      const result = await initTransaction(request);

      const after = Date.now();
      expect(result.transactionMeta.time).toBeGreaterThanOrEqual(before);
      expect(result.transactionMeta.time).toBeLessThanOrEqual(after);
    });
  });

  describe('delegation address resolution', () => {
    it('starts resolving the delegation address from the normalised from address', async () => {
      const { request } = buildRequest();
      vi.mocked(getDelegationAddress).mockResolvedValue('0xdelegate');

      await initTransaction(request);

      expect(vi.mocked(getDelegationAddress)).toHaveBeenCalledWith(
        FROM_MOCK.toLowerCase(),
        request.dependencies.messenger,
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('includes a delegationAddressPromise in the result', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.delegationAddressPromise).toBeInstanceOf(Promise);
    });

    it('resolves the delegation address promise when successful', async () => {
      const delegateAddress = '0xdelegate' as Hex;
      const { request } = buildRequest();
      vi.mocked(getDelegationAddress).mockResolvedValue(delegateAddress);

      const result = await initTransaction(request);

      expect(await result.delegationAddressPromise).toBe(delegateAddress);
    });

    it('resolves delegationAddressPromise to undefined when getDelegationAddress rejects', async () => {
      const { request } = buildRequest();
      vi.mocked(getDelegationAddress).mockRejectedValue(
        new Error('Network error'),
      );

      const result = await initTransaction(request);

      expect(await result.delegationAddressPromise).toBeUndefined();
    });
  });

  describe('return value shape', () => {
    it('returns lifecycle as an empty object', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.lifecycle).toStrictEqual({});
    });

    it('spreads all AddTransactionRequest fields onto the result', async () => {
      const { request } = buildRequest();

      const result = await initTransaction(request);

      expect(result.addTransactionRequest).toBe(request.addTransactionRequest);
      expect(result.constructorOptions).toBe(request.constructorOptions);
      expect(result.dependencies).toBe(request.dependencies);
    });
  });
});

describe('getEIP1559Compatibility', () => {
  it('calls NetworkController:getEIP1559Compatibility with the networkClientId', async () => {
    const { messengerCall, request } = buildLifecycleMocks();
    messengerCall.mockResolvedValue(true);

    await getEIP1559Compatibility(request.dependencies, NETWORK_CLIENT_ID_MOCK);

    expect(messengerCall).toHaveBeenCalledWith(
      'NetworkController:getEIP1559Compatibility',
      NETWORK_CLIENT_ID_MOCK,
    );
  });

  it('returns true when the network supports EIP-1559', async () => {
    const { messengerCall, request } = buildLifecycleMocks();
    messengerCall.mockResolvedValue(true);

    const result = await getEIP1559Compatibility(
      request.dependencies,
      NETWORK_CLIENT_ID_MOCK,
    );

    expect(result).toBe(true);
  });

  it('returns false when the network does not support EIP-1559', async () => {
    const { messengerCall, request } = buildLifecycleMocks();
    messengerCall.mockResolvedValue(false);

    const result = await getEIP1559Compatibility(
      request.dependencies,
      NETWORK_CLIENT_ID_MOCK,
    );

    expect(result).toBe(false);
  });

  it('returns false when the messenger returns null', async () => {
    const { messengerCall, request } = buildLifecycleMocks();
    messengerCall.mockResolvedValue(null);

    const result = await getEIP1559Compatibility(
      request.dependencies,
      NETWORK_CLIENT_ID_MOCK,
    );

    expect(result).toBe(false);
  });

  it('works when networkClientId is undefined', async () => {
    const { messengerCall, request } = buildLifecycleMocks();
    messengerCall.mockResolvedValue(true);

    const result = await getEIP1559Compatibility(request.dependencies);

    expect(messengerCall).toHaveBeenCalledWith(
      'NetworkController:getEIP1559Compatibility',
      undefined,
    );
    expect(result).toBe(true);
  });
});
