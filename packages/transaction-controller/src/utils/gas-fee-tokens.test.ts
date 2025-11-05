import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { getNativeBalance } from './balance';
import { doesChainSupportEIP7702 } from './eip7702';
import { getEIP7702UpgradeContractAddress } from './feature-flags';
import type { GetGasFeeTokensRequest } from './gas-fee-tokens';
import {
  getGasFeeTokens,
  processGasFeeTokensNoApproval,
} from './gas-fee-tokens';
import type {
  GasFeeToken,
  GetSimulationConfig,
  TransactionControllerMessenger,
  TransactionMeta,
} from '..';
import { simulateTransactions } from '../api/simulation-api';

jest.mock('../api/simulation-api');
jest.mock('./eip7702');
jest.mock('./feature-flags');
jest.mock('./balance');

const ETH_QUERY_MOCK = {} as EthQuery;
const CHAIN_ID_MOCK = '0x1';
const TOKEN_ADDRESS_1_MOCK = '0x1234567890abcdef1234567890abcdef12345678';
const TOKEN_ADDRESS_2_MOCK = '0xabcdef1234567890abcdef1234567890abcdef12';
const GAS_FEE_TOKEN_MOCK = { amount: '0x123' as Hex } as GasFeeToken;

const UPGRADE_CONTRACT_ADDRESS_MOCK =
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef';

const REQUEST_MOCK: GetGasFeeTokensRequest = {
  chainId: CHAIN_ID_MOCK,
  isEIP7702GasFeeTokensEnabled: jest.fn().mockResolvedValue(true),
  getSimulationConfig: jest.fn(),
  messenger: {} as TransactionControllerMessenger,
  publicKeyEIP7702: '0x123',
  transactionMeta: {
    txParams: {
      from: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      to: '0x1234567890abcdef1234567890abcdef1234567a',
      value: '0x1000000000000000000',
      data: '0x',
    },
  } as TransactionMeta,
};

const TRANSACTION_META_MOCK = {
  selectedGasFeeToken: '0x1234567890abcdef1234567890abcdef12345678' as Hex,
  txParams: {
    from: '0x456',
  },
} as TransactionMeta;

describe('Gas Fee Tokens Utils', () => {
  const simulateTransactionsMock = jest.mocked(simulateTransactions);
  const doesChainSupportEIP7702Mock = jest.mocked(doesChainSupportEIP7702);
  const getEIP7702UpgradeContractAddressMock = jest.mocked(
    getEIP7702UpgradeContractAddress,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    getEIP7702UpgradeContractAddressMock.mockReturnValue(
      UPGRADE_CONTRACT_ADDRESS_MOCK,
    );
  });

  describe('getGasFeeTokens', () => {
    it('returns tokens using simulation API', async () => {
      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [
          {
            fees: [
              {
                gas: '0x1',
                maxFeePerGas: '0x2',
                maxPriorityFeePerGas: '0x3',
                tokenFees: [
                  {
                    token: {
                      address: TOKEN_ADDRESS_1_MOCK,
                      decimals: 3,
                      symbol: 'TEST1',
                    },
                    balanceNeededToken: '0x4',
                    currentBalanceToken: '0x5',
                    feeRecipient: '0x6',
                    rateWei: '0x7',
                    transferEstimate: '0x7a',
                    serviceFee: '0x7b',
                  },
                  {
                    token: {
                      address: TOKEN_ADDRESS_2_MOCK,
                      decimals: 4,
                      symbol: 'TEST2',
                    },
                    balanceNeededToken: '0x8',
                    currentBalanceToken: '0x9',
                    feeRecipient: '0xa',
                    rateWei: '0xb',
                    transferEstimate: '0xba',
                    serviceFee: '0xbb',
                  },
                ],
              },
            ],
            return: '0x',
          },
        ],
        sponsorship: {
          isSponsored: true,
          error: null,
        },
      });

      const result = await getGasFeeTokens(REQUEST_MOCK);

      expect(result).toStrictEqual({
        gasFeeTokens: [
          {
            amount: '0x4',
            balance: '0x5',
            decimals: 3,
            fee: '0x7b',
            gas: '0x1',
            gasTransfer: '0x7a',
            maxFeePerGas: '0x2',
            maxPriorityFeePerGas: '0x3',
            rateWei: '0x7',
            recipient: '0x6',
            symbol: 'TEST1',
            tokenAddress: TOKEN_ADDRESS_1_MOCK,
          },
          {
            amount: '0x8',
            balance: '0x9',
            decimals: 4,
            fee: '0xbb',
            gas: '0x1',
            gasTransfer: '0xba',
            maxFeePerGas: '0x2',
            maxPriorityFeePerGas: '0x3',
            rateWei: '0xb',
            recipient: '0xa',
            symbol: 'TEST2',
            tokenAddress: TOKEN_ADDRESS_2_MOCK,
          },
        ],
        isGasFeeSponsored: true,
      });
    });

    it('uses first fee level from simulation response', async () => {
      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [
          {
            fees: [
              {
                gas: '0x1',
                maxFeePerGas: '0x2',
                maxPriorityFeePerGas: '0x3',
                tokenFees: [
                  {
                    token: {
                      address: TOKEN_ADDRESS_1_MOCK,
                      decimals: 3,
                      symbol: 'TEST1',
                    },
                    balanceNeededToken: '0x4',
                    currentBalanceToken: '0x5',
                    feeRecipient: '0x6',
                    rateWei: '0x7',
                    transferEstimate: '0x7a',
                    serviceFee: '0x7b',
                  },
                ],
              },
              {
                gas: '0x8',
                maxFeePerGas: '0x9',
                maxPriorityFeePerGas: '0xa',
                tokenFees: [
                  {
                    token: {
                      address: TOKEN_ADDRESS_2_MOCK,
                      decimals: 4,
                      symbol: 'TEST2',
                    },
                    balanceNeededToken: '0xb',
                    currentBalanceToken: '0xc',
                    feeRecipient: '0xd',
                    rateWei: '0xe',
                    transferEstimate: '0xee',
                    serviceFee: '0xef',
                  },
                ],
              },
            ],
            return: '0x',
          },
        ],
        sponsorship: {
          isSponsored: true,
          error: null,
        },
      });

      const result = await getGasFeeTokens(REQUEST_MOCK);

      expect(result).toStrictEqual({
        gasFeeTokens: [
          {
            amount: '0x4',
            balance: '0x5',
            decimals: 3,
            fee: '0x7b',
            gas: '0x1',
            gasTransfer: '0x7a',
            maxFeePerGas: '0x2',
            maxPriorityFeePerGas: '0x3',
            rateWei: '0x7',
            recipient: '0x6',
            symbol: 'TEST1',
            tokenAddress: TOKEN_ADDRESS_1_MOCK,
          },
        ],
        isGasFeeSponsored: true,
      });
    });

    it('returns empty if error', async () => {
      simulateTransactionsMock.mockImplementationOnce(() => {
        throw new Error('Simulation error');
      });

      const result = await getGasFeeTokens(REQUEST_MOCK);

      expect(result).toStrictEqual({
        gasFeeTokens: [],
        isGasFeeSponsored: false,
      });
    });

    it('with 7702 if isEIP7702GasFeeTokensEnabled and chain supports EIP-7702', async () => {
      jest
        .mocked(REQUEST_MOCK.isEIP7702GasFeeTokensEnabled)
        .mockResolvedValue(true);

      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [],
        sponsorship: {
          isSponsored: false,
          error: null,
        },
      });

      await getGasFeeTokens(REQUEST_MOCK);

      expect(simulateTransactionsMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        expect.objectContaining({
          suggestFees: expect.objectContaining({
            with7702: true,
          }),
        }),
      );
    });

    it('without 7702 if isEIP7702GasFeeTokensEnabled but chain does not support EIP-7702', async () => {
      jest
        .mocked(REQUEST_MOCK.isEIP7702GasFeeTokensEnabled)
        .mockResolvedValue(true);

      doesChainSupportEIP7702Mock.mockReturnValueOnce(false);

      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [],
        sponsorship: {
          isSponsored: false,
          error: null,
        },
      });

      await getGasFeeTokens(REQUEST_MOCK);

      expect(simulateTransactionsMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        expect.objectContaining({
          suggestFees: expect.objectContaining({
            with7702: false,
          }),
        }),
      );
    });

    it('with authorizationList if isEIP7702GasFeeTokensEnabled and chain supports EIP-7702 and no delegation address', async () => {
      jest
        .mocked(REQUEST_MOCK.isEIP7702GasFeeTokensEnabled)
        .mockResolvedValue(true);

      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [],
        sponsorship: {
          isSponsored: false,
          error: null,
        },
      });

      await getGasFeeTokens(REQUEST_MOCK);

      expect(simulateTransactionsMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        expect.objectContaining({
          transactions: [
            expect.objectContaining({
              authorizationList: [
                {
                  address: UPGRADE_CONTRACT_ADDRESS_MOCK,
                  from: REQUEST_MOCK.transactionMeta.txParams.from,
                },
              ],
            }),
          ],
        }),
      );
    });

    it('with authorizationList if in transaction params', async () => {
      jest
        .mocked(REQUEST_MOCK.isEIP7702GasFeeTokensEnabled)
        .mockResolvedValue(false);

      simulateTransactionsMock.mockResolvedValueOnce({
        transactions: [],
        sponsorship: {
          isSponsored: false,
          error: null,
        },
      });

      const request = cloneDeep(REQUEST_MOCK);

      request.transactionMeta.txParams.authorizationList = [
        {
          address: TOKEN_ADDRESS_2_MOCK,
        },
      ];

      await getGasFeeTokens(request);

      expect(simulateTransactionsMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        expect.objectContaining({
          transactions: [
            expect.objectContaining({
              authorizationList: [
                {
                  address: TOKEN_ADDRESS_2_MOCK,
                  from: REQUEST_MOCK.transactionMeta.txParams.from,
                },
              ],
            }),
          ],
        }),
      );
    });

    it('forwards simulation config', async () => {
      const getSimulationConfigMock: GetSimulationConfig = jest.fn();

      const request = {
        ...REQUEST_MOCK,
        getSimulationConfig: getSimulationConfigMock,
      };

      await getGasFeeTokens(request);

      expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
      expect(simulateTransactionsMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          getSimulationConfig: getSimulationConfigMock,
        }),
      );
    });
  });

  describe('processGasFeeTokensNoApproval', () => {
    const fetchGasFeeTokensMock = jest.fn();
    const updateTransactionMock = jest.fn();
    const getNativeBalanceMock = jest.mocked(getNativeBalance);

    let request: Parameters<typeof processGasFeeTokensNoApproval>[0];

    beforeEach(() => {
      fetchGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

      getNativeBalanceMock.mockResolvedValue({
        balanceRaw: '1000',
        balanceHuman: '0',
      });

      request = {
        ethQuery: ETH_QUERY_MOCK,
        fetchGasFeeTokens: fetchGasFeeTokensMock,
        transaction: cloneDeep(TRANSACTION_META_MOCK),
        updateTransaction: updateTransactionMock,
      };
    });

    it('updates gas fee tokens if selected gas fee token', async () => {
      await processGasFeeTokensNoApproval(request);

      const txDraft = {};
      updateTransactionMock.mock.calls[0][1](txDraft);

      expect(txDraft).toStrictEqual({
        gasFeeTokens: [GAS_FEE_TOKEN_MOCK],
      });
    });

    it('does nothing if no selected gas fee token', async () => {
      request.transaction.selectedGasFeeToken = undefined;

      await processGasFeeTokensNoApproval(request);

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('removes selected gas fee token if sufficient balance and isGasFeeTokenIgnoredIfBalance is true', async () => {
      request.transaction.isGasFeeTokenIgnoredIfBalance = true;
      request.transaction.txParams.gas = '0x2';
      request.transaction.txParams.gasPrice = '0x1f4';

      await processGasFeeTokensNoApproval(request);

      const txDraft = {};
      updateTransactionMock.mock.calls[0][1](txDraft);

      expect(txDraft).toStrictEqual({
        selectedGasFeeToken: undefined,
      });
    });

    it('updates gas fee tokens if insufficient balance and isGasFeeTokenIgnoredIfBalance is true', async () => {
      request.transaction.isGasFeeTokenIgnoredIfBalance = true;
      request.transaction.txParams.gas = '0x1';
      request.transaction.txParams.maxFeePerGas = '0x3e9';

      await processGasFeeTokensNoApproval(request);

      const txDraft = {};
      updateTransactionMock.mock.calls[0][1](txDraft);

      expect(txDraft).toStrictEqual({
        gasFeeTokens: [GAS_FEE_TOKEN_MOCK],
      });
    });
  });
});
