import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { remove0x, type Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { DELEGATION_PREFIX } from './eip7702';
import { getGasEstimateBuffer, getGasEstimateFallback } from './feature-flags';
import type { UpdateGasRequest } from './gas';
import {
  addGasBuffer,
  estimateGas,
  updateGas,
  FIXED_GAS,
  DEFAULT_GAS_MULTIPLIER,
  MAX_GAS_BLOCK_PERCENT,
  INTRINSIC_GAS,
  DUMMY_AUTHORIZATION_SIGNATURE,
} from './gas';
import type { SimulationResponse } from '../api/simulation-api';
import { simulateTransactions } from '../api/simulation-api';
import type { TransactionControllerMessenger } from '../TransactionController';
import { TransactionEnvelopeType, type TransactionMeta } from '../types';
import type { AuthorizationList } from '../types';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

jest.mock('./feature-flags');
jest.mock('../api/simulation-api');

const DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK = 35;
const FIXED_ESTIMATE_GAS_MOCK = 100000;
const MESSENGER_MOCK = {
  call: jest.fn().mockReturnValue({
    remoteFeatureFlags: {},
  }),
} as unknown as jest.Mocked<TransactionControllerMessenger>;

const GAS_ESTIMATE_FALLBACK_FIXED_MOCK = {
  percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
  fixed: FIXED_ESTIMATE_GAS_MOCK,
};

const GAS_ESTIMATE_FALLBACK_MULTIPLIER_MOCK = {
  percentage: DEFAULT_GAS_ESTIMATE_FALLBACK_MOCK,
  fixed: undefined,
};

const GAS_MOCK = 100;
const BLOCK_GAS_LIMIT_MOCK = 123456789;
const BLOCK_NUMBER_MOCK = '0x5678';
const ETH_QUERY_MOCK = {} as unknown as EthQuery;
const FALLBACK_MULTIPLIER_35_PERCENT = 0.35;
const MAX_GAS_MULTIPLIER = MAX_GAS_BLOCK_PERCENT / 100;
const CHAIN_ID_MOCK = '0x123';
const GAS_2_MOCK = 12345;
const SIMULATE_GAS_MOCK = 54321;

const AUTHORIZATION_LIST_MOCK: AuthorizationList = [
  {
    address: '0x123',
  },
];

const TRANSACTION_META_MOCK = {
  txParams: {
    data: '0x1',
    from: '0xabc',
    to: '0x2',
    value: '0xcba',
  },
} as unknown as TransactionMeta;

const UPDATE_GAS_REQUEST_MOCK = {
  txMeta: TRANSACTION_META_MOCK,
  chainId: '0x0',
  isCustomNetwork: false,
  isSimulationEnabled: false,
  ethQuery: ETH_QUERY_MOCK,
  messenger: MESSENGER_MOCK,
} as UpdateGasRequest;

/**
 * Converts number to hex string.
 *
 * @param value - The number to convert.
 * @returns The hex string.
 */
function toHex(value: number) {
  return `0x${value.toString(16)}`;
}

describe('gas', () => {
  const queryMock = jest.mocked(query);
  const simulateTransactionsMock = jest.mocked(simulateTransactions);
  const getGasEstimateFallbackMock = jest.mocked(getGasEstimateFallback);
  const getGasEstimateBufferMock = jest.mocked(getGasEstimateBuffer);

  let updateGasRequest: UpdateGasRequest;

  /**
   * Mocks query responses.
   *
   * @param options - The options.
   * @param options.getCodeResponse - The response for getCode.
   * @param options.getBlockByNumberResponse - The response for getBlockByNumber.
   * @param options.estimateGasResponse - The response for estimateGas.
   * @param options.estimateGasError - The error for estimateGas.
   */
  function mockQuery({
    getCodeResponse,
    getBlockByNumberResponse,
    estimateGasResponse,
    estimateGasError,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCodeResponse?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getBlockByNumberResponse?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGasResponse?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGasError?: any;
  }) {
    if (getCodeResponse !== undefined) {
      queryMock.mockResolvedValueOnce(getCodeResponse);
    }

    if (getBlockByNumberResponse !== undefined) {
      queryMock.mockResolvedValueOnce(getBlockByNumberResponse);
    }

    if (estimateGasError) {
      queryMock.mockRejectedValueOnce(estimateGasError);
    } else {
      queryMock.mockResolvedValueOnce(estimateGasResponse);
    }
  }

  /**
   * Assert that estimateGas was not called.
   */
  function expectEstimateGasNotCalled() {
    expect(queryMock).not.toHaveBeenCalledWith(
      expect.anything(),
      'estimateGas',
      expect.anything(),
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();

    updateGasRequest = cloneDeep(UPDATE_GAS_REQUEST_MOCK);

    getGasEstimateFallbackMock.mockReturnValue(
      GAS_ESTIMATE_FALLBACK_MULTIPLIER_MOCK,
    );

    getGasEstimateBufferMock.mockReturnValue(1.5);
  });

  describe('updateGas', () => {
    describe('sets gas', () => {
      afterEach(() => {
        // eslint-disable-next-line jest/no-standalone-expect
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

      describe('to fixed value', () => {
        it('if not custom network and to parameter and no data and no code', async () => {
          updateGasRequest.isCustomNetwork = false;
          delete updateGasRequest.txMeta.txParams.data;

          mockQuery({
            getCodeResponse: null,
          });

          await updateGas(updateGasRequest);

          expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
          expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
            updateGasRequest.txMeta.txParams.gas,
          );
          expectEstimateGasNotCalled();
        });

        it('if not custom network and to parameter and no data and empty code', async () => {
          updateGasRequest.isCustomNetwork = false;
          delete updateGasRequest.txMeta.txParams.data;

          mockQuery({
            getCodeResponse: '0x',
          });

          await updateGas(updateGasRequest);

          expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
          expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
            updateGasRequest.txMeta.txParams.gas,
          );
          expectEstimateGasNotCalled();
        });
      });
    });

    describe('on estimate query error', () => {
      it('sets gas to 35% of block gas limit', async () => {
        const fallbackGas = Math.floor(
          BLOCK_GAS_LIMIT_MOCK * FALLBACK_MULTIPLIER_35_PERCENT,
        );

        getGasEstimateFallbackMock.mockReturnValue(
          GAS_ESTIMATE_FALLBACK_MULTIPLIER_MOCK,
        );

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
    });
  });

  describe('estimateGas', () => {
    it('returns block gas limit and estimated gas', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      const result = await estimateGas({
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: toHex(GAS_MOCK),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        simulationFails: undefined,
        isUpgradeWithDataToSelf: false,
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
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: expect.any(String),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        isUpgradeWithDataToSelf: false,
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
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: toHex(fallbackGas),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        simulationFails: expect.any(Object),
        isUpgradeWithDataToSelf: false,
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
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual({
        estimatedGas: toHex(FIXED_ESTIMATE_GAS_MOCK),
        blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
        simulationFails: expect.any(Object),
        isUpgradeWithDataToSelf: false,
      });
    });

    it('removes gas fee properties from estimate request', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      await estimateGas({
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          gasPrice: '0x1',
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: '0x3',
        },
      });

      expect(queryMock).toHaveBeenCalledWith(ETH_QUERY_MOCK, 'estimateGas', [
        {
          ...TRANSACTION_META_MOCK.txParams,
          value: expect.anything(),
        },
      ]);
    });

    it('normalizes data in estimate request', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      await estimateGas({
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          data: '123',
        },
      });

      expect(queryMock).toHaveBeenCalledWith(ETH_QUERY_MOCK, 'estimateGas', [
        expect.objectContaining({
          ...TRANSACTION_META_MOCK.txParams,
          data: '0x123',
        }),
      ]);
    });

    it('normalizes value in estimate request', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      await estimateGas({
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          value: undefined,
        },
      });

      expect(queryMock).toHaveBeenCalledWith(ETH_QUERY_MOCK, 'estimateGas', [
        {
          ...TRANSACTION_META_MOCK.txParams,
          value: '0x0',
        },
      ]);
    });

    it('normalizes authorization list in estimate request', async () => {
      mockQuery({
        getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
        estimateGasResponse: toHex(GAS_MOCK),
      });

      await estimateGas({
        chainId: CHAIN_ID_MOCK,
        ethQuery: ETH_QUERY_MOCK,
        isSimulationEnabled: false,
        messenger: MESSENGER_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          authorizationList: AUTHORIZATION_LIST_MOCK,
          value: undefined,
        },
      });

      expect(queryMock).toHaveBeenCalledWith(ETH_QUERY_MOCK, 'estimateGas', [
        {
          ...TRANSACTION_META_MOCK.txParams,
          authorizationList: [
            {
              ...AUTHORIZATION_LIST_MOCK[0],
              chainId: CHAIN_ID_MOCK,
              nonce: '0x1',
              r: DUMMY_AUTHORIZATION_SIGNATURE,
              s: DUMMY_AUTHORIZATION_SIGNATURE,
              yParity: '0x1',
            },
          ],
          value: '0x0',
        },
      ]);
    });

    describe('with type 4 transaction and data to self', () => {
      it('returns combination of provider estimate and simulation', async () => {
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_2_MOCK),
        });

        simulateTransactionsMock.mockResolvedValueOnce({
          transactions: [
            {
              gasLimit: toHex(SIMULATE_GAS_MOCK) as Hex,
            },
          ],
        } as SimulationResponse);

        const result = await estimateGas({
          chainId: CHAIN_ID_MOCK,
          ethQuery: ETH_QUERY_MOCK,
          isSimulationEnabled: true,
          messenger: MESSENGER_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: AUTHORIZATION_LIST_MOCK,
            to: TRANSACTION_META_MOCK.txParams.from,
            type: TransactionEnvelopeType.setCode,
          },
        });

        expect(result).toStrictEqual({
          estimatedGas: toHex(GAS_2_MOCK + SIMULATE_GAS_MOCK - INTRINSIC_GAS),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          simulationFails: undefined,
          isUpgradeWithDataToSelf: true,
        });
      });

      it('uses provider estimate with no data and dummy authorization signature', async () => {
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_2_MOCK),
        });

        simulateTransactionsMock.mockResolvedValueOnce({
          transactions: [
            {
              gasUsed: toHex(SIMULATE_GAS_MOCK) as Hex,
            },
          ],
        } as SimulationResponse);

        await estimateGas({
          chainId: CHAIN_ID_MOCK,
          ethQuery: ETH_QUERY_MOCK,
          isSimulationEnabled: true,
          messenger: MESSENGER_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: [
              {
                ...AUTHORIZATION_LIST_MOCK[0],
                chainId: CHAIN_ID_MOCK,
                nonce: '0x1',
                r: DUMMY_AUTHORIZATION_SIGNATURE,
                s: DUMMY_AUTHORIZATION_SIGNATURE,
                yParity: '0x1',
              },
            ],
            to: TRANSACTION_META_MOCK.txParams.from,
            type: TransactionEnvelopeType.setCode,
          },
        });

        expect(queryMock).toHaveBeenCalledWith(ETH_QUERY_MOCK, 'estimateGas', [
          {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: [
              {
                address: AUTHORIZATION_LIST_MOCK[0].address,
                chainId: CHAIN_ID_MOCK,
                nonce: '0x1',
                r: DUMMY_AUTHORIZATION_SIGNATURE,
                s: DUMMY_AUTHORIZATION_SIGNATURE,
                yParity: '0x1',
              },
            ],
            data: '0x',
            to: TRANSACTION_META_MOCK.txParams.from,
            type: TransactionEnvelopeType.setCode,
          },
        ]);
      });

      it('uses simulation API', async () => {
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_2_MOCK),
        });

        simulateTransactionsMock.mockResolvedValueOnce({
          transactions: [
            {
              gasUsed: toHex(SIMULATE_GAS_MOCK) as Hex,
            },
          ],
        } as SimulationResponse);

        await estimateGas({
          chainId: CHAIN_ID_MOCK,
          ethQuery: ETH_QUERY_MOCK,
          isSimulationEnabled: true,
          messenger: MESSENGER_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: AUTHORIZATION_LIST_MOCK,
            to: TRANSACTION_META_MOCK.txParams.from,
            type: TransactionEnvelopeType.setCode,
          },
        });

        expect(simulateTransactionsMock).toHaveBeenCalledWith(CHAIN_ID_MOCK, {
          transactions: [
            {
              ...TRANSACTION_META_MOCK.txParams,
              to: TRANSACTION_META_MOCK.txParams.from,
            },
          ],
          overrides: {
            [TRANSACTION_META_MOCK.txParams.from]: {
              code:
                DELEGATION_PREFIX +
                remove0x(AUTHORIZATION_LIST_MOCK[0].address),
            },
          },
        });
      });

      it('does provider estimation if simulation is disabled', async () => {
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_2_MOCK),
        });

        const result = await estimateGas({
          chainId: CHAIN_ID_MOCK,
          ethQuery: ETH_QUERY_MOCK,
          isSimulationEnabled: false,
          messenger: MESSENGER_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: AUTHORIZATION_LIST_MOCK,
            to: TRANSACTION_META_MOCK.txParams.from,
            type: TransactionEnvelopeType.setCode,
          },
        });

        expect(result).toStrictEqual({
          estimatedGas: toHex(GAS_2_MOCK),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          simulationFails: undefined,
          isUpgradeWithDataToSelf: true,
        });
      });

      it('uses fallback if simulation fails', async () => {
        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_2_MOCK),
        });

        simulateTransactionsMock.mockResolvedValueOnce({
          transactions: [
            {
              gasUsed: undefined,
            },
          ],
        } as SimulationResponse);

        const result = await estimateGas({
          chainId: CHAIN_ID_MOCK,
          ethQuery: ETH_QUERY_MOCK,
          isSimulationEnabled: true,
          messenger: MESSENGER_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            authorizationList: AUTHORIZATION_LIST_MOCK,
            to: TRANSACTION_META_MOCK.txParams.from,
            type: TransactionEnvelopeType.setCode,
          },
        });

        expect(result).toStrictEqual({
          estimatedGas: expect.any(String),
          blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          isUpgradeWithDataToSelf: true,
          simulationFails: {
            debug: {
              blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
              blockNumber: undefined,
            },
            errorKey: undefined,
            reason: 'No simulated gas returned',
          },
        });
      });
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
});
