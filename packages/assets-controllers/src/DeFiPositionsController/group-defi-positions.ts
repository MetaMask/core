import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { upperFirst, camelCase } from 'lodash';

import type {
  DefiPositionResponse,
  PositionType,
  ProtocolToken,
  Underlying,
  Balance,
} from './fetch-positions';

export type GroupedDeFiPositions = {
  aggregatedMarketValue: number;
  protocols: {
    [protocolId: string]: {
      protocolDetails: { name: string; iconUrl: string };
      aggregatedMarketValue: number;
      positionTypes: {
        [key in PositionType]?: {
          aggregatedMarketValue: number;
          positions: ProtocolTokenWithMarketValue[][];
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

/**
 *
 * @param defiPositionsResponse - The response from the defi positions API
 * @returns The grouped positions that get assigned to the state
 */
export function groupDeFiPositions(
  defiPositionsResponse: DefiPositionResponse[],
): {
  [key: Hex]: GroupedDeFiPositions;
} {
  const groupedDeFiPositions: { [key: Hex]: GroupedDeFiPositions } = {};

  for (const position of defiPositionsResponse) {
    if (!position.success) {
      continue;
    }

    const { chainId, protocolId, iconUrl, positionType } = position;

    const chain = toHex(chainId);

    if (!groupedDeFiPositions[chain]) {
      groupedDeFiPositions[chain] = {
        aggregatedMarketValue: 0,
        protocols: {},
      };
    }

    const chainData = groupedDeFiPositions[chain];

    if (!chainData.protocols[protocolId]) {
      chainData.protocols[protocolId] = {
        protocolDetails: {
          name: upperFirst(camelCase(protocolId)),
          iconUrl,
        },
        aggregatedMarketValue: 0,
        positionTypes: {},
      };
    }

    const protocolData = chainData.protocols[protocolId];

    let positionTypeData = protocolData.positionTypes[positionType];
    if (!positionTypeData) {
      positionTypeData = {
        aggregatedMarketValue: 0,
        positions: [],
      };
      protocolData.positionTypes[positionType] = positionTypeData;
    }

    for (const protocolToken of position.tokens) {
      const token = processToken(protocolToken) as ProtocolTokenWithMarketValue;

      // If groupPositions is true, we group all positions of the same type
      if (position.metadata?.groupPositions) {
        if (positionTypeData.positions.length === 0) {
          positionTypeData.positions.push([token]);
        } else {
          positionTypeData.positions[0].push(token);
        }
      } else {
        positionTypeData.positions.push([token]);
      }

      if (token.marketValue) {
        const multiplier = position.positionType === 'borrow' ? -1 : 1;

        positionTypeData.aggregatedMarketValue += token.marketValue;
        protocolData.aggregatedMarketValue += token.marketValue * multiplier;
        chainData.aggregatedMarketValue += token.marketValue * multiplier;
      }
    }
  }

  return groupedDeFiPositions;
}

/**
 *
 * @param tokenBalance - The token balance that is going to be processed
 * @returns The processed token balance
 */
function processToken<T extends Balance>(
  tokenBalance: T,
): T & {
  marketValue?: number;
  tokens?: UnderlyingWithMarketValue[];
} {
  if (!tokenBalance.tokens) {
    return {
      ...tokenBalance,
      marketValue: tokenBalance.price
        ? tokenBalance.balance * tokenBalance.price
        : undefined,
    };
  }

  const processedTokens = tokenBalance.tokens.map((t) => {
    const { tokens, ...tokenWithoutUnderlyings } = processToken(t);

    return tokenWithoutUnderlyings;
  });

  const marketValue = processedTokens.reduce(
    (acc, t) =>
      acc === undefined || t.marketValue === undefined
        ? undefined
        : acc + t.marketValue,
    0 as number | undefined,
  );

  return {
    ...tokenBalance,
    marketValue,
    tokens: processedTokens,
  };
}
