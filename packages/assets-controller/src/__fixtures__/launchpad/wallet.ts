import {
  MAINNET_CHAIN_ID,
  WS_WALLET_ADDRESS,
} from '../ws-price-updates/wallet.js';

/** CAIP-10 account ID the Accounts API keys balance rows by. */
export const LAUNCHPAD_CAIP_ACCOUNT_ID =
  `${MAINNET_CHAIN_ID}:${WS_WALLET_ADDRESS}` as const;

const erc20 = (address: string): string =>
  `${MAINNET_CHAIN_ID}/erc20:${address}`;

/** Below the floor of three, Token API flags it as a (non-malicious) launchpad token. */
export const LAUNCHPAD_ASSET_ID = erc20(
  '0x1111111111111111111111111111111111111111',
);

/** Below the floor, a launchpad token whose security data says `Malicious`. */
export const MALICIOUS_LAUNCHPAD_ASSET_ID = erc20(
  '0x2222222222222222222222222222222222222222',
);

/** Below the floor and not a launchpad token: ordinary spam. */
export const SPAM_ASSET_ID = erc20(
  '0x3333333333333333333333333333333333333333',
);

/** Above the floor. */
export const ESTABLISHED_ASSET_ID = erc20(
  '0x4444444444444444444444444444444444444444',
);

/** Token API facts for each token. */
export const LAUNCHPAD_TOKENS: {
  assetId: string;
  symbol: string;
  occurrences: number;
  launchpad?: { securityResultType: string | null };
}[] = [
  {
    assetId: LAUNCHPAD_ASSET_ID,
    symbol: 'LAUNCH',
    occurrences: 0,
    launchpad: { securityResultType: null },
  },
  {
    assetId: MALICIOUS_LAUNCHPAD_ASSET_ID,
    symbol: 'RUG',
    occurrences: 0,
    launchpad: { securityResultType: 'Malicious' },
  },
  { assetId: SPAM_ASSET_ID, symbol: 'SPAM', occurrences: 1 },
  { assetId: ESTABLISHED_ASSET_ID, symbol: 'EST', occurrences: 10 },
];
