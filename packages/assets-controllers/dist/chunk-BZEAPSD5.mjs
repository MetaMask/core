// src/assetsUtil.ts
import {
  convertHexToDecimal,
  toChecksumHexAddress
} from "@metamask/controller-utils";
import { remove0x } from "@metamask/utils";
import BN from "bn.js";
var TOKEN_PRICES_BATCH_SIZE = 30;
function compareNftMetadata(newNftMetadata, nft) {
  const keys = [
    "image",
    "backgroundColor",
    "imagePreview",
    "imageThumbnail",
    "imageOriginal",
    "animation",
    "animationOriginal",
    "externalLink",
    "tokenURI"
  ];
  const differentValues = keys.reduce((value, key) => {
    if (newNftMetadata[key] && newNftMetadata[key] !== nft[key]) {
      return value + 1;
    }
    return value;
  }, 0);
  return differentValues > 0;
}
function hasNewCollectionFields(newNftMetadata, nft) {
  const keysNewNftMetadata = Object.keys(newNftMetadata.collection ?? {});
  const keysExistingNft = new Set(Object.keys(nft.collection ?? {}));
  return keysNewNftMetadata.some((key) => !keysExistingNft.has(key));
}
var aggregatorNameByKey = {
  aave: "Aave",
  bancor: "Bancor",
  cmc: "CMC",
  cryptocom: "Crypto.com",
  coinGecko: "CoinGecko",
  oneInch: "1inch",
  paraswap: "Paraswap",
  pmm: "PMM",
  zapper: "Zapper",
  zerion: "Zerion",
  zeroEx: "0x",
  synthetix: "Synthetix",
  yearn: "Yearn",
  apeswap: "ApeSwap",
  binanceDex: "BinanceDex",
  pancakeTop100: "PancakeTop100",
  pancakeExtended: "PancakeExtended",
  balancer: "Balancer",
  quickswap: "QuickSwap",
  matcha: "Matcha",
  pangolinDex: "PangolinDex",
  pangolinDexStableCoin: "PangolinDexStableCoin",
  pangolinDexAvaxBridge: "PangolinDexAvaxBridge",
  traderJoe: "TraderJoe",
  airswapLight: "AirswapLight",
  kleros: "Kleros"
};
var formatAggregatorNames = (aggregators) => {
  return aggregators.map(
    (key) => aggregatorNameByKey[key] || `${key[0].toUpperCase()}${key.substring(1, key.length)}`
  );
};
var formatIconUrlWithProxy = ({
  chainId,
  tokenAddress
}) => {
  const chainIdDecimal = convertHexToDecimal(chainId).toString();
  return `https://static.cx.metamask.io/api/v1/tokenIcons/${chainIdDecimal}/${tokenAddress.toLowerCase()}.png`;
};
var SupportedTokenDetectionNetworks = /* @__PURE__ */ ((SupportedTokenDetectionNetworks2) => {
  SupportedTokenDetectionNetworks2["mainnet"] = "0x1";
  SupportedTokenDetectionNetworks2["bsc"] = "0x38";
  SupportedTokenDetectionNetworks2["polygon"] = "0x89";
  SupportedTokenDetectionNetworks2["avax"] = "0xa86a";
  SupportedTokenDetectionNetworks2["aurora"] = "0x4e454152";
  SupportedTokenDetectionNetworks2["linea_goerli"] = "0xe704";
  SupportedTokenDetectionNetworks2["linea_mainnet"] = "0xe708";
  SupportedTokenDetectionNetworks2["arbitrum"] = "0xa4b1";
  SupportedTokenDetectionNetworks2["optimism"] = "0xa";
  SupportedTokenDetectionNetworks2["base"] = "0x2105";
  SupportedTokenDetectionNetworks2["zksync"] = "0x144";
  SupportedTokenDetectionNetworks2["cronos"] = "0x19";
  SupportedTokenDetectionNetworks2["celo"] = "0xa4ec";
  SupportedTokenDetectionNetworks2["gnosis"] = "0x64";
  SupportedTokenDetectionNetworks2["fantom"] = "0xfa";
  SupportedTokenDetectionNetworks2["polygon_zkevm"] = "0x44d";
  SupportedTokenDetectionNetworks2["moonbeam"] = "0x504";
  SupportedTokenDetectionNetworks2["moonriver"] = "0x505";
  return SupportedTokenDetectionNetworks2;
})(SupportedTokenDetectionNetworks || {});
function isTokenDetectionSupportedForNetwork(chainId) {
  return Object.values(SupportedTokenDetectionNetworks).includes(chainId);
}
function isTokenListSupportedForNetwork(chainId) {
  return isTokenDetectionSupportedForNetwork(chainId);
}
function removeIpfsProtocolPrefix(ipfsUrl) {
  if (ipfsUrl.startsWith("ipfs://ipfs/")) {
    return ipfsUrl.replace("ipfs://ipfs/", "");
  } else if (ipfsUrl.startsWith("ipfs://")) {
    return ipfsUrl.replace("ipfs://", "");
  }
  throw new Error("this method should not be used with non ipfs urls");
}
async function getIpfsCIDv1AndPath(ipfsUrl) {
  const url = removeIpfsProtocolPrefix(ipfsUrl);
  const index = url.indexOf("/");
  const cid = index !== -1 ? url.substring(0, index) : url;
  const path = index !== -1 ? url.substring(index) : void 0;
  const { CID } = await import("multiformats");
  return {
    cid: CID.parse(cid).toV1().toString(),
    path
  };
}
async function getFormattedIpfsUrl(ipfsGateway, ipfsUrl, subdomainSupported) {
  const { host, protocol, origin } = new URL(addUrlProtocolPrefix(ipfsGateway));
  if (subdomainSupported) {
    const { cid, path } = await getIpfsCIDv1AndPath(ipfsUrl);
    return `${protocol}//${cid}.ipfs.${host}${path ?? ""}`;
  }
  const cidAndPath = removeIpfsProtocolPrefix(ipfsUrl);
  return `${origin}/ipfs/${cidAndPath}`;
}
function addUrlProtocolPrefix(urlString) {
  if (!urlString.match(/(^http:\/\/)|(^https:\/\/)/u)) {
    return `https://${urlString}`;
  }
  return urlString;
}
function ethersBigNumberToBN(bigNumber) {
  return new BN(remove0x(bigNumber.toHexString()), "hex");
}
function divideIntoBatches(values, { batchSize }) {
  const batches = [];
  for (let i = 0; i < values.length; i += batchSize) {
    batches.push(values.slice(i, i + batchSize));
  }
  return batches;
}
async function reduceInBatchesSerially({
  values,
  batchSize,
  eachBatch,
  initialResult
}) {
  const batches = divideIntoBatches(values, { batchSize });
  let workingResult = initialResult;
  for (const [index, batch] of batches.entries()) {
    workingResult = await eachBatch(workingResult, batch, index);
  }
  const finalResult = workingResult;
  return finalResult;
}
async function fetchTokenContractExchangeRates({
  tokenPricesService,
  nativeCurrency,
  tokenAddresses,
  chainId
}) {
  const isChainIdSupported = tokenPricesService.validateChainIdSupported(chainId);
  const isCurrencySupported = tokenPricesService.validateCurrencySupported(nativeCurrency);
  if (!isChainIdSupported || !isCurrencySupported) {
    return {};
  }
  const tokenPricesByTokenAddress = await reduceInBatchesSerially({
    values: [...tokenAddresses].sort(),
    batchSize: TOKEN_PRICES_BATCH_SIZE,
    eachBatch: async (allTokenPricesByTokenAddress, batch) => {
      const tokenPricesByTokenAddressForBatch = await tokenPricesService.fetchTokenPrices({
        tokenAddresses: batch,
        chainId,
        currency: nativeCurrency
      });
      return {
        ...allTokenPricesByTokenAddress,
        ...tokenPricesByTokenAddressForBatch
      };
    },
    initialResult: {}
  });
  return Object.entries(tokenPricesByTokenAddress).reduce(
    (obj, [tokenAddress, tokenPrice]) => {
      return {
        ...obj,
        [toChecksumHexAddress(tokenAddress)]: tokenPrice?.price
      };
    },
    {}
  );
}

export {
  TOKEN_PRICES_BATCH_SIZE,
  compareNftMetadata,
  hasNewCollectionFields,
  formatAggregatorNames,
  formatIconUrlWithProxy,
  SupportedTokenDetectionNetworks,
  isTokenDetectionSupportedForNetwork,
  isTokenListSupportedForNetwork,
  removeIpfsProtocolPrefix,
  getIpfsCIDv1AndPath,
  getFormattedIpfsUrl,
  addUrlProtocolPrefix,
  ethersBigNumberToBN,
  divideIntoBatches,
  reduceInBatchesSerially,
  fetchTokenContractExchangeRates
};
//# sourceMappingURL=chunk-BZEAPSD5.mjs.map