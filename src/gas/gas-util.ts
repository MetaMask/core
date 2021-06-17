import { GasFeeEstimates } from './GasFee.controller';

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
