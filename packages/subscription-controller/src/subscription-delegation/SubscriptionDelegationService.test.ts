import {
  createERC20TokenPeriodTransferTerms,
  createValueLteTerms,
  decodeERC20TokenPeriodTransferTerms,
  hashDelegation,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import {
  CRYPTO_AUTH_METHODS,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
} from '../types.js';
import type { PricingCryptoPaymentMethod, PricingResponse } from '../types.js';
import { calculatePeriodAmount, getPeriodDuration } from './amount.js';
import {
  SubscriptionDelegationService,
  serviceName,
} from './SubscriptionDelegationService.js';
import type { SubscriptionDelegationServiceMessenger } from './SubscriptionDelegationService.js';
import type { PrepareSubscriptionDelegationRequest } from './types.js';
import { CASH_SUBSCRIPTION_DELEGATION_TYPE } from './types.js';

const TOKEN = '0x3333333333333333333333333333333333333333' as Hex;
const DELEGATE = '0x4444444444444444444444444444444444444444' as Hex;
const PAYER = '0x5555555555555555555555555555555555555555' as Hex;
const CHAIN_ID = '0x1' as Hex;
const TOKEN_DECIMALS = 18;
const SIGNATURE: Hex = `0x${'ab'.repeat(65)}`;
const { ValueLteEnforcer: VALUE_LTE, ERC20PeriodTransferEnforcer: PERIOD } =
  DELEGATOR_CONTRACTS['1.3.0'][1];

const MONEY_ACCOUNT_VAULT_CONFIG = {
  chainId: CHAIN_ID,
  boringVault: '0x1111111111111111111111111111111111111111',
  tellerAddress: '0x2222222222222222222222222222222222222222',
  accountantAddress: '0x6666666666666666666666666666666666666666',
  lensAddress: '0x7777777777777777777777777777777777777777',
};

const REMOTE_FEATURE_FLAGS: Record<string, unknown> = {
  moneyAccountVaultConfig: MONEY_ACCOUNT_VAULT_CONFIG,
};

const PRICE = {
  interval: RECURRING_INTERVALS.month,
  unitAmount: 1000,
  unitDecimals: 2,
  currency: 'usd' as const,
  trialPeriodDays: 14,
  minBillingCycles: 12,
  minBillingCyclesForBalance: 3,
};

const PRICING_DELEGATION_PAYMENT_METHOD: PricingCryptoPaymentMethod = {
  type: PAYMENT_TYPES.byCrypto,
  cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
  products: [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS],
  chains: [
    {
      chainId: CHAIN_ID,
      paymentAddress: '0x2222222222222222222222222222222222222222' as Hex,
      delegateAddress: DELEGATE,
      tokens: [
        {
          address: TOKEN,
          symbol: 'pvmUSD',
          decimals: TOKEN_DECIMALS,
        },
      ],
    },
  ],
};

const PRICING: PricingResponse = {
  products: [
    {
      name: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
      prices: [PRICE],
    },
  ],
  paymentMethods: [PRICING_DELEGATION_PAYMENT_METHOD],
};

const REQUEST: PrepareSubscriptionDelegationRequest = {
  product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
  recurringInterval: RECURRING_INTERVALS.month,
  payerAddress: PAYER,
  isTrialRequested: false,
};

const PERIOD_AMOUNT = calculatePeriodAmount({
  unitAmount: PRICE.unitAmount,
  unitDecimals: PRICE.unitDecimals,
  tokenDecimals: TOKEN_DECIMALS,
});
const PERIOD_DURATION = getPeriodDuration(REQUEST.recurringInterval);

const SUFFICIENT_BALANCE = {
  musdBalance: '30000000',
  vmusdValueInMusd: '0',
  totalBalance: '30000000',
  source: 'rpc' as const,
  usedFallback: false,
};

const INSUFFICIENT_BALANCE = {
  musdBalance: '100',
  vmusdValueInMusd: '0',
  totalBalance: '100',
  source: 'rpc' as const,
  usedFallback: false,
};

type Mocks = {
  listDelegations: jest.Mock;
  createDelegation: jest.Mock;
  signDelegation: jest.Mock;
  verifyDelegation: jest.Mock;
  getIntentsByAddress: jest.Mock;
  createIntents: jest.Mock;
  getRemoteFeatureFlagState: jest.Mock;
  fetchBalanceWithFallback: jest.Mock;
  getPricing: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(
  options: {
    listDelegations?: unknown[];
    intents?: unknown[];
    verify?: { valid: boolean; delegationHash?: Hex; errors?: string[] };
    remoteFeatureFlags?: Record<string, unknown>;
    balance?: typeof SUFFICIENT_BALANCE;
    pricing?: PricingResponse;
  } = {},
) {
  const mocks: Mocks = {
    listDelegations: jest.fn().mockResolvedValue(options.listDelegations ?? []),
    createDelegation: jest.fn().mockResolvedValue(undefined),
    signDelegation: jest.fn().mockResolvedValue(SIGNATURE),
    verifyDelegation: jest
      .fn()
      .mockImplementation(async ({ signedDelegation }) => {
        if (options.verify) {
          return options.verify;
        }
        const delegationHash = hashDelegation({
          ...signedDelegation,
          salt: BigInt(signedDelegation.salt),
        });
        return { valid: true, delegationHash };
      }),
    getIntentsByAddress: jest.fn().mockResolvedValue(options.intents ?? []),
    createIntents: jest.fn().mockResolvedValue([]),
    getRemoteFeatureFlagState: jest.fn().mockReturnValue({
      remoteFeatureFlags: options.remoteFeatureFlags ?? REMOTE_FEATURE_FLAGS,
      cacheTimestamp: 0,
    }),
    fetchBalanceWithFallback: jest
      .fn()
      .mockResolvedValue(options.balance ?? SUFFICIENT_BALANCE),
    getPricing: jest.fn().mockResolvedValue(options.pricing ?? PRICING),
  };

  type AllowedActions =
    | {
        type: 'AuthenticatedUserStorageService:listDelegations';
        handler: Mocks['listDelegations'];
      }
    | {
        type: 'AuthenticatedUserStorageService:createDelegation';
        handler: Mocks['createDelegation'];
      }
    | {
        type: 'DelegationController:signDelegation';
        handler: Mocks['signDelegation'];
      }
    | {
        type: 'ChompApiService:verifyDelegation';
        handler: Mocks['verifyDelegation'];
      }
    | {
        type: 'ChompApiService:getIntentsByAddress';
        handler: Mocks['getIntentsByAddress'];
      }
    | {
        type: 'ChompApiService:createIntents';
        handler: Mocks['createIntents'];
      }
    | {
        type: 'RemoteFeatureFlagController:getState';
        handler: Mocks['getRemoteFeatureFlagState'];
      }
    | {
        type: 'MoneyAccountBalanceService:fetchBalanceWithFallback';
        handler: Mocks['fetchBalanceWithFallback'];
      }
    | {
        type: 'SubscriptionController:getPricing';
        handler: Mocks['getPricing'];
      };

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    | AllowedActions
    | {
        type: `${typeof serviceName}:prepareDelegation`;
        handler: SubscriptionDelegationService['prepareDelegation'];
      }
    | {
        type: `${typeof serviceName}:checkMoneyAccountBalance`;
        handler: SubscriptionDelegationService['checkMoneyAccountBalance'];
      },
    never
  >({ namespace: MOCK_ANY_NAMESPACE });

  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:listDelegations',
    mocks.listDelegations,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:createDelegation',
    mocks.createDelegation,
  );
  rootMessenger.registerActionHandler(
    'DelegationController:signDelegation',
    mocks.signDelegation,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:verifyDelegation',
    mocks.verifyDelegation,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getIntentsByAddress',
    mocks.getIntentsByAddress,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createIntents',
    mocks.createIntents,
  );
  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    mocks.getRemoteFeatureFlagState,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountBalanceService:fetchBalanceWithFallback',
    mocks.fetchBalanceWithFallback,
  );
  rootMessenger.registerActionHandler(
    'SubscriptionController:getPricing',
    mocks.getPricing,
  );

  const messenger: SubscriptionDelegationServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      'AuthenticatedUserStorageService:listDelegations',
      'AuthenticatedUserStorageService:createDelegation',
      'DelegationController:signDelegation',
      'ChompApiService:verifyDelegation',
      'ChompApiService:getIntentsByAddress',
      'ChompApiService:createIntents',
      'RemoteFeatureFlagController:getState',
      'MoneyAccountBalanceService:fetchBalanceWithFallback',
      'SubscriptionController:getPricing',
    ],
    events: [],
  });

  const service = new SubscriptionDelegationService({
    messenger,
  });

  return { service, rootMessenger, mocks };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildStoredDelegation({
  periodAmount = PERIOD_AMOUNT,
  periodDuration = PERIOD_DURATION,
  delegationHash = `0x${'dd'.repeat(32)}`,
  startDate = 1_700_000_000,
}: {
  periodAmount?: bigint;
  periodDuration?: number;
  delegationHash?: Hex;
  startDate?: number;
} = {}) {
  return {
    signedDelegation: {
      delegate: DELEGATE,
      delegator: PAYER,
      authority: ROOT_AUTHORITY,
      caveats: [
        {
          enforcer: VALUE_LTE,
          terms: createValueLteTerms({ maxValue: 0n }),
          args: '0x',
        },
        {
          enforcer: PERIOD,
          terms: createERC20TokenPeriodTransferTerms({
            tokenAddress: TOKEN,
            periodAmount,
            periodDuration,
            startDate,
          }),
          args: '0x',
        },
      ],
      salt: `0x${'aa'.repeat(32)}`,
      signature: SIGNATURE,
    },
    metadata: {
      delegationHash,
      chainIdHex: CHAIN_ID,
      allowance: `0x${periodAmount.toString(16)}`,
      tokenSymbol: 'pvmUSD',
      tokenAddress: TOKEN,
      type: CASH_SUBSCRIPTION_DELEGATION_TYPE,
    },
  };
}

function expectNoSideEffects(mocks: Mocks): void {
  expect(mocks.listDelegations).not.toHaveBeenCalled();
  expect(mocks.signDelegation).not.toHaveBeenCalled();
  expect(mocks.verifyDelegation).not.toHaveBeenCalled();
  expect(mocks.createDelegation).not.toHaveBeenCalled();
  expect(mocks.getIntentsByAddress).not.toHaveBeenCalled();
  expect(mocks.createIntents).not.toHaveBeenCalled();
}

function getSignedPeriodStartDate(mocks: Mocks): number {
  const signedArgs = mocks.signDelegation.mock.calls[0][0] as {
    delegation: {
      caveats: { enforcer: Hex; terms: Hex }[];
    };
  };
  const periodCaveat = signedArgs.delegation.caveats.find(
    (caveat) => caveat.enforcer === PERIOD,
  );
  expect(periodCaveat).toBeDefined();

  return decodeERC20TokenPeriodTransferTerms(periodCaveat?.terms ?? '0x')
    .startDate;
}

describe('SubscriptionDelegationService', () => {
  describe('prepareDelegation', () => {
    it('creates, verifies, persists, and registers using feature flag and pricing delegate', async () => {
      const { service, mocks } = setup();

      const result = await service.prepareDelegation(REQUEST);

      expect(result.disposition).toBe('created');
      expect(result.delegationHash).toMatch(/^0x[0-9a-fA-F]{64}$/u);
      expect(mocks.getRemoteFeatureFlagState).toHaveBeenCalledTimes(1);
      expect(mocks.getPricing).toHaveBeenCalledTimes(1);
      expect(mocks.fetchBalanceWithFallback).not.toHaveBeenCalled();
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.signDelegation).toHaveBeenCalledWith({
        delegation: expect.objectContaining({
          delegate: DELEGATE,
          delegator: PAYER,
          caveats: [
            expect.objectContaining({ enforcer: VALUE_LTE }),
            expect.objectContaining({ enforcer: PERIOD }),
          ],
        }),
        chainId: CHAIN_ID,
      });
      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.createDelegation).toHaveBeenCalledWith({
        signedDelegation: expect.objectContaining({
          delegate: DELEGATE,
          delegator: PAYER,
          signature: SIGNATURE,
        }),
        metadata: expect.objectContaining({
          delegationHash: result.delegationHash,
          chainIdHex: CHAIN_ID,
          allowance: `0x${PERIOD_AMOUNT.toString(16)}`,
          tokenSymbol: 'pvmUSD',
          tokenAddress: TOKEN,
          type: CASH_SUBSCRIPTION_DELEGATION_TYPE,
        }),
      });
      expect(mocks.createIntents).toHaveBeenCalledWith([
        {
          account: PAYER,
          delegationHash: result.delegationHash,
          chainId: CHAIN_ID,
          metadata: {
            allowance: `0x${PERIOD_AMOUNT.toString(16)}`,
            tokenSymbol: 'pvmUSD',
            tokenAddress: TOKEN,
            type: CASH_SUBSCRIPTION_DELEGATION_TYPE,
          },
        },
      ]);
    });

    it('is callable through the messenger', async () => {
      const { rootMessenger } = setup();

      const result = await rootMessenger.call(
        'SubscriptionDelegationService:prepareDelegation',
        REQUEST,
      );

      expect(result.disposition).toBe('created');
    });

    it('offsets the period startDate by pricing trialPeriodDays when trial is requested', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

      try {
        const { service, mocks } = setup();

        await service.prepareDelegation({
          ...REQUEST,
          isTrialRequested: true,
        });

        expect(getSignedPeriodStartDate(mocks)).toBe(
          Math.floor(Date.now() / 1000) + PRICE.trialPeriodDays * 86_400,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not apply pricing trialPeriodDays when trial is not requested', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

      try {
        const { service, mocks } = setup();

        await service.prepareDelegation(REQUEST);

        expect(getSignedPeriodStartDate(mocks)).toBe(
          Math.floor(Date.now() / 1000),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('reuses a matching stored delegation and skips sign/verify when an intent is active', async () => {
      const stored = buildStoredDelegation();
      const { service, mocks } = setup({
        listDelegations: [stored],
        intents: [
          {
            account: PAYER,
            delegationHash: stored.metadata.delegationHash,
            chainId: CHAIN_ID,
            status: 'active',
            metadata: stored.metadata,
          },
        ],
      });

      const result = await service.prepareDelegation(REQUEST);

      expect(result).toStrictEqual({
        delegationHash: stored.metadata.delegationHash,
        disposition: 'reused',
      });
      expect(mocks.signDelegation).not.toHaveBeenCalled();
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
      expect(mocks.createDelegation).not.toHaveBeenCalled();
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });

    it('reuses a matching delegation and registers an intent when missing', async () => {
      const stored = buildStoredDelegation();
      const { service, mocks } = setup({
        listDelegations: [stored],
        intents: [],
      });

      const result = await service.prepareDelegation(REQUEST);

      expect(result.disposition).toBe('reused');
      expect(mocks.createIntents).toHaveBeenCalledWith([
        expect.objectContaining({
          account: PAYER,
          delegationHash: stored.metadata.delegationHash,
        }),
      ]);
      expect(mocks.signDelegation).not.toHaveBeenCalled();
    });

    it('skips CHOMP verify and intent registration when skipChompInteractions is true', async () => {
      const { service, mocks } = setup();

      const result = await service.prepareDelegation({
        ...REQUEST,
        skipChompInteractions: true,
      });

      expect(result.disposition).toBe('created');
      expect(result.delegationHash).toMatch(/^0x[0-9a-fA-F]{64}$/u);
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.createDelegation).toHaveBeenCalledWith({
        signedDelegation: expect.objectContaining({
          delegate: DELEGATE,
          delegator: PAYER,
          signature: SIGNATURE,
        }),
        metadata: expect.objectContaining({
          delegationHash: result.delegationHash,
          chainIdHex: CHAIN_ID,
          allowance: `0x${PERIOD_AMOUNT.toString(16)}`,
          tokenSymbol: 'pvmUSD',
          tokenAddress: TOKEN,
          type: CASH_SUBSCRIPTION_DELEGATION_TYPE,
        }),
      });
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
      expect(mocks.getIntentsByAddress).not.toHaveBeenCalled();
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });

    it('does not reuse an immediately redeemable delegation when trial is requested', async () => {
      const stored = buildStoredDelegation({
        startDate: Math.floor(Date.now() / 1000),
      });
      const { service, mocks } = setup({
        listDelegations: [stored],
        intents: [
          {
            account: PAYER,
            delegationHash: stored.metadata.delegationHash,
            chainId: CHAIN_ID,
            status: 'active',
            metadata: stored.metadata,
          },
        ],
      });

      const result = await service.prepareDelegation({
        ...REQUEST,
        isTrialRequested: true,
      });

      expect(result.disposition).toBe('created');
      expect(result.delegationHash).not.toBe(stored.metadata.delegationHash);
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
    });

    it('does not reuse a trial-deferred delegation when trial is not requested', async () => {
      const stored = buildStoredDelegation({
        startDate:
          Math.floor(Date.now() / 1000) + PRICE.trialPeriodDays * 86_400,
      });
      const { service, mocks } = setup({
        listDelegations: [stored],
        intents: [
          {
            account: PAYER,
            delegationHash: stored.metadata.delegationHash,
            chainId: CHAIN_ID,
            status: 'active',
            metadata: stored.metadata,
          },
        ],
      });

      const result = await service.prepareDelegation(REQUEST);

      expect(result.disposition).toBe('created');
      expect(result.delegationHash).not.toBe(stored.metadata.delegationHash);
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
    });

    it('reuses a trial-deferred delegation when trial is requested', async () => {
      const stored = buildStoredDelegation({
        startDate:
          Math.floor(Date.now() / 1000) + PRICE.trialPeriodDays * 86_400,
      });
      const { service, mocks } = setup({
        listDelegations: [stored],
        intents: [
          {
            account: PAYER,
            delegationHash: stored.metadata.delegationHash,
            chainId: CHAIN_ID,
            status: 'active',
            metadata: stored.metadata,
          },
        ],
      });

      const result = await service.prepareDelegation({
        ...REQUEST,
        isTrialRequested: true,
      });

      expect(result).toStrictEqual({
        delegationHash: stored.metadata.delegationHash,
        disposition: 'reused',
      });
      expect(mocks.signDelegation).not.toHaveBeenCalled();
    });

    it('reuses an immediately redeemable delegation when trialPeriodDays is 0', async () => {
      const stored = buildStoredDelegation({
        startDate: Math.floor(Date.now() / 1000),
      });
      const { service, mocks } = setup({
        listDelegations: [stored],
        intents: [
          {
            account: PAYER,
            delegationHash: stored.metadata.delegationHash,
            chainId: CHAIN_ID,
            status: 'active',
            metadata: stored.metadata,
          },
        ],
        pricing: {
          ...PRICING,
          products: [
            {
              name: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
              prices: [{ ...PRICE, trialPeriodDays: 0 }],
            },
          ],
        },
      });

      const result = await service.prepareDelegation({
        ...REQUEST,
        isTrialRequested: true,
      });

      expect(result).toStrictEqual({
        delegationHash: stored.metadata.delegationHash,
        disposition: 'reused',
      });
      expect(mocks.signDelegation).not.toHaveBeenCalled();
    });

    it('reuses a matching delegation without CHOMP when skipChompInteractions is true', async () => {
      const stored = buildStoredDelegation();
      const { service, mocks } = setup({
        listDelegations: [stored],
        intents: [],
      });

      const result = await service.prepareDelegation({
        ...REQUEST,
        skipChompInteractions: true,
      });

      expect(result).toStrictEqual({
        delegationHash: stored.metadata.delegationHash,
        disposition: 'reused',
      });
      expect(mocks.signDelegation).not.toHaveBeenCalled();
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
      expect(mocks.createDelegation).not.toHaveBeenCalled();
      expect(mocks.getIntentsByAddress).not.toHaveBeenCalled();
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });

    it('checks Money Account balance when checkBalance is true and proceeds when sufficient', async () => {
      const { service, mocks } = setup();

      const result = await service.prepareDelegation({
        ...REQUEST,
        checkBalance: true,
      });

      expect(result.disposition).toBe('created');
      expect(mocks.fetchBalanceWithFallback).toHaveBeenCalledWith(PAYER);
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
    });

    it('throws InsufficientBalance before side effects when checkBalance is true and balance is low', async () => {
      const { service, mocks } = setup({ balance: INSUFFICIENT_BALANCE });

      await expect(
        service.prepareDelegation({ ...REQUEST, checkBalance: true }),
      ).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.InsufficientBalance,
      );
      expect(mocks.fetchBalanceWithFallback).toHaveBeenCalledWith(PAYER);
      expectNoSideEffects(mocks);
    });

    it('throws when CHOMP rejects the delegation and does not persist', async () => {
      const { service, mocks } = setup({
        verify: { valid: false, errors: ['bad caveat'] },
      });

      await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.ChompRejectedDelegation,
      );
      expect(mocks.createDelegation).not.toHaveBeenCalled();
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });

    it('reports an unknown error when CHOMP provides no rejection details', async () => {
      const { service } = setup({
        verify: { valid: false },
      });

      await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
        `${SubscriptionDelegationServiceErrorMessage.ChompRejectedDelegation}: unknown error`,
      );
    });

    it('throws when CHOMP omits the delegation hash', async () => {
      const { service, mocks } = setup({
        verify: { valid: true },
      });

      await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.ChompMissingDelegationHash,
      );
      expect(mocks.createDelegation).not.toHaveBeenCalled();
    });

    it('throws when CHOMP returns a mismatched delegation hash', async () => {
      const { service, mocks } = setup({
        verify: {
          valid: true,
          delegationHash: `0x${'ee'.repeat(32)}`,
        },
      });

      await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.ChompDelegationHashMismatch,
      );
      expect(mocks.createDelegation).not.toHaveBeenCalled();
    });

    it('rejects Shield before any side effects', async () => {
      const { service, mocks } = setup();
      const shieldRequest = {
        ...REQUEST,
        product: PRODUCT_TYPES.SHIELD,
      } as unknown as PrepareSubscriptionDelegationRequest;

      await expect(service.prepareDelegation(shieldRequest)).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.UnsupportedProduct,
      );
      expect(mocks.getRemoteFeatureFlagState).not.toHaveBeenCalled();
      expect(mocks.fetchBalanceWithFallback).not.toHaveBeenCalled();
      expectNoSideEffects(mocks);
    });

    it.each([
      ['missing', {}],
      ['malformed', { moneyAccountVaultConfig: { chainId: 'invalid' } }],
    ])(
      'rejects %s Money Account vault config before CHOMP or delegation calls',
      async (_condition, remoteFeatureFlags) => {
        const { service, mocks } = setup({ remoteFeatureFlags });

        await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
          SubscriptionDelegationServiceErrorMessage.MissingMoneyAccountVaultConfig,
        );
        expectNoSideEffects(mocks);
      },
    );

    it('rejects when Delegation Framework contracts are unavailable for the feature-flag chain', async () => {
      const { service, mocks } = setup({
        remoteFeatureFlags: {
          moneyAccountVaultConfig: {
            ...MONEY_ACCOUNT_VAULT_CONFIG,
            chainId: '0xffffffff',
          },
        },
      });

      await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
        `${SubscriptionDelegationServiceErrorMessage.DelegationContractsNotFound}: 0xffffffff`,
      );
      expectNoSideEffects(mocks);
    });

    it.each([
      [
        'product price',
        {
          ...PRICING,
          products: [],
        },
      ],
      [
        'delegation payment method',
        {
          ...PRICING,
          paymentMethods: [],
        },
      ],
      [
        'pricing chain',
        {
          ...PRICING,
          paymentMethods: [
            {
              ...PRICING_DELEGATION_PAYMENT_METHOD,
              chains: [],
            },
          ],
        } as PricingResponse,
      ],
      [
        'delegate address',
        {
          ...PRICING,
          paymentMethods: [
            {
              ...PRICING_DELEGATION_PAYMENT_METHOD,
              chains: [
                {
                  ...PRICING_DELEGATION_PAYMENT_METHOD.chains?.[0],
                  delegateAddress: undefined,
                },
              ],
            },
          ],
        } as PricingResponse,
      ],
      [
        'payment token',
        {
          ...PRICING,
          paymentMethods: [
            {
              ...PRICING_DELEGATION_PAYMENT_METHOD,
              chains: [
                {
                  ...PRICING_DELEGATION_PAYMENT_METHOD.chains?.[0],
                  tokens: [],
                },
              ],
            },
          ],
        } as PricingResponse,
      ],
    ])('rejects when %s is missing from pricing', async (_name, pricing) => {
      const { service, mocks } = setup({ pricing });

      await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.PricingConfigurationNotFound,
      );
      expectNoSideEffects(mocks);
    });
  });

  describe('checkMoneyAccountBalance', () => {
    it('reports sufficient balance when totalBalance covers unitAmount × cycles', async () => {
      const { service, mocks } = setup();

      const result = await service.checkMoneyAccountBalance({
        product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        recurringInterval: RECURRING_INTERVALS.month,
        payerAddress: PAYER,
      });

      expect(mocks.fetchBalanceWithFallback).toHaveBeenCalledWith(PAYER);
      expect(result).toStrictEqual({
        hasSufficientBalance: true,
        balance: SUFFICIENT_BALANCE.totalBalance,
        requiredBalance: '30000000',
      });
    });

    it('reports insufficient balance when totalBalance is below the required amount', async () => {
      const { service } = setup({ balance: INSUFFICIENT_BALANCE });

      const result = await service.checkMoneyAccountBalance({
        product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        recurringInterval: RECURRING_INTERVALS.month,
        payerAddress: PAYER,
      });

      expect(result).toStrictEqual({
        hasSufficientBalance: false,
        balance: INSUFFICIENT_BALANCE.totalBalance,
        requiredBalance: '30000000',
      });
    });

    it('is callable through the messenger', async () => {
      const { rootMessenger } = setup();

      const result = await rootMessenger.call(
        'SubscriptionDelegationService:checkMoneyAccountBalance',
        {
          product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
          recurringInterval: RECURRING_INTERVALS.month,
          payerAddress: PAYER,
        },
      );

      expect(result.hasSufficientBalance).toBe(true);
    });

    it('throws on invalid minimumFundingCycles', async () => {
      const pricing = {
        ...PRICING,
        products: [
          {
            ...PRICING.products[0],
            prices: [{ ...PRICE, minBillingCyclesForBalance: 0 }],
          },
        ],
      };
      const { service, mocks } = setup({ pricing });

      await expect(
        service.checkMoneyAccountBalance({
          product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
          recurringInterval: RECURRING_INTERVALS.month,
          payerAddress: PAYER,
        }),
      ).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.InvalidMinimumFundingCycles,
      );
      expect(mocks.fetchBalanceWithFallback).not.toHaveBeenCalled();
    });
  });
});
