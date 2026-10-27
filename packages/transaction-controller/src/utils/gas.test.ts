import type { NetworkClientId } from '@metamask/network-controller';
import { remove0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash-es';
import type { Mocked } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  SimulationResponse,
  SimulationResponseTransaction,
} from '../api/simulation-api.js';
import { simulateTransactions } from '../api/simulation-api.js';
import { SimulationChainNotSupportedError } from '../errors.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import { TransactionEnvelopeType } from '../types.js';
import type { TransactionMeta, TransactionParams } from '../types.js';
import type {
  AuthorizationList,
  BatchTransactionParams,
  TransactionBatchSingleRequest,
} from '../types.js';
import {
  DELEGATION_PREFIX,
  generateEIP7702BatchTransaction,
} from './eip7702.js';
import {
  getGasEstimateBuffer,
  getGasEstimateFallback,
} from './feature-flags.js';
import type { UpdateGasRequest } from './gas.js';
import {
  addGasBuffer,
  estimateGas,
  estimateGasBatch,
  getProvidedBatchGasLimits,
  updateGas,
  DEFAULT_GAS_MULTIPLIER,
  MAX_GAS_BLOCK_PERCENT,
  EIP_2780_AUTHORIZATION_GAS,
  simulateGasBatch,
} from './gas.js';
import { rpcRequest } from './provider.js';

vi.mock(import('./provider.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  rpcRequest: vi.fn(),
}));

vi.mock('./feature-flags');
vi.mock('../api/simulation-api');

vi.mock(import('./eip7702.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  generateEIP7702BatchTransaction: vi.fn(),
}));

const DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK = 35;
const FIXED_ESTIMATE_GAS_MOCK = 100000;
const GAS_MOCK = 100;
const BLOCK_GAS_LIMIT_MOCK = 123456789;
const BLOCK_NUMBER_MOCK = '0x5678';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId' as NetworkClientId;
const FALLBACK_MULTIPLIER_35_PERCENT = 0.35;
const GET_SIMULATION_CONFIG_MOCK = vi.fn();
const MAX_GAS_MULTIPLIER = MAX_GAS_BLOCK_PERCENT / 100;
const CHAIN_ID_MOCK = '0x123';
const GAS_2_MOCK = 12345;
const SIMULATE_GAS_MOCK = 54321;
const FROM_MOCK = '0xabc';
const TO_MOCK = '0xdef';
const NEW_ACCOUNT_MOCK = '0x0000000000000000000000000000000000000001';
const DELEGATED_ACCOUNT_MOCK = '0x0000000000000000000000000000000000000002';
const VALUE_MOCK = '0x1';
const VALUE_MOCK_2 = '0x2';
const DATA_MOCK = '0xabcdef';
const DATA_MOCK_2 = '0x123456';
const GAS_MOCK_1 = '0x5208';
const GAS_MOCK_2 = '0x7a120';
const UPGRADE_CONTRACT_ADDRESS_MOCK = '0xupgrade123';

const MESSENGER_MOCK = {
  call: vi.fn().mockImplementation((action: string) => {
    if (action === 'NetworkController:getNetworkClientById') {
      return {
        configuration: { chainId: CHAIN_ID_MOCK },
        provider: {},
      };
    }

    if (action === 'KeyringController:getState') {
      return {
        keyrings: [
          {
            type: 'HD Key Tree',
            accounts: [FROM_MOCK],
          },
        ],
      };
    }

    return {
      remoteFeatureFlags: {},
    };
  }),
} as unknown as Mocked<TransactionControllerMessenger>;

function mockMessengerCall(): void {
  const messengerCallMock = vi.mocked(MESSENGER_MOCK.call);

  messengerCallMock.mockImplementation((action: string) => {
    if (action === 'NetworkController:getNetworkClientById') {
      return {
        configuration: { chainId: CHAIN_ID_MOCK },
        provider: {},
      };
    }

    if (action === 'KeyringController:getState') {
      return {
        keyrings: [
          {
            type: 'HD Key Tree',
            accounts: [FROM_MOCK],
          },
        ],
      };
    }

    return {
      remoteFeatureFlags: {},
    };
  });
}

const GAS_ESTIMATE_FALLBACK_FIXED_MOCK = {
  percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
  fixed: FIXED_ESTIMATE_GAS_MOCK,
};

const GAS_ESTIMATE_FALLBACK_MULTIPLIER_MOCK = {
  percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
  fixed: undefined,
};

const BATCH_TX_PARAMS_MOCK: BatchTransactionParams[] = [
  {
    data: DATA_MOCK,
    to: TO_MOCK,
    value: VALUE_MOCK,
  },
  {
    data: DATA_MOCK_2,
    to: TO_MOCK,
    value: VALUE_MOCK_2,
  },
];

const BATCH_TX_PARAMS_WITH_GAS_MOCK: BatchTransactionParams[] = [
  {
    data: DATA_MOCK,
    to: TO_MOCK,
    value: VALUE_MOCK,
    gas: GAS_MOCK_1,
  },
  {
    data: DATA_MOCK_2,
    to: TO_MOCK,
    value: VALUE_MOCK_2,
    gas: GAS_MOCK_2,
  },
];

const TRANSACTION_BATCH_REQUEST_MOCK: TransactionBatchSingleRequest[] = [
  {
    params: {
      data: DATA_MOCK,
      to: TO_MOCK,
      value: VALUE_MOCK,
    },
  },
  {
    params: {
      data: DATA_MOCK_2,
      to: TO_MOCK,
      value: VALUE_MOCK_2,
    },
  },
];

const SIMULATED_TRANSACTIONS_RESPONSE_MOCK: SimulationResponse = {
  transactions: [{ gasLimit: GAS_MOCK_1 }, { gasLimit: GAS_MOCK_2 }],
} as unknown as SimulationResponse;

const AUTHORIZATION_LIST_MOCK: AuthorizationList = [
  {
    address: '0x123',
  },
];

const SIGNED_AUTHORIZATION_MOCK = {
  address: '0xcccccccccccccccccccccccccccccccccccccccc',
  chainId: '0x1',
  nonce: '0x6',
  r: '0xe2582357434f268c18dd7e2920dd3a911bfc6fc5e498bf7eb33fa0f484bd1488',
  s: '0x6300c28d38a634904af92933b5b31433536a7cee8a505945c13ade9f3a1a5427',
  yParity: '0x0',
} as const;

const SIGNED_AUTHORIZATION_AUTHORITY_MOCK =
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

const TRANSACTION_META_MOCK = {
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  txParams: {
    data: '0x1',
    from: '0xabc',
    to: '0x2',
    value: '0xcba',
  },
} as unknown as TransactionMeta;

const UPDATE_GAS_REQUEST_MOCK = {
  txMeta: TRANSACTION_META_MOCK,
  isCustomNetwork: false,
  isSimulationEnabled: false,
  getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
  messenger: MESSENGER_MOCK,
} as UpdateGasRequest;

/**
 * Converts number to hex string.
 *
 * @param value - The number to convert.
 * @returns The hex string.
 */
function toHex(value: number): Hex {
  return `0x${value.toString(16)}`;
}

describe('gas', () => {
  const rpcRequestMock = vi.mocked(rpcRequest);
  const simulateTransactionsMock = vi.mocked(simulateTransactions);
  const getGasEstimateFallbackMock = vi.mocked(getGasEstimateFallback);
  const getGasEstimateBufferMock = vi.mocked(getGasEstimateBuffer);
  const generateEIP7702BatchTransactionMock = vi.mocked(
    generateEIP7702BatchTransaction,
  );

  let updateGasRequest: UpdateGasRequest;

  /**
   * Mocks query responses.
   *
   * @param options - The options.
   * @param options.getCodeResponse - The response for getCode.
   * @param options.getBlockByNumberResponse - The response for getBlockByNumber.
   * @param options.estimateGasResponse - The response for estimateGas.
   * @param options.estimateGasError - The error for estimateGas.
   * @param options.estimateGasOverridesResponse - The response for estimateGas with overrides.
   * @param options.estimateGasOverridesError - The error for estimateGas with overrides.
   */
  function mockQuery({
    getCodeResponse,
    getBlockByNumberResponse,
    estimateGasResponse,
    estimateGasError,
    estimateGasOverridesResponse,
    estimateGasOverridesError,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCodeResponse?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getBlockByNumberResponse?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGasResponse?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGasError?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGasOverridesResponse?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGasOverridesError?: any;
  }): void {
    let estimateGasCallCount = 0;

    rpcRequestMock.mockImplementation(({ method }) => {
      if (method === 'eth_getCode') {
        return Promise.resolve(getCodeResponse);
      }

      if (method === 'eth_getBlockByNumber') {
        return Promise.resolve(getBlockByNumberResponse);
      }

      if (method === 'eth_estimateGas') {
        estimateGasCallCount += 1;

        if (estimateGasCallCount === 1) {
          if (estimateGasError) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return Promise.reject(estimateGasError);
          }

          return Promise.resolve(estimateGasResponse);
        }

        if (estimateGasOverridesError) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(estimateGasOverridesError);
        }

        return Promise.resolve(estimateGasOverridesResponse);
      }

      return Promise.resolve(undefined);
    });
  }

  /**
   * Assert that estimateGas was not called.
   */
  function expectEstimateGasNotCalled(): void {
    expect(rpcRequestMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_estimateGas' }),
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mockMessengerCall();

    updateGasRequest = cloneDeep(UPDATE_GAS_REQUEST_MOCK);

    getGasEstimateFallbackMock.mockReturnValue(
      GAS_ESTIMATE_FALLBACK_MULTIPLIER_MOCK,
    );

    getGasEstimateBufferMock.mockReturnValue(1.5);
  });

  describe('updateGas', () => {
    describe('sets gas', () => {
      afterEach(() => {
        // eslint-disable-next-line vitest/no-standalone-expect
        expect(updateGasRequest.txMeta.defaultGasEstimates?.gas).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to request value if set', async () => {
        updateGasRequest.txMeta.txParams.gas = toHex(GAS_MOCK);

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(GAS_MOCK));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBeUndefined();
        expectEstimateGasNotCalled();
      });

      it('to estimate if transaction type is 0x4', async () => {
        updateGasRequest.txMeta.txParams.type = TransactionEnvelopeType.setCode;

        const gasEstimation = Math.ceil(GAS_MOCK * DEFAULT_GAS_MULTIPLIER);
        delete updateGasRequest.txMeta.txParams.to;
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_MOCK),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(gasEstimation));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to estimate if no to parameter', async () => {
        updateGasRequest.txMeta.txParams.type =
          TransactionEnvelopeType.feeMarket;
        const gasEstimation = Math.ceil(GAS_MOCK * DEFAULT_GAS_MULTIPLIER);
        delete updateGasRequest.txMeta.txParams.to;
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_MOCK),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(gasEstimation));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to estimate if estimate greater than percentage of block gas limit', async () => {
        const estimatedGas = Math.ceil(
          BLOCK_GAS_LIMIT_MOCK * MAX_GAS_MULTIPLIER + 10,
        );

        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(estimatedGas),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(estimatedGas));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to padded estimate if padded estimate less than percentage of block gas limit', async () => {
        const maxGasLimit = BLOCK_GAS_LIMIT_MOCK * MAX_GAS_MULTIPLIER;
        const estimatedGasPadded = Math.floor(maxGasLimit) - 10;
        const estimatedGas = Math.ceil(
          estimatedGasPadded / DEFAULT_GAS_MULTIPLIER,
        );

        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(estimatedGas),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(
          toHex(estimatedGasPadded),
        );
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
        expect(updateGasRequest.txMeta.gasLimitNoBuffer).toBe(
          toHex(estimatedGas),
        );
      });

      it('to percentage of block gas limit if padded estimate only is greater than percentage of block gas limit', async () => {
        const maxGasLimit = Math.round(
          BLOCK_GAS_LIMIT_MOCK * MAX_GAS_MULTIPLIER,
        );
        const estimatedGasPadded = maxGasLimit + 10;
        const estimatedGas = Math.ceil(
          estimatedGasPadded / DEFAULT_GAS_MULTIPLIER,
        );

        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(estimatedGas),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(maxGasLimit));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
        expect(updateGasRequest.txMeta.gasLimitNoBuffer).toBe(
          toHex(estimatedGas),
        );
      });

      it('to exact estimate if buffer disabled', async () => {
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_MOCK),
        });

        updateGasRequest.txMeta.disableGasBuffer = true;

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(GAS_MOCK));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      describe.each<[string, TransactionParams, Hex, Hex]>([
        [
          'self-transfer',
          { from: FROM_MOCK, to: FROM_MOCK, value: '0x0' },
          '0x5208',
          '0x2ee0',
        ],
        [
          'zero-value transfer to a distinct recipient',
          { from: FROM_MOCK, to: TO_MOCK, value: '0x0' },
          '0x5208',
          '0x3a98',
        ],
        [
          'value transfer to an existing recipient',
          { from: FROM_MOCK, to: TO_MOCK, value: VALUE_MOCK },
          '0x5208',
          '0x5208',
        ],
        [
          'value transfer to a new account',
          { from: FROM_MOCK, to: NEW_ACCOUNT_MOCK, value: VALUE_MOCK },
          '0x5208',
          '0xb3b0',
        ],
        [
          'contract creation',
          { from: FROM_MOCK, data: DATA_MOCK, value: '0x0' },
          '0xcf08',
          '0x5dc0',
        ],
        [
          'transfer to a delegated recipient',
          { from: FROM_MOCK, to: DELEGATED_ACCOUNT_MOCK, value: '0x0' },
          '0x6590',
          '0x6b6c',
        ],
        [
          'transfer from a delegated sender',
          { from: DELEGATED_ACCOUNT_MOCK, to: TO_MOCK, value: '0x0' },
          '0x6978',
          '0x7334',
        ],
      ])('%s', (_description, txParams, legacyNodeGas, upgradedNodeGas) => {
        it.each<[string, Hex]>([
          ['legacy node', legacyNodeGas],
          ['upgraded node', upgradedNodeGas],
        ])('uses the %s response', async (_node, estimatedGas) => {
          updateGasRequest.txMeta.txParams = cloneDeep(txParams);
          updateGasRequest.txMeta.disableGasBuffer = true;

          mockQuery({
            getBlockByNumberResponse: {
              gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            },
            estimateGasResponse: estimatedGas,
          });

          await updateGas(updateGasRequest);

          expect(updateGasRequest.txMeta.txParams.gas).toBe(estimatedGas);
          expect(updateGasRequest.txMeta.gasLimitNoBuffer).toBe(estimatedGas);
          expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
            estimatedGas,
          );
          expect(rpcRequestMock).toHaveBeenCalledWith({
            messenger: MESSENGER_MOCK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            method: 'eth_estimateGas',
            params: [
              expect.objectContaining({
                ...txParams,
                value: txParams.value ?? '0x0',
              }),
            ],
          });
          expect(rpcRequestMock).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'eth_getCode' }),
          );
        });
      });
    });

    describe('on estimate query error', () => {
      it('sets gas to 35% of block gas limit for a plain transfer', async () => {
        const fallbackGas = Math.floor(
          BLOCK_GAS_LIMIT_MOCK * FALLBACK_MULTIPLIER_35_PERCENT,
        );

        getGasEstimateFallbackMock.mockReturnValue(
          GAS_ESTIMATE_FALLBACK_MULTIPLIER_MOCK,
        );
        delete updateGasRequest.txMeta.txParams.data;

        mockQuery({
          getBlockByNumberResponse: {
            gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          },
          estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(fallbackGas));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
        expect(rpcRequestMock).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'eth_estimateGas' }),
        );
      });

      it('sets simulationFails property', async () => {
        mockQuery({
          getBlockByNumberResponse: {
            gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            number: BLOCK_NUMBER_MOCK,
          },
          estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.simulationFails).toStrictEqual({
          reason: 'TestError',
          errorKey: 'TestKey',
          debug: {
            blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            blockNumber: BLOCK_NUMBER_MOCK,
          },
        });
      });

      it('sets revert.gas when the estimate error carries revert data', async () => {
        const data =
          '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000';

        mockQuery({
          getBlockByNumberResponse: {
            gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            number: BLOCK_NUMBER_MOCK,
          },
          estimateGasError: {
            message: 'execution reverted',
            data,
          },
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.revert?.gas).toStrictEqual({
          message: 'ERC20: transfer amount exceeds balance',
          data,
        });
      });
    });
  });

  describe('estimateGas', () => {
    it('returns block gas limit and estimated gas', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: toHex(GAS_MOCK),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        simulationFails: undefined,
        gasRevert: undefined,
        isUpgradeWithData: false,
      });
    });

    it('returns simulationFails on error', async () => {
      mockQuery({
        getBlockByNumberResponse: {
          gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          number: BLOCK_NUMBER_MOCK,
        },
        estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: expect.any(String),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        gasRevert: undefined,
        isUpgradeWithData: false,
        simulationFails: {
          reason: 'TestError',
          errorKey: 'TestKey',
          debug: {
            blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            blockNumber: BLOCK_NUMBER_MOCK,
          },
        },
      });
    });

    it('returns gasRevert decoded from estimate error data', async () => {
      mockQuery({
        getBlockByNumberResponse: {
          gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          number: BLOCK_NUMBER_MOCK,
        },
        estimateGasError: {
          message: 'execution reverted',
          data: '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000',
        },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result.gasRevert).toStrictEqual({
        message: 'ERC20: transfer amount exceeds balance',
        data: '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000',
      });
    });

    it('returns no gasRevert when error has only a message and no data', async () => {
      mockQuery({
        getBlockByNumberResponse: {
          gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          number: BLOCK_NUMBER_MOCK,
        },
        estimateGasError: {
          message:
            'execution reverted: NativeBalanceChangeEnforcer:exceeded-balance-decrease',
        },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result.gasRevert).toBeUndefined();
    });

    it('returns estimated gas as 35% of block gas limit on error', async () => {
      const fallbackGas = Math.floor(
        BLOCK_GAS_LIMIT_MOCK * FALLBACK_MULTIPLIER_35_PERCENT,
      );

      mockQuery({
        getBlockByNumberResponse: {
          gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        },
        estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: toHex(fallbackGas),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        simulationFails: expect.any(Object),
        gasRevert: undefined,
        isUpgradeWithData: false,
      });
    });

    it('returns fixed gas estimate fallback from feature flags on error', async () => {
      getGasEstimateFallbackMock.mockReturnValue(
        GAS_ESTIMATE_FALLBACK_FIXED_MOCK,
      );
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: toHex(FIXED_ESTIMATE_GAS_MOCK),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        simulationFails: expect.any(Object),
        gasRevert: undefined,
        isUpgradeWithData: false,
      });
    });

    it('clamps the percentage-derived fallback to maxGasLimit when it exceeds the chain per-tx cap on error', async () => {
      const maxGasLimit =
        Math.floor(BLOCK_GAS_LIMIT_MOCK * FALLBACK_MULTIPLIER_35_PERCENT) - 1;

      getGasEstimateFallbackMock.mockReturnValue({
        percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
        fixed: undefined,
        maxGasLimit,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result.estimatedGas).toBe(toHex(maxGasLimit));
    });

    it('does not clamp the fallback when it is below maxGasLimit on error', async () => {
      const fallbackGas = Math.floor(
        BLOCK_GAS_LIMIT_MOCK * FALLBACK_MULTIPLIER_35_PERCENT,
      );

      getGasEstimateFallbackMock.mockReturnValue({
        percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
        fixed: undefined,
        maxGasLimit: BLOCK_GAS_LIMIT_MOCK,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result.estimatedGas).toBe(toHex(fallbackGas));
    });

    it('clamps the fixed fallback to maxGasLimit when it exceeds the chain per-tx cap on error', async () => {
      const maxGasLimit = FIXED_ESTIMATE_GAS_MOCK - 1;

      getGasEstimateFallbackMock.mockReturnValue({
        percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
        fixed: FIXED_ESTIMATE_GAS_MOCK,
        maxGasLimit,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
      });

      const result = await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result.estimatedGas).toBe(toHex(maxGasLimit));
    });

    it('removes gas fee properties from estimate request', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          gasPrice: '0x1',
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: '0x3',
        },
      });

      expect(rpcRequestMock).toHaveBeenCalledWith({
        messenger: MESSENGER_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        method: 'eth_estimateGas',
        params: [
          {
            ...TRANSACTION_META_MOCK.txParams,
            value: expect.anything(),
          },
        ],
      });
    });

    it('normalizes data in estimate request', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          data: '123',
        },
      });

      expect(rpcRequestMock).toHaveBeenCalledWith({
        messenger: MESSENGER_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        method: 'eth_estimateGas',
        params: [
          expect.objectContaining({
            ...TRANSACTION_META_MOCK.txParams,
            data: '0x123',
          }),
        ],
      });
    });

    it.each<[string, string | null | undefined, string]>([
      ['undefined', undefined, '0x0'],
      ['null', null, '0x0'],
      ['zero with leading zero digits', '0x00', '0x0'],
      [
        'a quantity with leading zero digits',
        '0x0de0b6b3a7640000',
        '0xde0b6b3a7640000',
      ],
      ['an already canonical quantity', '0x1', '0x1'],
      ['not a strict hex string', '123', '123'],
    ])(
      'normalizes value in estimate request when value is %s',
      async (_case, value, expectedValue) => {
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_MOCK),
        });

        await estimateGas({
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          isSimulationEnabled: false,
          getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
          messenger: MESSENGER_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            value: value as string | undefined,
          },
        });

        expect(rpcRequestMock).toHaveBeenCalledWith({
          messenger: MESSENGER_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          method: 'eth_estimateGas',
          params: [
            {
              ...TRANSACTION_META_MOCK.txParams,
              value: expectedValue,
            },
          ],
        });
      },
    );

    it('preserves execution parameters while omitting unsigned authorizations in the node fallback', async () => {
      const accessList = [
        {
          address: '0x0000000000000000000000000000000000000001',
          storageKeys: [
            '0x0000000000000000000000000000000000000000000000000000000000000002',
          ],
        },
      ];

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled: false,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          accessList,
          authorizationList: AUTHORIZATION_LIST_MOCK,
          type: TransactionEnvelopeType.setCode,
          value: undefined,
        },
      });

      expect(rpcRequestMock).toHaveBeenCalledWith({
        messenger: MESSENGER_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        method: 'eth_estimateGas',
        params: [
          {
            ...TRANSACTION_META_MOCK.txParams,
            accessList,
            authorizationList: undefined,
            type: undefined,
            value: '0x0',
          },
          'latest',
          {
            [TRANSACTION_META_MOCK.txParams.from]: {
              code:
                DELEGATION_PREFIX +
                remove0x(AUTHORIZATION_LIST_MOCK[0].address),
            },
          },
        ],
      });
    });

    describe('with ignoreDelegationSignatures', () => {
      it('returns gas limit from simulation', async () => {
        simulateTransactionsMock.mockResolvedValueOnce({
          transactions: [
            {
              gasLimit: toHex(SIMULATE_GAS_MOCK),
            },
          ],
        } as SimulationResponse);

        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_2_MOCK),
        });

        const result = await estimateGas({
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          ignoreDelegationSignatures: true,
          isSimulationEnabled: true,
          getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
          messenger: MESSENGER_MOCK,
          txParams: TRANSACTION_META_MOCK.txParams,
        });

        expect(result).toStrictEqual({
          estimatedGas: toHex(SIMULATE_GAS_MOCK),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          simulationFails: undefined,
          gasRevert: undefined,
          isUpgradeWithData: false,
        });
      });

      it('throws if simulation disabled', async () => {
        await expect(
          estimateGas({
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            ignoreDelegationSignatures: true,
            isSimulationEnabled: false,
            getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
            messenger: MESSENGER_MOCK,
            txParams: TRANSACTION_META_MOCK.txParams,
          }),
        ).rejects.toThrow(
          'Gas estimation with ignored delegation signatures is not supported as simulation disabled',
        );
      });
    });
  });

  describe('estimateGas with type 4 transaction', () => {
    const TYPE_4_TX_PARAMS_MOCK: TransactionParams = {
      ...TRANSACTION_META_MOCK.txParams,
      authorizationList: AUTHORIZATION_LIST_MOCK,
      to: TRANSACTION_META_MOCK.txParams.from,
      type: TransactionEnvelopeType.setCode,
    };

    /**
     * Mock the responses of the selected node.
     *
     * @param options - The options.
     * @param options.estimateGasError - Error for eth_estimateGas.
     * @param options.senderCode - Code of the sender.
     */
    function mockNode({
      estimateGasError,
      senderCode = '0x',
    }: {
      estimateGasError?: Error;
      senderCode?: Hex;
    } = {}): void {
      rpcRequestMock.mockImplementation(({ method }) => {
        switch (method) {
          case 'eth_getBlockByNumber':
            return Promise.resolve({
              gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
              number: BLOCK_NUMBER_MOCK,
            });
          case 'eth_estimateGas':
            return estimateGasError
              ? Promise.reject(estimateGasError)
              : Promise.resolve(toHex(GAS_2_MOCK));
          case 'eth_getCode':
            return Promise.resolve(senderCode);
          default:
            return Promise.resolve(undefined);
        }
      });
    }

    /**
     * Get the parameters of each eth_estimateGas request.
     *
     * @returns The parameters of each request.
     */
    function getEstimateGasParams(): unknown[] {
      return rpcRequestMock.mock.calls
        .filter(([{ method }]) => method === 'eth_estimateGas')
        .map(([{ params }]) => params);
    }

    /**
     * Call estimateGas for a type 4 transaction.
     *
     * @param txParams - Overrides for the transaction parameters.
     * @param isSimulationEnabled - Whether simulation is enabled.
     * @returns The estimateGas result.
     */
    async function estimateType4Gas(
      txParams: Partial<TransactionParams> = {},
      isSimulationEnabled = true,
    ): ReturnType<typeof estimateGas> {
      return await estimateGas({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        isSimulationEnabled,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        messenger: MESSENGER_MOCK,
        txParams: { ...TYPE_4_TX_PARAMS_MOCK, ...txParams },
      });
    }

    /**
     * Mock a single simulated transaction in the simulation API response.
     *
     * @param transaction - The simulated transaction.
     */
    function mockSimulationResponse(
      transaction: Partial<SimulationResponseTransaction>,
    ): void {
      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [transaction],
      } as SimulationResponse);
    }

    /**
     * Get the expected node estimate request without unsigned authorizations
     * and with the delegation of the sender overridden.
     *
     * @param txParams - Overrides for the expected transaction parameters.
     * @returns The expected eth_estimateGas parameters.
     */
    function getExpectedNodeOverrideParams(
      txParams: Partial<TransactionParams> = {},
    ): unknown[] {
      return [
        {
          ...TYPE_4_TX_PARAMS_MOCK,
          authorizationList: undefined,
          type: undefined,
          ...txParams,
        },
        'latest',
        {
          [TRANSACTION_META_MOCK.txParams.from]: {
            code:
              DELEGATION_PREFIX + remove0x(AUTHORIZATION_LIST_MOCK[0].address),
          },
        },
      ];
    }

    beforeEach(() => {
      mockNode();
    });

    describe('with all authorizations signed', () => {
      it('uses node estimate of exact transaction', async () => {
        const result = await estimateType4Gas({
          authorizationList: [SIGNED_AUTHORIZATION_MOCK],
        });

        expect(result).toStrictEqual({
          estimatedGas: toHex(GAS_2_MOCK),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          simulationFails: undefined,
          gasRevert: undefined,
          isUpgradeWithData: true,
        });

        expect(getEstimateGasParams()).toStrictEqual([
          [
            {
              ...TYPE_4_TX_PARAMS_MOCK,
              authorizationList: [SIGNED_AUTHORIZATION_MOCK],
            },
          ],
        ]);

        expect(simulateTransactionsMock).not.toHaveBeenCalled();
      });

      it('uses node estimate if simulation disabled', async () => {
        const result = await estimateType4Gas(
          { authorizationList: [SIGNED_AUTHORIZATION_MOCK] },
          false,
        );

        expect(result.estimatedGas).toBe(toHex(GAS_2_MOCK));
        expect(simulateTransactionsMock).not.toHaveBeenCalled();
      });
    });

    describe('with unsigned authorizations and simulation', () => {
      it('returns simulated gas from single request with authority of each authorization', async () => {
        mockSimulationResponse({ gasLimit: toHex(SIMULATE_GAS_MOCK) });

        const result = await estimateType4Gas();

        expect(result).toStrictEqual({
          estimatedGas: toHex(SIMULATE_GAS_MOCK),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          simulationFails: undefined,
          gasRevert: undefined,
          isUpgradeWithData: true,
        });

        expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
        expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
          getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
          transactions: [
            {
              authorizationList: [
                {
                  address: AUTHORIZATION_LIST_MOCK[0].address,
                  from: TRANSACTION_META_MOCK.txParams.from,
                },
              ],
              data: TRANSACTION_META_MOCK.txParams.data,
              from: TRANSACTION_META_MOCK.txParams.from,
              to: TRANSACTION_META_MOCK.txParams.from,
              value: TRANSACTION_META_MOCK.txParams.value,
            },
          ],
        });

        expectEstimateGasNotCalled();
      });

      it.each([
        ['empty data', '0x'],
        ['no data', undefined],
      ])(
        'returns simulated gas for upgrade only with %s',
        async (_title, data) => {
          mockSimulationResponse({ gasLimit: toHex(SIMULATE_GAS_MOCK) });

          const result = await estimateType4Gas({ data });

          expect(result.estimatedGas).toBe(toHex(SIMULATE_GAS_MOCK));
          expect(result.isUpgradeWithData).toBe(false);
          expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
            getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
            transactions: [expect.objectContaining({ data })],
          });
          expectEstimateGasNotCalled();
        },
      );

      it.each([
        ['with value', '0x0de0', '0xde0'],
        ['with no value', undefined, '0x0'],
      ])(
        'includes normalized value in simulation request %s',
        async (_title, value, expectedValue) => {
          mockSimulationResponse({ gasLimit: toHex(SIMULATE_GAS_MOCK) });

          await estimateType4Gas({ to: TO_MOCK, value });

          expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
            getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
            transactions: [
              expect.objectContaining({ to: TO_MOCK, value: expectedValue }),
            ],
          });
        },
      );

      it('maps pre-signed foreign authorization to recovered authority in mixed list', async () => {
        mockSimulationResponse({ gasLimit: toHex(SIMULATE_GAS_MOCK) });

        const result = await estimateType4Gas({
          authorizationList: [
            ...AUTHORIZATION_LIST_MOCK,
            SIGNED_AUTHORIZATION_MOCK,
          ],
        });

        expect(result.estimatedGas).toBe(toHex(SIMULATE_GAS_MOCK));
        expect(
          simulateTransactionsMock.mock.calls[0][1].transactions[0]
            .authorizationList,
        ).toStrictEqual([
          {
            address: AUTHORIZATION_LIST_MOCK[0].address,
            from: TRANSACTION_META_MOCK.txParams.from,
          },
          {
            address: SIGNED_AUTHORIZATION_MOCK.address,
            from: SIGNED_AUTHORIZATION_AUTHORITY_MOCK,
          },
        ]);
        expectEstimateGasNotCalled();
      });

      it('returns simulationFails if authority of signed authorization in mixed list cannot be determined', async () => {
        const result = await estimateType4Gas({
          authorizationList: [
            ...AUTHORIZATION_LIST_MOCK,
            { ...SIGNED_AUTHORIZATION_MOCK, r: '0x0', s: '0x0' },
          ],
        });

        expect(result.simulationFails?.reason).toBe(
          'Cannot determine authority of signed authorization',
        );
        expect(simulateTransactionsMock).not.toHaveBeenCalled();
        expectEstimateGasNotCalled();
      });

      it('returns simulationFails without node estimate if simulated transaction has error', async () => {
        mockSimulationResponse({
          error: 'execution reverted',
          gasLimit: toHex(SIMULATE_GAS_MOCK),
        });

        const result = await estimateType4Gas();

        expect(result).toStrictEqual({
          estimatedGas: toHex(
            Math.floor(BLOCK_GAS_LIMIT_MOCK * FALLBACK_MULTIPLIER_35_PERCENT),
          ),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          gasRevert: undefined,
          isUpgradeWithData: true,
          simulationFails: {
            debug: {
              blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
              blockNumber: BLOCK_NUMBER_MOCK,
            },
            errorKey: undefined,
            reason: 'Simulation failed: execution reverted',
          },
        });

        expectEstimateGasNotCalled();
      });

      it.each<[string, () => void]>([
        [
          'chain is not supported',
          (): void => {
            simulateTransactionsMock.mockRejectedValueOnce(
              new SimulationChainNotSupportedError(CHAIN_ID_MOCK),
            );
          },
        ],
        [
          'request fails',
          (): void => {
            simulateTransactionsMock.mockRejectedValueOnce(
              new Error('Network error'),
            );
          },
        ],
        [
          'gas limit is missing',
          (): void =>
            mockSimulationResponse({ gasUsed: toHex(SIMULATE_GAS_MOCK) }),
        ],
        [
          'gas limit is zero',
          (): void => mockSimulationResponse({ gasLimit: '0x0' }),
        ],
      ])(
        'uses node estimate with intrinsic and delegation gas if simulation %s',
        async (_title, mockSimulation) => {
          mockSimulation();

          const result = await estimateType4Gas();

          expect(result.estimatedGas).toBe(
            toHex(GAS_2_MOCK + 7816 + EIP_2780_AUTHORIZATION_GAS),
          );
          expect(result.simulationFails).toBeUndefined();
          expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
          expect(getEstimateGasParams()).toStrictEqual([
            getExpectedNodeOverrideParams(),
          ]);
        },
      );
    });

    describe('with unsigned authorizations and no simulation', () => {
      it('uses node estimate without unsigned authorizations and adds intrinsic and delegation gas', async () => {
        const result = await estimateType4Gas({}, false);

        expect(result).toStrictEqual({
          estimatedGas: toHex(GAS_2_MOCK + 7816 + EIP_2780_AUTHORIZATION_GAS),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          simulationFails: undefined,
          gasRevert: undefined,
          isUpgradeWithData: true,
        });

        expect(simulateTransactionsMock).not.toHaveBeenCalled();
        expect(getEstimateGasParams()).toStrictEqual([
          getExpectedNodeOverrideParams(),
        ]);

        expect(rpcRequestMock).toHaveBeenCalledWith({
          messenger: MESSENGER_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          method: 'eth_getCode',
          params: [TRANSACTION_META_MOCK.txParams.from, 'latest'],
        });
      });

      it.each([1, 2])(
        'adds only intrinsic gas for %i unsigned authorizations if sender already delegated',
        async (count) => {
          mockNode({
            senderCode: `${DELEGATION_PREFIX}${'1'.repeat(40)}`,
          });

          const result = await estimateType4Gas(
            {
              authorizationList: Array.from(
                { length: count },
                () => AUTHORIZATION_LIST_MOCK[0],
              ),
            },
            false,
          );

          expect(result.estimatedGas).toBe(toHex(GAS_2_MOCK + count * 7816));
          expect(getEstimateGasParams()).toStrictEqual([
            getExpectedNodeOverrideParams(),
          ]);
        },
      );

      it.each([
        ['not delegated', '0x', EIP_2780_AUTHORIZATION_GAS],
        ['already delegated', `${DELEGATION_PREFIX}${'1'.repeat(40)}`, 0],
      ] as const)(
        'preserves signed authorizations and adds intrinsic gas only for unsigned entries when %s',
        async (_title, senderCode, delegationGas) => {
          mockNode({ senderCode });
          const secondAddress = '0x456' as Hex;

          const result = await estimateType4Gas(
            {
              authorizationList: [
                ...AUTHORIZATION_LIST_MOCK,
                { address: secondAddress },
                SIGNED_AUTHORIZATION_MOCK,
              ],
            },
            false,
          );

          expect(result.estimatedGas).toBe(
            toHex(GAS_2_MOCK + 2 * 7816 + delegationGas),
          );

          expect(getEstimateGasParams()).toStrictEqual([
            [
              expect.objectContaining({
                authorizationList: [SIGNED_AUTHORIZATION_MOCK],
                type: TransactionEnvelopeType.setCode,
              }),
              'latest',
              {
                [TRANSACTION_META_MOCK.txParams.from]: {
                  code: DELEGATION_PREFIX + remove0x(secondAddress),
                },
              },
            ],
          ]);
        },
      );

      it('returns simulationFails if node estimate fails', async () => {
        mockNode({ estimateGasError: new Error('Estimate failed') });

        const result = await estimateType4Gas({}, false);

        expect(result.simulationFails?.reason).toBe('Estimate failed');
        expect(result.estimatedGas).toBe(
          toHex(
            Math.floor(BLOCK_GAS_LIMIT_MOCK * FALLBACK_MULTIPLIER_35_PERCENT),
          ),
        );
      });
    });

    it('uses existing node estimate if no authorization list', async () => {
      const result = await estimateType4Gas({ authorizationList: undefined });

      expect(result.estimatedGas).toBe(toHex(GAS_2_MOCK));
      expect(simulateTransactionsMock).not.toHaveBeenCalled();
      expect(getEstimateGasParams()).toStrictEqual([
        [{ ...TYPE_4_TX_PARAMS_MOCK, authorizationList: undefined }],
      ]);
    });

    it('applies gas buffer once in updateGas', async () => {
      mockSimulationResponse({ gasLimit: toHex(SIMULATE_GAS_MOCK) });

      updateGasRequest.isSimulationEnabled = true;
      updateGasRequest.txMeta.txParams = { ...TYPE_4_TX_PARAMS_MOCK };

      await updateGas(updateGasRequest);

      expect(getGasEstimateBufferMock).toHaveBeenCalledTimes(1);
      expect(getGasEstimateBufferMock).toHaveBeenCalledWith({
        chainId: CHAIN_ID_MOCK,
        isCustomRPC: false,
        isUpgradeWithData: true,
        messenger: MESSENGER_MOCK,
      });

      expect(updateGasRequest.txMeta.gasLimitNoBuffer).toBe(
        toHex(SIMULATE_GAS_MOCK),
      );

      expect(updateGasRequest.txMeta.txParams.gas).toBe(
        toHex(Math.floor(SIMULATE_GAS_MOCK * 1.5)),
      );
    });
  });

  describe('addGasBuffer', () => {
    it('returns estimated gas if greater than percentage of block gas limit', () => {
      const estimatedGas = Math.ceil(
        BLOCK_GAS_LIMIT_MOCK * MAX_GAS_MULTIPLIER + 10,
      );

      const result = addGasBuffer(
        toHex(estimatedGas),
        toHex(BLOCK_GAS_LIMIT_MOCK),
        DEFAULT_GAS_MULTIPLIER,
      );

      expect(result).toBe(toHex(estimatedGas));
    });

    it('returns padded estimate if less than percentage of block gas limit', () => {
      const maxGasLimit = BLOCK_GAS_LIMIT_MOCK * MAX_GAS_MULTIPLIER;
      const estimatedGasPadded = Math.floor(maxGasLimit - 10);
      const estimatedGas = Math.ceil(
        estimatedGasPadded / DEFAULT_GAS_MULTIPLIER,
      );

      const result = addGasBuffer(
        toHex(estimatedGas),
        toHex(BLOCK_GAS_LIMIT_MOCK),
        DEFAULT_GAS_MULTIPLIER,
      );

      expect(result).toBe(toHex(estimatedGasPadded));
    });

    it('returns percentage of block gas limit if padded estimate only is greater than percentage of block gas limit', () => {
      const maxGasLimit = Math.round(BLOCK_GAS_LIMIT_MOCK * MAX_GAS_MULTIPLIER);
      const estimatedGasPadded = maxGasLimit + 10;
      const estimatedGas = Math.ceil(
        estimatedGasPadded / DEFAULT_GAS_MULTIPLIER,
      );

      const result = addGasBuffer(
        toHex(estimatedGas),
        toHex(BLOCK_GAS_LIMIT_MOCK),
        DEFAULT_GAS_MULTIPLIER,
      );

      expect(result).toBe(toHex(maxGasLimit));
    });
  });

  describe('estimateGasBatch', () => {
    it('uses EIP-7702 when supported and upgrade required', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_ID_MOCK,
          isSupported: false,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);

      generateEIP7702BatchTransactionMock.mockReturnValue({
        to: TO_MOCK,
        data: DATA_MOCK,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
      });

      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [
          {
            gasLimit: toHex(GAS_MOCK),
          },
        ],
      } as SimulationResponse);

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: GAS_MOCK,
        gasLimits: [GAS_MOCK],
        requiresAuthorizationList: true,
      });

      expect(generateEIP7702BatchTransactionMock).toHaveBeenCalledWith(
        FROM_MOCK,
        BATCH_TX_PARAMS_MOCK,
      );

      expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        transactions: [
          {
            authorizationList: [
              { address: UPGRADE_CONTRACT_ADDRESS_MOCK, from: FROM_MOCK },
            ],
            data: DATA_MOCK,
            from: FROM_MOCK,
            to: TO_MOCK,
            value: '0x0',
          },
        ],
      });

      expectEstimateGasNotCalled();
    });

    it('uses EIP-7702 when supported but upgrade not required', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_ID_MOCK,
          isSupported: true,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);

      generateEIP7702BatchTransactionMock.mockReturnValue({
        to: TO_MOCK,
        data: DATA_MOCK,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: GAS_MOCK,
        gasLimits: [GAS_MOCK],
      });

      expect(rpcRequestMock).toHaveBeenCalledWith({
        messenger: MESSENGER_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        method: 'eth_estimateGas',
        params: [
          expect.objectContaining({
            to: TO_MOCK,
            data: DATA_MOCK,
            from: FROM_MOCK,
            authorizationList: undefined,
            type: undefined,
          }),
        ],
      });
    });

    it('prefers 7702 simulated gas over provided gas when simulation succeeds', async () => {
      // The bundled 7702 call has no per-tx intrinsic gas cost so the
      // simulated estimate is typically lower than the sum of provided per-tx
      // limits — prefer it when available.
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_ID_MOCK,
          isSupported: true,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);

      generateEIP7702BatchTransactionMock.mockReturnValue({
        to: TO_MOCK,
        data: DATA_MOCK,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_WITH_GAS_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: GAS_MOCK,
        gasLimits: [GAS_MOCK],
      });
    });

    it('falls back to provided gas in 7702 path when simulation fails', async () => {
      // Callers that submit batches whose individual sub-calls cannot be
      // simulated standalone (e.g. predict-withdraw, where the batch's first
      // sub-call provides token balance to the rest) rely on this fallback —
      // otherwise simulation reverts and falls back to the block gas limit.
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_ID_MOCK,
          isSupported: true,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);

      generateEIP7702BatchTransactionMock.mockReturnValue({
        to: TO_MOCK,
        data: DATA_MOCK,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasError: new Error('execution reverted'),
      });

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_WITH_GAS_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: 521000,
        gasLimits: [521000],
      });
    });

    it('preserves requiresAuthorizationList when 7702 fallback fires for upgrade-required account', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_ID_MOCK,
          isSupported: false,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);

      generateEIP7702BatchTransactionMock.mockReturnValue({
        to: TO_MOCK,
        data: DATA_MOCK,
      });

      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasError: new Error('execution reverted'),
      });

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_WITH_GAS_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: 521000,
        gasLimits: [521000],
        requiresAuthorizationList: true,
      });
    });

    it('throws error when upgrade contract address not found', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_ID_MOCK,
          isSupported: false,
          upgradeContractAddress: undefined,
        },
      ]);

      await expect(
        estimateGasBatch({
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          from: FROM_MOCK,
          getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
          isAtomicBatchSupported: isAtomicBatchSupportedMock,
          messenger: MESSENGER_MOCK,
          transactions: BATCH_TX_PARAMS_MOCK,
        }),
      ).rejects.toThrow('Upgrade contract address not found');
    });

    it('uses provided gas limits when all transactions have gas', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([]);

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_WITH_GAS_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: 521000,
        gasLimits: [21000, 500000],
      });

      expect(simulateTransactionsMock).not.toHaveBeenCalled();
    });

    it('simulates gas when not all transactions have gas', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([]);

      simulateTransactionsMock.mockResolvedValue(
        SIMULATED_TRANSACTIONS_RESPONSE_MOCK,
      );

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: 521000,
        gasLimits: [21000, 500000],
      });

      expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        transactions: [
          {
            ...BATCH_TX_PARAMS_MOCK[0],
            from: FROM_MOCK,
          },
          {
            ...BATCH_TX_PARAMS_MOCK[1],
            from: FROM_MOCK,
          },
        ],
      });
    });

    it('prefers provided gas over simulated gas when both available', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([]);

      const customGasValue = toHex(100000);

      const mixedBatchParams: BatchTransactionParams[] = [
        {
          data: DATA_MOCK,
          to: TO_MOCK,
          value: VALUE_MOCK,
          gas: customGasValue,
        },
        {
          data: DATA_MOCK_2,
          to: TO_MOCK,
          value: VALUE_MOCK_2,
        },
      ];

      simulateTransactionsMock.mockResolvedValue(
        SIMULATED_TRANSACTIONS_RESPONSE_MOCK,
      );

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: mixedBatchParams,
      });

      expect(result.gasLimits[0]).toBe(100000);
      expect(result.gasLimits[1]).toBe(500000);
      expect(result.totalGasLimit).toBe(600000);
    });

    it('skips EIP-7702 path when account does not support it', async () => {
      const isAtomicBatchSupportedMock = vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_ID_MOCK,
          isSupported: true,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);

      vi.mocked(MESSENGER_MOCK.call).mockImplementation((action: string) => {
        if (action === 'NetworkController:getNetworkClientById') {
          return {
            configuration: { chainId: CHAIN_ID_MOCK },
            provider: {},
          };
        }

        if (action === 'KeyringController:getState') {
          return {
            keyrings: [
              {
                type: 'Ledger Hardware',
                accounts: [FROM_MOCK],
              },
            ],
          };
        }

        return {
          remoteFeatureFlags: {},
        };
      });

      simulateTransactionsMock.mockResolvedValue(
        SIMULATED_TRANSACTIONS_RESPONSE_MOCK,
      );

      const result = await estimateGasBatch({
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        isAtomicBatchSupported: isAtomicBatchSupportedMock,
        messenger: MESSENGER_MOCK,
        transactions: BATCH_TX_PARAMS_MOCK,
      });

      expect(generateEIP7702BatchTransactionMock).not.toHaveBeenCalled();
      expect(result.gasLimits).toHaveLength(2);
    });
  });

  describe('getProvidedBatchGasLimits', () => {
    it('returns parsed limits + sum when every transaction has a gas value', () => {
      expect(
        getProvidedBatchGasLimits(BATCH_TX_PARAMS_WITH_GAS_MOCK),
      ).toStrictEqual({
        gasLimits: [21000, 500000],
        totalGasLimit: 521000,
      });
    });

    it('returns undefined when none of the transactions have gas', () => {
      expect(getProvidedBatchGasLimits(BATCH_TX_PARAMS_MOCK)).toBeUndefined();
    });

    it('returns undefined when only some transactions have gas', () => {
      const mixed = [BATCH_TX_PARAMS_WITH_GAS_MOCK[0], BATCH_TX_PARAMS_MOCK[0]];
      expect(getProvidedBatchGasLimits(mixed)).toBeUndefined();
    });

    it('parses hex gas values correctly', () => {
      const txWithHexGas = [
        { ...BATCH_TX_PARAMS_MOCK[0], gas: '0x5208' as Hex },
        { ...BATCH_TX_PARAMS_MOCK[1], gas: '0x7a120' as Hex },
      ];
      expect(getProvidedBatchGasLimits(txWithHexGas)).toStrictEqual({
        gasLimits: [21000, 500000],
        totalGasLimit: 521000,
      });
    });

    it('returns zero-length result for an empty batch', () => {
      // `every` on empty array returns true, so the function returns a valid
      // (but empty) result rather than `undefined`. Callers of `estimateGasBatch`
      // always pass at least one transaction, so this is documenting current
      // behaviour rather than a guarantee.
      expect(getProvidedBatchGasLimits([])).toStrictEqual({
        gasLimits: [],
        totalGasLimit: 0,
      });
    });
  });

  describe('simulateGasBatch', () => {
    it('returns the total gas limit as a hex string', async () => {
      simulateTransactionsMock.mockResolvedValueOnce(
        SIMULATED_TRANSACTIONS_RESPONSE_MOCK,
      );

      const result = await simulateGasBatch({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        transactions: TRANSACTION_BATCH_REQUEST_MOCK,
      });

      expect(result).toStrictEqual({
        totalGasLimit: '0x7f328', // Total gas limit (21000 + 500000 = 521000)
        gasLimits: ['0x5208', '0x7a120'],
      });

      expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
      expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        transactions: [
          {
            ...TRANSACTION_BATCH_REQUEST_MOCK[0].params,
            from: FROM_MOCK,
          },
          {
            ...TRANSACTION_BATCH_REQUEST_MOCK[1].params,
            from: FROM_MOCK,
          },
        ],
      });
    });

    it('throws an error if the simulated response does not match the number of transactions', async () => {
      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [
          { gasLimit: GAS_MOCK_1 } as unknown as SimulationResponseTransaction,
        ], // Only one transaction returned
        sponsorship: {
          isSponsored: false,
          error: null,
        },
      });

      await expect(
        simulateGasBatch({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
          transactions: TRANSACTION_BATCH_REQUEST_MOCK,
        }),
      ).rejects.toThrow(
        'Cannot estimate transaction batch total gas as simulation failed',
      );

      expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
    });

    it('throws an error if no simulated gas is returned for a transaction', async () => {
      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [
          { gasLimit: undefined },
          { gasLimit: GAS_MOCK_2 },
        ] as unknown as SimulationResponseTransaction[],
        sponsorship: {
          isSponsored: false,
          error: null,
        },
      });

      await expect(
        simulateGasBatch({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
          transactions: TRANSACTION_BATCH_REQUEST_MOCK,
        }),
      ).rejects.toThrow(
        'Cannot estimate transaction batch total gas as simulation failed',
      );

      expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
    });

    it('handles empty transactions gracefully', async () => {
      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [],
        sponsorship: {
          isSponsored: false,
          error: null,
        },
      });

      const result = await simulateGasBatch({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        transactions: [],
      });

      expect(result).toStrictEqual({
        totalGasLimit: '0x0', // Total gas limit is 0
        gasLimits: [],
      });

      expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
      expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
        getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
        transactions: [],
      });
    });

    it('throws an error if the simulation fails', async () => {
      simulateTransactionsMock.mockRejectedValueOnce(
        new Error('Simulation failed'),
      );

      await expect(
        simulateGasBatch({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
          transactions: TRANSACTION_BATCH_REQUEST_MOCK,
        }),
      ).rejects.toThrow(
        'Cannot estimate transaction batch total gas as simulation failed',
      );

      expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
    });
  });
});
