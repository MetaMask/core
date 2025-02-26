// TODO: We should make this type to benefit the UI the most
export type GroupedPositionsResponse = {
  protocolId: string;
  positions: {
    protocolDetails: ProtocolDetails;
    protocolPosition: ProtocolPosition;
    marketValue: number;
  }[];
  aggregatedValues: Partial<Record<PositionType, number>>;
};

export type DefiPositionResponse = AdapterResponse<{
  tokens: ProtocolPosition[];
}>;

type ProtocolDetails = {
  chainId: number;
  protocolId: string;
  productId: string;
  name: string;
  description: string;
  iconUrl: string;
  siteUrl: string;
  positionType: PositionType;
};

export type PositionType = 'supply' | 'borrow' | 'stake' | 'reward';

type AdapterErrorResponse = {
  error: {
    message: string;
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

type TokenBalanceWithUnderlyings = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balanceRaw: string;
  balance: number;
  price?: number; // TODO: Confirm this is the case
  iconUrl: string;
  tokens?: Underlying[];
};

type ProtocolPosition = TokenBalanceWithUnderlyings & {
  type: 'protocol';
  tokenId?: string;
};

export type Underlying = TokenBalanceWithUnderlyings & {
  type: 'underlying' | 'underlying-claimable';
};
