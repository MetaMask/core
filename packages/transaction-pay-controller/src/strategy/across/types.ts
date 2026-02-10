import type { Hex } from '@metamask/utils';

import type { TransactionPayAction } from '../../types';

export type AcrossToken = {
  address: Hex;
  chainId: number;
  decimals: number;
  name?: string;
  symbol?: string;
};

export type AcrossFeeComponent = {
  amount?: string;
  amountUsd?: string;
  pct?: string | null;
  token?: AcrossToken;
};

export type AcrossFees = {
  total?: AcrossFeeComponent;
  originGas?: AcrossFeeComponent;
  destinationGas?: AcrossFeeComponent;
  relayerCapital?: AcrossFeeComponent;
  relayerTotal?: AcrossFeeComponent;
  lpFee?: AcrossFeeComponent;
  app?: AcrossFeeComponent;
  swapImpact?: AcrossFeeComponent;
};

export type AcrossApprovalTransaction = {
  chainId: number;
  to: Hex;
  data: Hex;
  value?: Hex;
};

export type AcrossSwapTransaction = {
  chainId: number;
  to: Hex;
  data: Hex;
  value?: Hex;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

export type AcrossSwapApprovalResponse = {
  approvalTxns?: AcrossApprovalTransaction[];
  expectedFillTime?: number;
  expectedOutputAmount?: string;
  fees?: AcrossFees;
  id?: string;
  inputAmount?: string;
  inputToken: AcrossToken;
  minOutputAmount?: string;
  outputToken: AcrossToken;
  swapTx: AcrossSwapTransaction;
};

export type AcrossActionArg = TransactionPayAction['args'][number];

export type AcrossAction = TransactionPayAction;

export type AcrossActionRequestBody = {
  actions: AcrossAction[];
};

export type AcrossQuote = {
  quote: AcrossSwapApprovalResponse;
  request: {
    amount: string;
    tradeType: 'exactOutput' | 'exactInput';
  };
};
