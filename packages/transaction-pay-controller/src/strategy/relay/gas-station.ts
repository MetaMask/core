import { toHex } from '@metamask/controller-utils';
import type { GasFeeToken } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type {
  Amount,
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types';
import {
  getEIP7702SupportedChains,
  getFeatureFlags,
} from '../../utils/feature-flags';
import { calculateGasFeeTokenCost } from '../../utils/gas';

const log = createModuleLogger(projectLogger, 'relay-gas-station');

type GasStationCostParams = {
  firstStepData: {
    data: Hex;
    to: Hex;
    value?: string;
  };
  messenger: TransactionPayControllerMessenger;
  request: Pick<QuoteRequest, 'from' | 'sourceChainId' | 'sourceTokenAddress'>;
  totalGasEstimate: number;
  totalItemCount: number;
};

export type GasStationEligibility = {
  chainSupportsGasStation: boolean;
  isDisabledChain: boolean;
  isEligible: boolean;
};

export function getGasStationEligibility(
  messenger: TransactionPayControllerMessenger,
  sourceChainId: QuoteRequest['sourceChainId'],
): GasStationEligibility {
  const { relayDisabledGasStationChains } = getFeatureFlags(messenger);
  const supportedChains = getEIP7702SupportedChains(messenger);
  const chainSupportsGasStation = supportedChains.some(
    (supportedChainId) =>
      supportedChainId.toLowerCase() === sourceChainId.toLowerCase(),
  );

  const isDisabledChain = relayDisabledGasStationChains.includes(sourceChainId);

  return {
    chainSupportsGasStation,
    isDisabledChain,
    isEligible: !isDisabledChain && chainSupportsGasStation,
  };
}

export async function getGasStationCostInSourceTokenRaw({
  firstStepData,
  messenger,
  request,
  totalGasEstimate,
  totalItemCount,
}: GasStationCostParams): Promise<Amount | undefined> {
  const { data, to, value } = firstStepData;
  const { from, sourceChainId, sourceTokenAddress } = request;

  let gasFeeTokens: GasFeeToken[];

  try {
    gasFeeTokens = await messenger.call(
      'TransactionController:getGasFeeTokens',
      {
        chainId: sourceChainId,
        data,
        from,
        to,
        value: toHex(value ?? '0'),
      },
    );
  } catch (error) {
    log('Failed to estimate gas fee tokens', {
      error,
      sourceChainId,
    });
    return undefined;
  }

  const gasFeeToken = gasFeeTokens.find(
    (singleGasFeeToken) =>
      singleGasFeeToken.tokenAddress.toLowerCase() ===
      sourceTokenAddress.toLowerCase(),
  );

  if (!gasFeeToken) {
    log('No matching source token in gas fee token estimate', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  const gasFeeTokenWithNormalizedAmount = {
    ...gasFeeToken,
    amount: toHex(
      getNormalizedGasFeeTokenAmount({
        gasFeeToken,
        totalGasEstimate,
        totalItemCount,
      }),
    ),
  };

  const gasFeeTokenCost = calculateGasFeeTokenCost({
    chainId: sourceChainId,
    gasFeeToken: gasFeeTokenWithNormalizedAmount,
    messenger,
  });

  if (!gasFeeTokenCost) {
    log('Unable to calculate gas fee token cost using fiat rates', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  log('Estimated gas station cost for source token', {
    amount: gasFeeTokenCost.raw,
    sourceTokenAddress,
    sourceChainId,
  });

  return gasFeeTokenCost;
}

function getNormalizedGasFeeTokenAmount({
  gasFeeToken,
  totalGasEstimate,
  totalItemCount,
}: {
  gasFeeToken: GasFeeToken;
  totalGasEstimate: number;
  totalItemCount: number;
}): string {
  let amount = new BigNumber(gasFeeToken.amount);

  if (totalItemCount > 1) {
    const gas = new BigNumber(gasFeeToken.gas);
    const gasFeeAmount = new BigNumber(gasFeeToken.amount);

    if (totalGasEstimate > 0 && gas.isGreaterThan(0)) {
      const gasRate = gasFeeAmount.dividedBy(gas);
      amount = gasRate.multipliedBy(totalGasEstimate);
    }
  }

  return amount.integerValue(BigNumber.ROUND_CEIL).toFixed(0);
}
