import { BN } from 'ethereumjs-util';
import { query } from '../util';
import {
  GasFeeEstimates,
  LegacyGasPriceEstimate,
  EstimatedGasFeeTimeBounds,
  unknownString,
} from './GasFeeController';

// import { handleFetch } from '../util';

// const GAS_FEE_API = 'https://gas-fee-api-goes-here';

const mockEIP1559ApiResponses = [
  {
    low: {
      minWaitTimeEstimate: 120000,
      maxWaitTimeEstimate: 300000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '35',
    },
    medium: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 30000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '40',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '60',
    },
    estimatedBaseFee: '30',
  },
  {
    low: {
      minWaitTimeEstimate: 180000,
      maxWaitTimeEstimate: 360000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '40',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '45',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '65',
    },
    estimatedBaseFee: '32',
  },
  {
    low: {
      minWaitTimeEstimate: 60000,
      maxWaitTimeEstimate: 240000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '42',
    },
    medium: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 30000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '47',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '4',
      suggestedMaxFeePerGas: '67',
    },
    estimatedBaseFee: '35',
  },
  {
    low: {
      minWaitTimeEstimate: 180000,
      maxWaitTimeEstimate: 300000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '53',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '7',
      suggestedMaxFeePerGas: '70',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '10',
      suggestedMaxFeePerGas: '100',
    },
    estimatedBaseFee: '50',
  },
  {
    low: {
      minWaitTimeEstimate: 120000,
      maxWaitTimeEstimate: 360000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '35',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '40',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '4',
      suggestedMaxFeePerGas: '60',
    },
    estimatedBaseFee: '30',
  },
  {
    low: {
      minWaitTimeEstimate: 60000,
      maxWaitTimeEstimate: 600000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '35',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '1.8',
      suggestedMaxFeePerGas: '38',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '50',
    },
    estimatedBaseFee: '28',
  },
];

const getMockApiResponse = (): GasFeeEstimates => {
  return mockEIP1559ApiResponses[Math.floor(Math.random() * 6)];
};

export function fetchGasEstimates(): Promise<GasFeeEstimates> {
  // return handleFetch(GAS_FEE_API)
  return new Promise((resolve) => {
    resolve(getMockApiResponse());
  });
}

export async function fetchLegacyGasPriceEstimate(
  ethQuery: any,
): Promise<LegacyGasPriceEstimate> {
  const gasPrice = await query(ethQuery, 'gasPrice');
  return {
    gasPrice,
  };
}

function gweiHexToWEIBN(n: any) {
  const BN_1000 = new BN(1000, 10);
  return new BN(n, 16).mul(BN_1000);
}

export function calculateTimeEstimate(
  maxPriorityFeePerGas: string,
  maxFeePerGas: string,
  gasFeeEstimates: GasFeeEstimates,
): EstimatedGasFeeTimeBounds {
  const { low, medium, high, estimatedBaseFee } = gasFeeEstimates;

  const maxPriorityFeePerGasInWEI = gweiHexToWEIBN(maxPriorityFeePerGas);
  const maxFeePerGasInWEI = gweiHexToWEIBN(maxFeePerGas);
  const estimatedBaseFeeInWEI = gweiHexToWEIBN(estimatedBaseFee);

  const effectiveMaxPriorityFee = BN.min(
    maxPriorityFeePerGasInWEI,
    maxFeePerGasInWEI.sub(estimatedBaseFeeInWEI),
  );

  const lowMaxPriorityFeeInWEI = gweiHexToWEIBN(
    low.suggestedMaxPriorityFeePerGas,
  );
  const mediumMaxPriorityFeeInWEI = gweiHexToWEIBN(
    medium.suggestedMaxPriorityFeePerGas,
  );
  const highMaxPriorityFeeInWEI = gweiHexToWEIBN(
    high.suggestedMaxPriorityFeePerGas,
  );

  let lowerTimeBound;
  let upperTimeBound;

  if (effectiveMaxPriorityFee.lt(lowMaxPriorityFeeInWEI)) {
    lowerTimeBound = null;
    upperTimeBound = 'unknown' as unknownString;
  } else if (
    effectiveMaxPriorityFee.gte(lowMaxPriorityFeeInWEI) &&
    effectiveMaxPriorityFee.lt(mediumMaxPriorityFeeInWEI)
  ) {
    lowerTimeBound = low.minWaitTimeEstimate;
    upperTimeBound = low.maxWaitTimeEstimate;
  } else if (
    effectiveMaxPriorityFee.gte(mediumMaxPriorityFeeInWEI) &&
    effectiveMaxPriorityFee.lt(highMaxPriorityFeeInWEI)
  ) {
    lowerTimeBound = medium.minWaitTimeEstimate;
    upperTimeBound = medium.maxWaitTimeEstimate;
  } else if (effectiveMaxPriorityFee.eq(highMaxPriorityFeeInWEI)) {
    lowerTimeBound = high.minWaitTimeEstimate;
    upperTimeBound = high.maxWaitTimeEstimate;
  } else {
    lowerTimeBound = 0;
    upperTimeBound = high.maxWaitTimeEstimate;
  }

  return {
    lowerTimeBound,
    upperTimeBound,
  };
}
