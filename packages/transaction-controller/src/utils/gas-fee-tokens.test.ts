import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { isNativeBalanceSufficientForGas } from './balance';
import { doesChainSupportEIP7702 } from './eip7702';
import { getEIP7702UpgradeContractAddress } from './feature-flags';
import type { GetGasFeeTokensRequest } from './gas-fee-tokens';
import {
  checkGasFeeTokenBeforePublish,
  getGasFeeTokens,
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

const CHAIN_ID_MOCK = '0x1';
const TOKEN_ADDRESS_1_MOCK =
  '0x1234567890abcdef1234567890abcdef12345678' as Hex;
const TOKEN_ADDRESS_2_MOCK = '0xabcdef1234567890abcdef1234567890abcdef12';
const UPGRADE_CONTRACT_ADDRESS_MOCK =
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef';

const TRANSACTION_META_MOCK = {
  txParams: {
    from: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
    to: '0x1234567890abcdef1234567890abcdef1234567a',
    value: '0x1000000000000000000',
    data: '0x',
  },
} as TransactionMeta;

const REQUEST_MOCK: GetGasFeeTokensRequest = {
  chainId: CHAIN_ID_MOCK,
  isEIP7702GasFeeTokensEnabled: jest.fn().mockResolvedValue(true),
  getSimulationConfig: jest.fn(),
  messenger: {} as TransactionControllerMessenger,
  publicKeyEIP7702: '0x123',
  transactionMeta: TRANSACTION_META_MOCK,
};

describe('Gas Fee Tokens Utils', () => {
  const simulateTransactionsMock = jest.mocked(simulateTransactions);
  const doesChainSupportEIP7702Mock = jest.mocked(doesChainSupportEIP7702);

  const isNativeBalanceSufficientForGasMock = jest.mocked(
    isNativeBalanceSufficientForGas,
  );

  const getEIP7702UpgradeContractAddressMock = jest.mocked(
    getEIP7702UpgradeContractAddress,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    getEIP7702UpgradeContractAddressMock.mockReturnValue(
      UPGRADE_CONTRACT_ADDRESS_MOCK,
    );

    isNativeBalanceSufficientForGasMock.mockResolvedValue(false);
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

  describe('checkGasFeeTokenBeforePublish', () => {
    let request: Parameters<typeof checkGasFeeTokenBeforePublish>[0];

    beforeEach(() => {
      request = {
        ethQuery: {} as EthQuery,
        fetchGasFeeTokens: jest.fn(),
        transaction: cloneDeep(TRANSACTION_META_MOCK),
        updateTransaction: jest.fn(),
      };
    });

    it('throws if gas fee token not found in gas fee tokens', async () => {
      request.transaction.isGasFeeTokenIgnoredIfBalance = true;
      request.transaction.selectedGasFeeToken = TOKEN_ADDRESS_1_MOCK;
      request.transaction.gasFeeTokens = [];

      await expect(checkGasFeeTokenBeforePublish(request)).rejects.toThrow(
        'Gas fee token not found and insufficient native balance',
      );
    });

    it('updates gas fee tokens', async () => {
      request.transaction.isGasFeeTokenIgnoredIfBalance = true;
      request.transaction.selectedGasFeeToken = TOKEN_ADDRESS_1_MOCK;
      request.transaction.gasFeeTokens = undefined;

      jest.mocked(request.fetchGasFeeTokens).mockResolvedValueOnce([
        {
          tokenAddress: TOKEN_ADDRESS_1_MOCK,
        } as GasFeeToken,
      ]);

      await checkGasFeeTokenBeforePublish(request);

      expect(request.fetchGasFeeTokens).toHaveBeenCalledTimes(1);
    });

    it('sets external sign to true if gas fee token found', async () => {
      request.transaction.isGasFeeTokenIgnoredIfBalance = true;
      request.transaction.selectedGasFeeToken = TOKEN_ADDRESS_1_MOCK;
      request.transaction.gasFeeTokens = [];
      request.transaction.isExternalSign = false;

      jest.mocked(request.fetchGasFeeTokens).mockResolvedValueOnce([
        {
          tokenAddress: TOKEN_ADDRESS_1_MOCK,
        } as GasFeeToken,
      ]);

      await checkGasFeeTokenBeforePublish(request);

      jest
        .mocked(request.updateTransaction)
        .mock.calls[0][1](request.transaction);

      expect(request.transaction.isExternalSign).toBe(true);
    });

    it('removes nonce if gas fee token found', async () => {
      request.transaction.isGasFeeTokenIgnoredIfBalance = true;
      request.transaction.selectedGasFeeToken = TOKEN_ADDRESS_1_MOCK;
      request.transaction.gasFeeTokens = [];
      request.transaction.txParams.nonce = '0x1';

      jest.mocked(request.fetchGasFeeTokens).mockResolvedValueOnce([
        {
          tokenAddress: TOKEN_ADDRESS_1_MOCK,
        } as GasFeeToken,
      ]);

      await checkGasFeeTokenBeforePublish(request);

      jest
        .mocked(request.updateTransaction)
        .mock.calls[0][1](request.transaction);

      expect(request.transaction.txParams.nonce).toBeUndefined();
    });

    it('removes selected gas fee token if native balance sufficient', async () => {
      request.transaction.isGasFeeTokenIgnoredIfBalance = true;
      request.transaction.selectedGasFeeToken = TOKEN_ADDRESS_1_MOCK;
      request.transaction.isExternalSign = true;

      isNativeBalanceSufficientForGasMock.mockResolvedValueOnce(true);

      await checkGasFeeTokenBeforePublish(request);

      jest
        .mocked(request.updateTransaction)
        .mock.calls[0][1](request.transaction);

      expect(request.transaction.selectedGasFeeToken).toBeUndefined();
      expect(request.transaction.isExternalSign).toBe(false);
    });

    it('does nothing if no selected gas fee token', async () => {
      await checkGasFeeTokenBeforePublish(request);

      expect(request.updateTransaction).not.toHaveBeenCalled();
    });

    it('does nothing if not ignoring gas fee token when native balance sufficient', async () => {
      request.transaction.selectedGasFeeToken = TOKEN_ADDRESS_1_MOCK;
      request.transaction.isGasFeeTokenIgnoredIfBalance = false;

      await checkGasFeeTokenBeforePublish(request);

      expect(request.updateTransaction).not.toHaveBeenCalled();
    });
  });
});
