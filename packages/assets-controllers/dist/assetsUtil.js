"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ethersBigNumberToBN = exports.addUrlProtocolPrefix = exports.getFormattedIpfsUrl = exports.getIpfsCIDv1AndPath = exports.removeIpfsProtocolPrefix = exports.isTokenListSupportedForNetwork = exports.isTokenDetectionSupportedForNetwork = exports.SupportedTokenDetectionNetworks = exports.validateTokenToWatch = exports.formatIconUrlWithProxy = exports.formatAggregatorNames = exports.compareNftMetadata = void 0;
const eth_rpc_errors_1 = require("eth-rpc-errors");
const cid_1 = require("multiformats/cid");
const controller_utils_1 = require("@metamask/controller-utils");
const ethereumjs_util_1 = require("ethereumjs-util");
/**
 * Compares nft metadata entries to any nft entry.
 * We need this method when comparing a new fetched nft metadata, in case a entry changed to a defined value,
 * there's a need to update the nft in state.
 *
 * @param newNftMetadata - Nft metadata object.
 * @param nft - Nft object to compare with.
 * @returns Whether there are differences.
 */
function compareNftMetadata(newNftMetadata, nft) {
    const keys = [
        'image',
        'backgroundColor',
        'imagePreview',
        'imageThumbnail',
        'imageOriginal',
        'animation',
        'animationOriginal',
        'externalLink',
    ];
    const differentValues = keys.reduce((value, key) => {
        if (newNftMetadata[key] && newNftMetadata[key] !== nft[key]) {
            return value + 1;
        }
        return value;
    }, 0);
    return differentValues > 0;
}
exports.compareNftMetadata = compareNftMetadata;
const aggregatorNameByKey = {
    aave: 'Aave',
    bancor: 'Bancor',
    cmc: 'CMC',
    cryptocom: 'Crypto.com',
    coinGecko: 'CoinGecko',
    oneInch: '1inch',
    paraswap: 'Paraswap',
    pmm: 'PMM',
    zapper: 'Zapper',
    zerion: 'Zerion',
    zeroEx: '0x',
    synthetix: 'Synthetix',
    yearn: 'Yearn',
    apeswap: 'ApeSwap',
    binanceDex: 'BinanceDex',
    pancakeTop100: 'PancakeTop100',
    pancakeExtended: 'PancakeExtended',
    balancer: 'Balancer',
    quickswap: 'QuickSwap',
    matcha: 'Matcha',
    pangolinDex: 'PangolinDex',
    pangolinDexStableCoin: 'PangolinDexStableCoin',
    pangolinDexAvaxBridge: 'PangolinDexAvaxBridge',
    traderJoe: 'TraderJoe',
    airswapLight: 'AirswapLight',
    kleros: 'Kleros',
};
/**
 * Formats aggregator names to presentable format.
 *
 * @param aggregators - List of token list names in camelcase.
 * @returns Formatted aggregator names.
 */
const formatAggregatorNames = (aggregators) => {
    return aggregators.map((key) => aggregatorNameByKey[key] ||
        `${key[0].toUpperCase()}${key.substring(1, key.length)}`);
};
exports.formatAggregatorNames = formatAggregatorNames;
/**
 * Format token list assets to use image proxy from Codefi.
 *
 * @param params - Object that contains chainID and tokenAddress.
 * @param params.chainId - ChainID of network in decimal or hexadecimal format.
 * @param params.tokenAddress - Address of token in mixed or lowercase.
 * @returns Formatted image url
 */
const formatIconUrlWithProxy = ({ chainId, tokenAddress, }) => {
    const chainIdDecimal = (0, controller_utils_1.convertHexToDecimal)(chainId).toString();
    return `https://static.metaswap.codefi.network/api/v1/tokenIcons/${chainIdDecimal}/${tokenAddress.toLowerCase()}.png`;
};
exports.formatIconUrlWithProxy = formatIconUrlWithProxy;
/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate.
 */
function validateTokenToWatch(token) {
    const { address, symbol, decimals } = token;
    if (!address || !symbol || typeof decimals === 'undefined') {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Must specify address, symbol, and decimals.`);
    }
    if (typeof symbol !== 'string') {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid symbol: not a string.`);
    }
    if (symbol.length > 11) {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid symbol "${symbol}": longer than 11 characters.`);
    }
    const numDecimals = parseInt(decimals, 10);
    if (isNaN(numDecimals) || numDecimals > 36 || numDecimals < 0) {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid decimals "${decimals}": must be 0 <= 36.`);
    }
    if (!(0, controller_utils_1.isValidHexAddress)(address)) {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid address "${address}".`);
    }
}
exports.validateTokenToWatch = validateTokenToWatch;
/**
 * Networks where token detection is supported - Values are in decimal format
 */
var SupportedTokenDetectionNetworks;
(function (SupportedTokenDetectionNetworks) {
    SupportedTokenDetectionNetworks["mainnet"] = "1";
    SupportedTokenDetectionNetworks["bsc"] = "56";
    SupportedTokenDetectionNetworks["polygon"] = "137";
    SupportedTokenDetectionNetworks["avax"] = "43114";
})(SupportedTokenDetectionNetworks = exports.SupportedTokenDetectionNetworks || (exports.SupportedTokenDetectionNetworks = {}));
/**
 * Check if token detection is enabled for certain networks.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
function isTokenDetectionSupportedForNetwork(chainId) {
    return Object.values(SupportedTokenDetectionNetworks).includes(chainId);
}
exports.isTokenDetectionSupportedForNetwork = isTokenDetectionSupportedForNetwork;
/**
 * Check if token list polling is enabled for a given network.
 * Currently this method is used to support e2e testing for consumers of this package.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports tokenlists
 */
function isTokenListSupportedForNetwork(chainId) {
    const chainIdDecimal = (0, controller_utils_1.convertHexToDecimal)(chainId).toString();
    return (isTokenDetectionSupportedForNetwork(chainIdDecimal) ||
        chainIdDecimal === controller_utils_1.GANACHE_CHAIN_ID);
}
exports.isTokenListSupportedForNetwork = isTokenListSupportedForNetwork;
/**
 * Removes IPFS protocol prefix from input string.
 *
 * @param ipfsUrl - An IPFS url (e.g. ipfs://{content id})
 * @returns IPFS content identifier and (possibly) path in a string
 * @throws Will throw if the url passed is not IPFS.
 */
function removeIpfsProtocolPrefix(ipfsUrl) {
    if (ipfsUrl.startsWith('ipfs://ipfs/')) {
        return ipfsUrl.replace('ipfs://ipfs/', '');
    }
    else if (ipfsUrl.startsWith('ipfs://')) {
        return ipfsUrl.replace('ipfs://', '');
    }
    // this method should not be used with non-ipfs urls (i.e. startsWith('ipfs://') === true)
    throw new Error('this method should not be used with non ipfs urls');
}
exports.removeIpfsProtocolPrefix = removeIpfsProtocolPrefix;
/**
 * Extracts content identifier and path from an input string.
 *
 * @param ipfsUrl - An IPFS URL minus the IPFS protocol prefix
 * @returns IFPS content identifier (cid) and sub path as string.
 * @throws Will throw if the url passed is not ipfs.
 */
function getIpfsCIDv1AndPath(ipfsUrl) {
    const url = removeIpfsProtocolPrefix(ipfsUrl);
    // check if there is a path
    // (CID is everything preceding first forward slash, path is everything after)
    const index = url.indexOf('/');
    const cid = index !== -1 ? url.substring(0, index) : url;
    const path = index !== -1 ? url.substring(index) : undefined;
    // We want to ensure that the CID is v1 (https://docs.ipfs.io/concepts/content-addressing/#identifier-formats)
    // because most cid v0s appear to be incompatible with IPFS subdomains
    return {
        cid: cid_1.CID.parse(cid).toV1().toString(),
        path,
    };
}
exports.getIpfsCIDv1AndPath = getIpfsCIDv1AndPath;
/**
 * Formats URL correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - The users preferred IPFS gateway (full URL or just host).
 * @param ipfsUrl - The IFPS URL pointed at the asset.
 * @param subdomainSupported - Boolean indicating whether the URL should be formatted with subdomains or not.
 * @returns A formatted URL, with the user's preferred IPFS gateway and format (subdomain or not), pointing to an asset hosted on IPFS.
 */
function getFormattedIpfsUrl(ipfsGateway, ipfsUrl, subdomainSupported) {
    const { host, protocol, origin } = new URL(addUrlProtocolPrefix(ipfsGateway));
    if (subdomainSupported) {
        const { cid, path } = getIpfsCIDv1AndPath(ipfsUrl);
        return `${protocol}//${cid}.ipfs.${host}${path !== null && path !== void 0 ? path : ''}`;
    }
    const cidAndPath = removeIpfsProtocolPrefix(ipfsUrl);
    return `${origin}/ipfs/${cidAndPath}`;
}
exports.getFormattedIpfsUrl = getFormattedIpfsUrl;
/**
 * Adds URL protocol prefix to input URL string if missing.
 *
 * @param urlString - An IPFS URL.
 * @returns A URL with a https:// prepended.
 */
function addUrlProtocolPrefix(urlString) {
    if (!urlString.match(/(^http:\/\/)|(^https:\/\/)/u)) {
        return `https://${urlString}`;
    }
    return urlString;
}
exports.addUrlProtocolPrefix = addUrlProtocolPrefix;
/**
 * Converts an Ethers BigNumber to a BN.
 *
 * @param bigNumber - An Ethers BigNumber instance.
 * @returns A BN object.
 */
function ethersBigNumberToBN(bigNumber) {
    return new ethereumjs_util_1.BN((0, ethereumjs_util_1.stripHexPrefix)(bigNumber.toHexString()), 'hex');
}
exports.ethersBigNumberToBN = ethersBigNumberToBN;
//# sourceMappingURL=assetsUtil.js.map