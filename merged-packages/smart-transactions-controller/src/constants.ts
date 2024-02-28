export const API_BASE_URL = 'https://transaction.metaswap.codefi.network';
export const CHAIN_IDS = {
  ETHEREUM: '0x1',
  GOERLI: '0x5',
  RINKEBY: '0x4',
  BSC: '0x38',
} as const;

export enum MetaMetricsEventName {
  StxStatusUpdated = 'STX Status Updated',
  StxConfirmed = 'STX Confirmed',
  StxConfirmationFailed = 'STX Confirmation Failed',
}

export enum MetaMetricsEventCategory {
  Transactions = 'Transactions',
}
