import { Interface } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';

import { NATIVE_TOKEN_ADDRESS } from '../constants';
import { getMessengerMock } from '../tests/messenger-mock';
import { getTransferredAmountFromTxHash } from './transaction-receipt';

jest.mock('@ethersproject/providers', () => ({
  ...jest.requireActual('@ethersproject/providers'),
  Web3Provider: jest.fn(),
}));

const TX_HASH_MOCK = '0xabc123';
const WALLET_ADDRESS_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const ERC20_ADDRESS_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const NETWORK_CLIENT_ID_MOCK = 'net-client-1';
const PROVIDER_MOCK = { request: jest.fn() };

const erc20Interface = new Interface(abiERC20);

function buildTransferCallData(to: Hex, amount: string): string {
  return erc20Interface.encodeFunctionData('transfer', [to, amount]);
}

describe('getTransferredAmountFromTxHash', () => {
  const {
    messenger,
    findNetworkClientIdByChainIdMock,
    getNetworkClientByIdMock,
  } = getMessengerMock();

  let mockGetTransaction: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();

    mockGetTransaction = jest.fn();

    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
    getNetworkClientByIdMock.mockReturnValue({
      provider: PROVIDER_MOCK,
    } as never);

    (Web3Provider as unknown as jest.Mock).mockImplementation(() => ({
      getTransaction: mockGetTransaction,
    }));
  });

  describe('native token', () => {
    it('returns tx.value for native token transfer', async () => {
      mockGetTransaction.mockResolvedValue({
        value: { toString: () => '1500000000000000000' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
      });

      expect(result).toBe('1500000000000000000');
    });

    it('returns undefined when transaction is not found', async () => {
      mockGetTransaction.mockResolvedValue(null);

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when native tx.value is zero', async () => {
      mockGetTransaction.mockResolvedValue({
        value: { toString: () => '0' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('ERC-20 token', () => {
    it('decodes transfer amount from tx.data', async () => {
      mockGetTransaction.mockResolvedValue({
        to: ERC20_ADDRESS_MOCK,
        data: buildTransferCallData(WALLET_ADDRESS_MOCK, '5000000'),
        value: { toString: () => '0' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      });

      expect(result).toBe('5000000');
    });

    it('returns undefined when transaction is not found', async () => {
      mockGetTransaction.mockResolvedValue(null);

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when tx.data is missing', async () => {
      mockGetTransaction.mockResolvedValue({
        to: ERC20_ADDRESS_MOCK,
        data: undefined,
        value: { toString: () => '0' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when tx.data has non-transfer selector', async () => {
      mockGetTransaction.mockResolvedValue({
        to: ERC20_ADDRESS_MOCK,
        data: `0x095ea7b3${'0'.repeat(128)}`,
        value: { toString: () => '0' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when tx.data is too short', async () => {
      mockGetTransaction.mockResolvedValue({
        to: ERC20_ADDRESS_MOCK,
        data: '0xa9059c',
        value: { toString: () => '0' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when tx.to does not match tokenAddress', async () => {
      mockGetTransaction.mockResolvedValue({
        to: '0x3333333333333333333333333333333333333333',
        data: buildTransferCallData(WALLET_ADDRESS_MOCK, '5000000'),
        value: { toString: () => '0' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when ERC-20 transfer amount is zero', async () => {
      mockGetTransaction.mockResolvedValue({
        to: ERC20_ADDRESS_MOCK,
        data: buildTransferCallData(WALLET_ADDRESS_MOCK, '0'),
        value: { toString: () => '0' },
      });

      const result = await getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      });

      expect(result).toBeUndefined();
    });
  });

  it('propagates provider errors', async () => {
    mockGetTransaction.mockRejectedValue(new Error('RPC error'));

    await expect(
      getTransferredAmountFromTxHash({
        messenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_MOCK,
        tokenAddress: ERC20_ADDRESS_MOCK,
      }),
    ).rejects.toThrow('RPC error');
  });
});
