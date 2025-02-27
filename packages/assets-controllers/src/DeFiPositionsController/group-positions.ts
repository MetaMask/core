import { toHex } from '@metamask/controller-utils';
import { Hex } from '@metamask/utils';
import {
  DefiPositionResponse,
  PositionType,
  ProtocolToken,
  Underlying,
} from './fetch-positions';
import { upperFirst, camelCase } from 'lodash';

// TODO: We should make this type to benefit the UI the most
export type GroupedPositions = {
  aggregatedMarketValue: number;
  protocols: {
    [protocolId: string]: {
      protocolDetails: { name: string; iconUrl: string };
      aggregatedMarketValue: number;
      positionTypes: {
        [key in PositionType]?: {
          aggregatedMarketValue: number;
          positions: (ProtocolToken & {
            marketValue: number;
          })[];
        };
      };
    };
  };
};

export function groupPositions(defiPositionsResponse: DefiPositionResponse[]): {
  [key: Hex]: GroupedPositions;
} {
  const groupedPositions: { [key: Hex]: GroupedPositions } = {};

  for (const position of defiPositionsResponse) {
    if (!position.success) {
      continue;
    }

    const { protocolData, positionTypeData } = getProtocolData(
      groupedPositions,
      position,
    );

    for (const token of position.tokens) {
      const marketValue =
        extractTokenMarketValue(token) *
        (position.positionType === 'borrow' ? -1 : 1);

      positionTypeData.positions.push({
        ...token,
        marketValue,
      });

      positionTypeData.aggregatedMarketValue += marketValue;
      protocolData.aggregatedMarketValue += marketValue;
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
    protocolData,
    positionTypeData: protocolData.positionTypes[positionType],
  };
}

function extractTokenMarketValue(token: {
  balance: number;
  price?: number;
  tokens?: Underlying[];
}): number {
  if (!token.tokens) {
    return token.balance * (token.price || 0);
  }

  return token.tokens.reduce(
    (acc, token) => acc + extractTokenMarketValue(token),
    0,
  );
}
