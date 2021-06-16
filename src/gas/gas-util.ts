import { GasFeeEstimates } from './GasFee.controller';

// import { handleFetch } from '../util';

// const GAS_FEE_API = 'https://gas-fee-api-goes-here';

const mockApiResponses = [
  {
    low: {
      minWaitTimeEstimate: 120000,
      maxWaitTimeEstimate: 300000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '35',
      calculatedTotalMinFee: '31',
    },
    medium: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 30000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '40',
      calculatedTotalMinFee: '32',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '60',
      calculatedTotalMinFee: '33',
    },
    estimatedNextBlockBaseFee: '30',
    lastBlockBaseFee: '28',
    lastBlockMinPriorityFee: '1',
    lastBlockMaxPriorityFee: '9',
  },
  {
    low: {
      minWaitTimeEstimate: 180000,
      maxWaitTimeEstimate: 360000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '40',
      calculatedTotalMinFee: '33',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '45',
      calculatedTotalMinFee: '34',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '65',
      calculatedTotalMinFee: '35',
    },
    estimatedNextBlockBaseFee: '32',
    lastBlockBaseFee: '30',
    lastBlockMinPriorityFee: '1',
    lastBlockMaxPriorityFee: '10',
  },
  {
    low: {
      minWaitTimeEstimate: 60000,
      maxWaitTimeEstimate: 240000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '42',
      calculatedTotalMinFee: '36',
    },
    medium: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 30000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '47',
      calculatedTotalMinFee: '38',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '4',
      suggestedMaxFeePerGas: '67',
      calculatedTotalMinFee: '39',
    },
    estimatedNextBlockBaseFee: '35',
    lastBlockBaseFee: '32',
    lastBlockMinPriorityFee: '1',
    lastBlockMaxPriorityFee: '10',
  },
  {
    low: {
      minWaitTimeEstimate: 180000,
      maxWaitTimeEstimate: 300000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '53',
      calculatedTotalMinFee: '53',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '7',
      suggestedMaxFeePerGas: '70',
      calculatedTotalMinFee: '57',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '10',
      suggestedMaxFeePerGas: '100',
      calculatedTotalMinFee: '60',
    },
    estimatedNextBlockBaseFee: '50',
    lastBlockBaseFee: '35',
    lastBlockMinPriorityFee: '2',
    lastBlockMaxPriorityFee: '15',
  },
  {
    low: {
      minWaitTimeEstimate: 120000,
      maxWaitTimeEstimate: 360000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '35',
      calculatedTotalMinFee: '31',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '40',
      calculatedTotalMinFee: '33',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '4',
      suggestedMaxFeePerGas: '60',
      calculatedTotalMinFee: '34',
    },
    estimatedNextBlockBaseFee: '30',
    lastBlockBaseFee: '50',
    lastBlockMinPriorityFee: '4',
    lastBlockMaxPriorityFee: '25',
  },
  {
    low: {
      minWaitTimeEstimate: 60000,
      maxWaitTimeEstimate: 600000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '35',
      calculatedTotalMinFee: '31',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '1.8',
      suggestedMaxFeePerGas: '38',
      calculatedTotalMinFee: '29.8',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 150000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '50',
      calculatedTotalMinFee: '30',
    },
    estimatedNextBlockBaseFee: '28',
    lastBlockBaseFee: '28',
    lastBlockMinPriorityFee: '1',
    lastBlockMaxPriorityFee: '7',
  },
];

const getMockApiResponse = (): GasFeeEstimates =>
  mockApiResponses[Math.floor(Math.random() * 6)];

export function fetchGasEstimates(): Promise<GasFeeEstimates> {
  // return handleFetch(GAS_FEE_API)
  return new Promise((resolve) => {
    resolve(getMockApiResponse());
  });
}
