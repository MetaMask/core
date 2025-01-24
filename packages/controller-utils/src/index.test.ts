import * as allExports from '.';

describe('@metamask/controller-utils', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "BrokenCircuitError",
        "CircuitState",
        "DEFAULT_CIRCUIT_BREAK_DURATION",
        "DEFAULT_DEGRADED_THRESHOLD",
        "DEFAULT_MAX_CONSECUTIVE_FAILURES",
        "DEFAULT_MAX_RETRIES",
        "createServicePolicy",
        "handleAll",
        "handleWhen",
        "BNToHex",
        "convertHexToDecimal",
        "fetchWithErrorHandling",
        "fractionBN",
        "fromHex",
        "getBuyURL",
        "gweiDecToWEIBN",
        "handleFetch",
        "hexToBN",
        "hexToText",
        "isNonEmptyArray",
        "isPlainObject",
        "isSafeChainId",
        "isSafeDynamicKey",
        "isSmartContractCode",
        "isValidJson",
        "isValidHexAddress",
        "normalizeEnsName",
        "query",
        "safelyExecute",
        "safelyExecuteWithTimeout",
        "successfulFetch",
        "timeoutFetch",
        "toChecksumHexAddress",
        "toHex",
        "weiHexToGweiDec",
        "isEqualCaseInsensitive",
        "RPC",
        "FALL_BACK_VS_CURRENCY",
        "IPFS_DEFAULT_GATEWAY_URL",
        "GANACHE_CHAIN_ID",
        "MAX_SAFE_CHAIN_ID",
        "ERC721",
        "ERC1155",
        "ERC20",
        "ERC721_INTERFACE_ID",
        "ERC721_METADATA_INTERFACE_ID",
        "ERC721_ENUMERABLE_INTERFACE_ID",
        "ERC1155_INTERFACE_ID",
        "ERC1155_METADATA_URI_INTERFACE_ID",
        "ERC1155_TOKEN_RECEIVER_INTERFACE_ID",
        "GWEI",
        "ASSET_TYPES",
        "TESTNET_TICKER_SYMBOLS",
        "BUILT_IN_NETWORKS",
        "OPENSEA_PROXY_URL",
        "NFT_API_BASE_URL",
        "NFT_API_VERSION",
        "NFT_API_TIMEOUT",
        "ORIGIN_METAMASK",
        "ApprovalType",
        "CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP",
        "InfuraNetworkType",
        "NetworkType",
        "isNetworkType",
        "isInfuraNetworkType",
        "BuiltInNetworkName",
        "ChainId",
        "NetworksTicker",
        "BlockExplorerUrl",
        "NetworkNickname",
        "parseDomainParts",
        "isValidSIWEOrigin",
        "detectSIWE",
      ]
    `);
  });
});
