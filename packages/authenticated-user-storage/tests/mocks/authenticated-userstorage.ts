import { getAuthenticatedStorageUrl } from '../../src/authenticated-user-storage';
import type {
  DelegationResponse,
  DelegationSubmission,
  NotificationPreferences,
} from '../../src/types';

export const MOCK_DELEGATIONS_URL = `${getAuthenticatedStorageUrl('prod')}/delegations`;
export const MOCK_NOTIFICATION_PREFERENCES_URL = `${getAuthenticatedStorageUrl('prod')}/preferences/notifications`;

export const MOCK_DELEGATION_SUBMISSION: DelegationSubmission = {
  signedDelegation: {
    delegate: '0x1111111111111111111111111111111111111111',
    delegator: '0x2222222222222222222222222222222222222222',
    authority:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    caveats: [
      {
        enforcer: '0x1234567890abcdef1234567890abcdef12345678',
        terms: '0xabcdef',
        args: '0x',
      },
    ],
    salt: '0x00000001',
    signature: '0xaabbcc',
  },
  metadata: {
    delegationHash:
      '0xdae6d132587770a2eb84411e125d9458a5fa3ec28615fee332f1947515041d10',
    chainIdHex: '0x1',
    allowance: '0xde0b6b3a7640000',
    tokenSymbol: 'USDC',
    tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    type: 'spend',
  },
};

export const MOCK_DELEGATION_RESPONSE: DelegationResponse =
  MOCK_DELEGATION_SUBMISSION;

export const MOCK_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  walletActivity: {
    enabled: true,
    accounts: [
      {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        enabled: true,
      },
    ],
  },
  marketing: { enabled: false },
  perps: { enabled: true },
  socialAI: {
    enabled: true,
    txAmountLimit: 100,
    mutedTraderProfileIds: [
      'b3a7c9d1-4e2f-4a8b-9c6d-1f2e3a4b5c6d',
      'e8f2a1b3-5c4d-4e6f-8a9b-2c3d4e5f6a7b',
    ],
  },
};
