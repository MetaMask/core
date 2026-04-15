import type { ChainId, TokenListEntry } from '../types';

const TOKENS_API_BASE_URL = 'https://tokens.api.cx.metamask.io/v3/chains';

/** How many tokens to request from the API per chain. */
const TOKENS_API_FIRST = 25;

/** Shape of a single item in the Tokens API response `data` array. */
type ApiTokenData = {
  assetId: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  occurrences?: number;
};

export type TokensApiClientConfig = {
  /** Fetch function (defaults to globalThis.fetch). */
  fetch?: typeof globalThis.fetch;
};

/**
 * Client for the MetaMask Tokens API.
 * Fetches the top ERC-20 tokens for a given chain (occurrenceFloor=3, first=25).
 */
export class TokensApiClient {
  readonly #fetch: typeof globalThis.fetch;

  constructor(config?: TokensApiClientConfig) {
    this.#fetch = config?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Fetch the list of top ERC-20 tokens for a chain from the Tokens API.
   * Only `erc20` assets are returned; native (`slip44`) entries are skipped.
   *
   * @param hexChainId - Chain ID in hex format (e.g. `'0x1'` for Ethereum mainnet).
   * @returns Array of token list entries with address and metadata.
   * @throws If the API responds with a non-2xx status.
   */
  async fetchTokenList(hexChainId: ChainId): Promise<TokenListEntry[]> {
    const chainIdDecimal = parseInt(hexChainId, 16);
    const caipChainId = `eip155:${chainIdDecimal}`;

    const url =
      `${TOKENS_API_BASE_URL}/${caipChainId}/assets` +
      `?first=${TOKENS_API_FIRST}` +
      `&includeOccurrences=true` +
      `&includeMetadata=true` +
      `&occurrenceFloor=3` +
      `&includeRwaData=true` +
      `&excludeDescription=true`;

    const response = await this.#fetch(url);
    if (!response.ok) {
      throw new Error(
        `Tokens API responded with ${response.status} for ${caipChainId}`,
      );
    }

    const { data } = (await response.json()) as { data: ApiTokenData[] };

    return data
      .filter((item) => item.assetId.includes('/erc20:'))
      .map((item) => {
        const address = item.assetId.split('/erc20:')[1];
        return {
          address,
          symbol: item.symbol ?? '',
          name: item.name ?? '',
          decimals: item.decimals ?? 18,
          occurrences: item.occurrences,
        };
      });
  }
}
