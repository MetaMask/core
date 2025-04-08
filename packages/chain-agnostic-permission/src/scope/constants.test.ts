import { KnownRpcMethods } from './constants';

describe('KnownRpcMethods', () => {
  it('should match the snapshot', () => {
    expect(KnownRpcMethods).toMatchInlineSnapshot(`
      Object {
        "bip122": Array [],
        "eip155": Array [
          "personal_sign",
          "eth_signTypedData_v4",
          "wallet_watchAsset",
          "eth_sendTransaction",
          "eth_decrypt",
          "eth_getEncryptionPublicKey",
          "web3_clientVersion",
          "eth_subscribe",
          "eth_unsubscribe",
          "eth_blockNumber",
          "eth_call",
          "eth_chainId",
          "eth_estimateGas",
          "eth_feeHistory",
          "eth_gasPrice",
          "eth_getBalance",
          "eth_getBlockByHash",
          "eth_getBlockByNumber",
          "eth_getBlockTransactionCountByHash",
          "eth_getBlockTransactionCountByNumber",
          "eth_getCode",
          "eth_getFilterChanges",
          "eth_getFilterLogs",
          "eth_getLogs",
          "eth_getProof",
          "eth_getStorageAt",
          "eth_getTransactionByBlockHashAndIndex",
          "eth_getTransactionByBlockNumberAndIndex",
          "eth_getTransactionByHash",
          "eth_getTransactionCount",
          "eth_getTransactionReceipt",
          "eth_getUncleCountByBlockHash",
          "eth_getUncleCountByBlockNumber",
          "eth_newBlockFilter",
          "eth_newFilter",
          "eth_newPendingTransactionFilter",
          "eth_sendRawTransaction",
          "eth_syncing",
          "eth_uninstallFilter",
        ],
        "solana": Array [],
      }
    `);
  });
});
