import type { BigNumber } from '@ethersproject/bignumber';
import {
  convertHexToDecimal,
  isValidHexAddress,
  GANACHE_CHAIN_ID,
} from '@metamask/controller-utils';
import type { PreferencesState } from '@metamask/preferences-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { BN, stripHexPrefix, addHexPrefix } from 'ethereumjs-util';
import { fromWei } from 'ethjs-unit';
import { CID } from 'multiformats/cid';

import type { AccountTrackerState } from './AccountTrackerController';
import type { CurrencyRateState } from './CurrencyRateController';
import type { Nft, NftMetadata } from './NftController';
import type { TokenBalancesState } from './TokenBalancesController';
import type { Token, TokenRatesState } from './TokenRatesController';
import type { TokensState } from './TokensController';

/**
 * Compares nft metadata entries to any nft entry.
 * We need this method when comparing a new fetched nft metadata, in case a entry changed to a defined value,
 * there's a need to update the nft in state.
 *
 * @param newNftMetadata - Nft metadata object.
 * @param nft - Nft object to compare with.
 * @returns Whether there are differences.
 */
export function compareNftMetadata(newNftMetadata: NftMetadata, nft: Nft) {
  const keys: (keyof NftMetadata)[] = [
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

const aggregatorNameByKey: Record<string, string> = {
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
export const formatAggregatorNames = (aggregators: string[]) => {
  return aggregators.map(
    (key) =>
      aggregatorNameByKey[key] ||
      `${key[0].toUpperCase()}${key.substring(1, key.length)}`,
  );
};

/**
 * Format token list assets to use image proxy from Codefi.
 *
 * @param params - Object that contains chainID and tokenAddress.
 * @param params.chainId - ChainID of network in 0x-prefixed hexadecimal format.
 * @param params.tokenAddress - Address of token in mixed or lowercase.
 * @returns Formatted image url
 */
export const formatIconUrlWithProxy = ({
  chainId,
  tokenAddress,
}: {
  chainId: Hex;
  tokenAddress: string;
}) => {
  const chainIdDecimal = convertHexToDecimal(chainId).toString();
  return `https://static.metafi.codefi.network/api/v1/tokenIcons/${chainIdDecimal}/${tokenAddress.toLowerCase()}.png`;
};

/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate.
 */
export function validateTokenToWatch(token: Token) {
  const { address, symbol, decimals } = token;
  if (!address || !symbol || typeof decimals === 'undefined') {
    throw rpcErrors.invalidParams(
      `Must specify address, symbol, and decimals.`,
    );
  }

  if (typeof symbol !== 'string') {
    throw rpcErrors.invalidParams(`Invalid symbol: not a string.`);
  }

  if (symbol.length > 11) {
    throw rpcErrors.invalidParams(
      `Invalid symbol "${symbol}": longer than 11 characters.`,
    );
  }
  const numDecimals = parseInt(decimals as unknown as string, 10);
  if (isNaN(numDecimals) || numDecimals > 36 || numDecimals < 0) {
    throw rpcErrors.invalidParams(
      `Invalid decimals "${decimals}": must be 0 <= 36.`,
    );
  }

  if (!isValidHexAddress(address)) {
    throw rpcErrors.invalidParams(`Invalid address "${address}".`);
  }
}

/**
 * Networks where token detection is supported - Values are in decimal format
 */
export enum SupportedTokenDetectionNetworks {
  mainnet = '0x1', // decimal: 1
  bsc = '0x38', // decimal: 56
  polygon = '0x89', // decimal: 137
  avax = '0xa86a', // decimal: 43114
  aurora = '0x4e454152', // decimal: 1313161554
}

/**
 * Check if token detection is enabled for certain networks.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
export function isTokenDetectionSupportedForNetwork(chainId: Hex): boolean {
  return Object.values<Hex>(SupportedTokenDetectionNetworks).includes(chainId);
}

/**
 * Check if token list polling is enabled for a given network.
 * Currently this method is used to support e2e testing for consumers of this package.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports tokenlists
 */
export function isTokenListSupportedForNetwork(chainId: Hex): boolean {
  return (
    isTokenDetectionSupportedForNetwork(chainId) || chainId === GANACHE_CHAIN_ID
  );
}

/**
 * Removes IPFS protocol prefix from input string.
 *
 * @param ipfsUrl - An IPFS url (e.g. ipfs://{content id})
 * @returns IPFS content identifier and (possibly) path in a string
 * @throws Will throw if the url passed is not IPFS.
 */
export function removeIpfsProtocolPrefix(ipfsUrl: string) {
  if (ipfsUrl.startsWith('ipfs://ipfs/')) {
    return ipfsUrl.replace('ipfs://ipfs/', '');
  } else if (ipfsUrl.startsWith('ipfs://')) {
    return ipfsUrl.replace('ipfs://', '');
  }
  // this method should not be used with non-ipfs urls (i.e. startsWith('ipfs://') === true)
  throw new Error('this method should not be used with non ipfs urls');
}

/**
 * Extracts content identifier and path from an input string.
 *
 * @param ipfsUrl - An IPFS URL minus the IPFS protocol prefix
 * @returns IFPS content identifier (cid) and sub path as string.
 * @throws Will throw if the url passed is not ipfs.
 */
export function getIpfsCIDv1AndPath(ipfsUrl: string): {
  cid: string;
  path?: string;
} {
  const url = removeIpfsProtocolPrefix(ipfsUrl);

  // check if there is a path
  // (CID is everything preceding first forward slash, path is everything after)
  const index = url.indexOf('/');
  const cid = index !== -1 ? url.substring(0, index) : url;
  const path = index !== -1 ? url.substring(index) : undefined;

  // We want to ensure that the CID is v1 (https://docs.ipfs.io/concepts/content-addressing/#identifier-formats)
  // because most cid v0s appear to be incompatible with IPFS subdomains
  return {
    cid: CID.parse(cid).toV1().toString(),
    path,
  };
}

/**
 * Formats URL correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - The users preferred IPFS gateway (full URL or just host).
 * @param ipfsUrl - The IFPS URL pointed at the asset.
 * @param subdomainSupported - Boolean indicating whether the URL should be formatted with subdomains or not.
 * @returns A formatted URL, with the user's preferred IPFS gateway and format (subdomain or not), pointing to an asset hosted on IPFS.
 */
export function getFormattedIpfsUrl(
  ipfsGateway: string,
  ipfsUrl: string,
  subdomainSupported: boolean,
): string {
  const { host, protocol, origin } = new URL(addUrlProtocolPrefix(ipfsGateway));
  if (subdomainSupported) {
    const { cid, path } = getIpfsCIDv1AndPath(ipfsUrl);
    return `${protocol}//${cid}.ipfs.${host}${path ?? ''}`;
  }
  const cidAndPath = removeIpfsProtocolPrefix(ipfsUrl);
  return `${origin}/ipfs/${cidAndPath}`;
}

/**
 * Adds URL protocol prefix to input URL string if missing.
 *
 * @param urlString - An IPFS URL.
 * @returns A URL with a https:// prepended.
 */
export function addUrlProtocolPrefix(urlString: string): string {
  if (!urlString.match(/(^http:\/\/)|(^https:\/\/)/u)) {
    return `https://${urlString}`;
  }
  return urlString;
}

/**
 * Converts an Ethers BigNumber to a BN.
 *
 * @param bigNumber - An Ethers BigNumber instance.
 * @returns A BN object.
 */
export function ethersBigNumberToBN(bigNumber: BigNumber): BN {
  return new BN(stripHexPrefix(bigNumber.toHexString()), 'hex');
}

/**
 * Returns the total fiat value of a given account on a given network,
 * including native currency and token values
 *
 * @param currencyRateControllerState - The CurrencyRateController instance's state
 * @param preferencesControllerState - The PreferencesController instance's state
 * @param accountTrackerControllerState - The AccountTrackerController instance's state
 * @param tokenBalancesControllerState - The TokenBalancesController instance's state
 * @param tokenRatesControllerState - The TokenRatesController instance's state
 * @param tokensControllerState - The TokensController instance's state
 * @returns A number representing the total fiat balance of an account on a network.
 */
export function getTotalFiatAccountBalance(
  currencyRateControllerState: CurrencyRateState,
  preferencesControllerState: PreferencesState,
  accountTrackerControllerState: AccountTrackerState,
  tokenBalancesControllerState: TokenBalancesState,
  tokenRatesControllerState: TokenRatesState,
  tokensControllerState: TokensState,
): number {
  const weiToFiatNumber = (
    wei: number,
    conversionRate: number,
    decimalsToShow = 5,
  ) => {
    const base = Math.pow(10, decimalsToShow);
    const eth = fromWei(wei).toString();
    let value = parseFloat(
      Math.floor((eth * conversionRate * base) / base).toString(),
    );
    value = isNaN(value) ? 0 : value;
    return value;
  };

  const fastSplit = (value: string, divider = '.') => {
    const [from, to] = [value.indexOf(divider), 0];
    return value.substring(from, to) || value;
  };

  const safeNumberToBN = (value: string) => {
    let safeValue = '0';
    try {
      safeValue = fastSplit(value?.toString());
    } catch {
      // Simple return the original value
    }
    return new BN(safeValue);
  };

  const fromTokenMinimalUnit = (minimalInput: number, decimals: number) => {
    const minimalInputStr = addHexPrefix(Number(minimalInput).toString(16));
    let minimal = safeNumberToBN(minimalInputStr);
    const negative = minimal.lt(new BN(0));
    const base = new BN(Math.pow(10, decimals).toString());

    if (negative) {
      minimal = minimal.mul(negative);
    }
    let fraction = minimal.mod(base).toString(10);
    while (fraction.length < decimals) {
      fraction = `0${fraction}`;
    }
    fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/u)[1];
    const whole = minimal.div(base).toString(10);
    let value = String(whole) + (fraction === '0' ? '' : `.${fraction}`);
    if (negative) {
      value = `-${value}`;
    }
    return value;
  };

  const renderFromTokenMinimalUnit = (
    tokenValue: number,
    decimals: number,
    decimalsToShow = 5,
  ) => {
    const minimalUnit = fromTokenMinimalUnit(tokenValue || 0, decimals);
    const minimalUnitNumber = parseFloat(minimalUnit);
    let renderMinimalUnit;
    if (minimalUnitNumber < 0.00001 && minimalUnitNumber > 0) {
      renderMinimalUnit = '< 0.00001';
    } else {
      const base = Math.pow(10, decimalsToShow);
      renderMinimalUnit = (
        Math.round(minimalUnitNumber * base) / base
      ).toString();
    }
    return renderMinimalUnit;
  };

  const balanceToFiatNumber = (
    balance: number,
    conversionRate: number,
    exchangeRate: number,
    decimalsToShow = 5,
  ) => {
    const base = Math.pow(10, decimalsToShow);
    let fiatFixed = parseFloat(
      // Cast as string to avoid TS error
      String(Math.floor(balance * conversionRate * exchangeRate * base) / base),
    );
    fiatFixed = isNaN(fiatFixed) ? 0.0 : fiatFixed;
    return fiatFixed;
  };

  const { selectedAddress } = preferencesControllerState;
  const { currentCurrency, conversionRate } = currencyRateControllerState;
  const finalConversionRate = conversionRate ?? 0;
  const { accounts } = accountTrackerControllerState;
  const { tokens } = tokensControllerState;

  const decimalsToShow = currentCurrency === 'usd' ? 2 : undefined;
  let ethFiat = 0;
  let tokenFiat = 0;

  // Native currency
  if (accounts[selectedAddress]) {
    ethFiat = weiToFiatNumber(
      Number(accounts[selectedAddress].balance), // Is "Number() correct?
      finalConversionRate,
      decimalsToShow,
    );
  }

  // Custom token values
  if (tokens.length > 0) {
    const { contractBalances: tokenBalances } = tokenBalancesControllerState;
    const { contractExchangeRates: tokenExchangeRates } =
      tokenRatesControllerState;
    tokens.forEach(
      (item: {
        address: string;
        balance: string | undefined;
        decimals: number;
      }) => {
        const exchangeRate =
          item.address in tokenExchangeRates
            ? tokenExchangeRates[item.address]
            : undefined;
        const tokenBalance =
          item.balance ||
          (item.address in tokenBalances
            ? renderFromTokenMinimalUnit(
                tokenBalances[item.address],
                item.decimals,
              )
            : undefined);
        const tokenBalanceFiat = balanceToFiatNumber(
          tokenBalance,
          finalConversionRate,
          exchangeRate,
          decimalsToShow,
        );
        tokenFiat += tokenBalanceFiat;
      },
    );
  }

  const total = ethFiat + tokenFiat;
  return total;
}
