export type DefiPositionResponse = AdapterResponse<{
  tokens: ProtocolToken[];
}>;

type ProtocolDetails = {
  chainId: number;
  protocolId: string;
  productId: string;
  protocolDisplayName: string;
  name: string;
  description: string;
  iconUrl: string;
  siteUrl: string;
  positionType: PositionType;
  metadata?: {
    groupPositions?: boolean;
  };
};

type AdapterResponse<ProtocolResponse> =
  | (ProtocolDetails & {
      chainName: string;
    } & (
        | (ProtocolResponse & { success: true })
        | (AdapterErrorResponse & { success: false })
      ))
  | (AdapterErrorResponse & { success: false });

type AdapterErrorResponse = {
  error: {
    message: string;
  };
};

export type PositionType = 'supply' | 'borrow' | 'stake' | 'reward';

export type ProtocolToken = Balance & {
  type: 'protocol';
  tokenId?: string;
};

export type Underlying = Balance & {
  type: 'underlying' | 'underlying-claimable';
  iconUrl: string;
};

export type Balance = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balanceRaw: string;
  balance: number;
  price?: number;
  tokens?: Underlying[];
};

// TODO: Update with prod API URL when available
export const DEFI_POSITIONS_API_URL =
  'https://defiadapters.dev-api.cx.metamask.io';

/**
 * Builds a function that fetches DeFi positions for a given account address
 *
 * @returns A function that fetches DeFi positions for a given account address
 */
export function buildPositionFetcher() {
  return async (accountAddress: string): Promise<DefiPositionResponse[]> => {
    const defiPositionsResponse = await fetch(
      `${DEFI_POSITIONS_API_URL}/positions/${accountAddress}`,
    );

    if (defiPositionsResponse.status !== 200) {
      throw new Error(
        `Unable to fetch defi positions - HTTP ${defiPositionsResponse.status}`,
      );
    }

    return (await defiPositionsResponse.json()).data;
  };
}
