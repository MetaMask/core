import type {
  DelegationResponse,
  DelegationSubmission,
  NotificationPreferences,
} from '../authenticated-user-storage-types';
import { AUTHENTICATED_STORAGE_URL } from '../authenticated-user-storage';
import { Env } from '../../shared/env';

export const MOCK_DELEGATIONS_URL = `${AUTHENTICATED_STORAGE_URL(Env.PRD)}/delegations`;
export const MOCK_NOTIFICATION_PREFERENCES_URL = `${AUTHENTICATED_STORAGE_URL(Env.PRD)}/preferences/notifications`;

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
  wallet_activity: {
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
    tokens: ['ETH', 'USDC'],
  },
};
