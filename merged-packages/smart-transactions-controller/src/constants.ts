export const API_BASE_URL = 'https://transaction.api.cx.metamask.io';

type SentinelApiBaseUrlMap = {
  [key: number]: string;
};

// The map with types applied
export const SENTINEL_API_BASE_URL_MAP: SentinelApiBaseUrlMap = {
  1: 'https://tx-sentinel-ethereum-mainnet.api.cx.metamask.io',
  11155111: 'https://tx-sentinel-ethereum-sepolia.api.cx.metamask.io',
};

export enum MetaMetricsEventName {
  StxStatusUpdated = 'STX Status Updated',
  StxConfirmed = 'STX Confirmed',
  StxConfirmationFailed = 'STX Confirmation Failed',
}

export enum MetaMetricsEventCategory {
  Transactions = 'Transactions',
}
