import { toHex } from '@metamask/controller-utils';
import { Hex } from '@metamask/utils';
import {
  DefiPositionResponse,
  PositionType,
  ProtocolToken,
  Underlying,
  Balance,
} from './fetch-positions';
import { upperFirst, camelCase } from 'lodash';

export type GroupedPositions = {
  aggregatedMarketValue: number;
  protocols: {
    [protocolId: string]: {
      protocolDetails: { name: string; iconUrl: string };
      aggregatedMarketValue: number;
      positionTypes: {
        [key in PositionType]?: {
          aggregatedMarketValue: number;
          positions: ProtocolTokenWithMarketValue[];
        };
      };
    };
  };
};

export type ProtocolTokenWithMarketValue = Omit<ProtocolToken, 'tokens'> & {
  marketValue?: number;
  tokens: UnderlyingWithMarketValue[];
};

export type UnderlyingWithMarketValue = Omit<Underlying, 'tokens'> & {
  marketValue?: number;
};

export function groupPositions(defiPositionsResponse: DefiPositionResponse[]): {
  [key: Hex]: GroupedPositions;
} {
  const groupedPositions: { [key: Hex]: GroupedPositions } = {};

  for (const position of defiPositionsResponse) {
    if (!position.success) {
      continue;
    }

    const { chainData, protocolData, positionTypeData } = getProtocolData(
      groupedPositions,
      position,
    );

    for (const protocolToken of position.tokens) {
      const token = processToken(protocolToken) as ProtocolTokenWithMarketValue;

      positionTypeData.positions.push(token);

      if (token.marketValue) {
        const multiplier = position.positionType === 'borrow' ? -1 : 1;

        positionTypeData.aggregatedMarketValue += token.marketValue;
        protocolData.aggregatedMarketValue += token.marketValue * multiplier;
        chainData.aggregatedMarketValue += token.marketValue * multiplier;
      }
    }
  }

  return groupedPositions;
}

function getProtocolData(
  data: { [key: Hex]: GroupedPositions },
  position: DefiPositionResponse & { success: true },
) {
  const { chainId, protocolId, iconUrl, positionType } = position;

  const chain = toHex(chainId);

  if (!data[chain]) {
    data[chain] = {
      aggregatedMarketValue: 0,
      protocols: {},
    };
  }

  const chainData = data[chain];

  if (!chainData.protocols[protocolId]) {
    chainData.protocols[protocolId] = {
      protocolDetails: {
        // TODO: Prepare better source for protocol name
        name: upperFirst(camelCase(protocolId)),
        // TODO: Picking icon url from the first product position might not be consistent
        iconUrl,
      },
      aggregatedMarketValue: 0,
      positionTypes: {},
    };
  }

  const protocolData = chainData.protocols[protocolId];

  if (!protocolData.positionTypes[positionType]) {
    protocolData.positionTypes[positionType] = {
      aggregatedMarketValue: 0,
      positions: [],
    };
  }

  return {
    chainData,
    protocolData,
    positionTypeData: protocolData.positionTypes[positionType]!,
  };
}

function processToken<T extends Balance>(
  token: T,
): T & {
  marketValue?: number;
  tokens?: UnderlyingWithMarketValue[];
} {
  if (!token.tokens) {
    return {
      ...token,
      marketValue: token.price ? token.balance * token.price : undefined,
      tokens: undefined,
    };
  }

  const processedTokens = token.tokens.map((t) => ({
    ...processToken(t),
    tokens: undefined,
  }));

  const marketValue = processedTokens.reduce(
    (acc, t) =>
      acc === undefined || t.marketValue === undefined
        ? undefined
        : acc + t.marketValue,
    0 as number | undefined,
  );

  return {
    ...token,
    marketValue,
    tokens: processedTokens,
  };
}
