import type { Hex } from '@metamask/utils';

import type { JsonRpcRequestMock } from '../../../tests/mock-network';

/**
 * Builds mock eth_gasPrice request.
 * Used by getSuggestedGasFees.
 *
 * @param result - the hex gas price result.
 * @returns The mock json rpc request object.
 */
export function buildEthGasPriceRequestMock(
  result: Hex = '0x1',
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_gasPrice',
      params: [],
    },
    response: {
      result,
    },
  };
}

/**
 * Builds mock eth_blockNumber request.
 * Used by NetworkController and BlockTracker.
 *
 * @param result - the hex block number result.
 * @returns The mock json rpc request object.
 */
export function buildEthBlockNumberRequestMock(
  result: Hex,
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_blockNumber',
      params: [],
    },
    response: {
      result,
    },
  };
}

/**
 * Builds mock eth_getCode request.
 * Used by readAddressAsContract and requiresFixedGas.
 *
 * @param address - The hex address.
 * @param blockNumber - The hex block number.
 * @param result - the hex code result.
 * @returns The mock json rpc request object.
 */
export function buildEthGetCodeRequestMock(
  address: Hex,
  blockNumber: Hex = '0x1',
  result: Hex = '0x',
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_getCode',
      params: [address, blockNumber],
    },
    response: {
      result,
    },
  };
}

/**
 * Builds mock eth_getBlockByNumber request.
 * Used by NetworkController.
 *
 * @param number - the hex (block) number.
 * @param baseFeePerGas - the hex base fee per gas result.
 * @returns The mock json rpc request object.
 */
export function buildEthGetBlockByNumberRequestMock(
  number: Hex,
  baseFeePerGas: Hex = '0x63c498a46',
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_getBlockByNumber',
      params: [number, false],
    },
    response: {
      result: {
        baseFeePerGas,
        number,
      },
    },
  };
}

/**
 * Builds mock eth_estimateGas request.
 * Used by estimateGas.
 *
 * @param from - The hex from address.
 * @param to - The hex to address.
 * @param result - the hex gas result.
 * @returns The mock json rpc request object.
 */
export function buildEthEstimateGasRequestMock(
  from: Hex,
  to: Hex,
  result: Hex = '0x1',
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_estimateGas',
      params: [
        {
          from,
          to,
          value: '0x0',
          gas: '0x0',
        },
      ],
    },
    response: {
      result,
    },
  };
}

/**
 * Builds mock eth_getTransactionCount request.
 * Used by NonceTracker.
 *
 * @param address - The hex address.
 * @param blockNumber - The hex block number.
 * @param result - the hex transaction count result.
 * @returns The mock json rpc request object.
 */
export function buildEthGetTransactionCountRequestMock(
  address: Hex,
  blockNumber: Hex = '0x1',
  result: Hex = '0x1',
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_getTransactionCount',
      params: [address, blockNumber],
    },
    response: {
      result,
    },
  };
}

/**
 * Builds mock eth_getBlockByHash request.
 * Used by PendingTransactionTracker.#onTransactionConfirmed.
 *
 * @param blockhash - The hex block hash.
 * @returns The mock json rpc request object.
 */
export function buildEthGetBlockByHashRequestMock(
  blockhash: Hex,
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_getBlockByHash',
      params: [blockhash, false],
    },
    response: {
      result: {
        transactions: [],
      },
    },
  };
}

/**
 * Builds mock eth_sendRawTransaction request.
 * Used by publishTransaction.
 *
 * @param txData - The hex signed transaction data.
 * @param result - the hex transaction hash result.
 * @returns The mock json rpc request object.
 */
export function buildEthSendRawTransactionRequestMock(
  txData: Hex,
  result: Hex,
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_sendRawTransaction',
      params: [txData],
    },
    response: {
      result,
    },
  };
}

/**
 * Builds mock eth_getTransactionReceipt request.
 * Used by PendingTransactionTracker.#checkTransaction.
 *
 * @param txHash - The hex transaction hash.
 * @param blockHash - the hex transaction hash result.
 * @param blockNumber - the hex block number result.
 * @param status - the hex status result.
 * @returns The mock json rpc request object.
 */
export function buildEthGetTransactionReceiptRequestMock(
  txHash: Hex,
  blockHash: Hex,
  blockNumber: Hex,
  status: Hex = '0x1',
): JsonRpcRequestMock {
  return {
    request: {
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    },
    response: {
      result: {
        blockHash,
        blockNumber,
        status,
      },
    },
  };
}
