import type { ServiceDetailsResponse } from '@metamask/chomp-api-service';
import {
  createERC20TokenPeriodTransferTerms,
  createValueLteTerms,
  hashDelegation,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import { PRODUCT_TYPES, RECURRING_INTERVALS } from '../types.js';
import { calculatePeriodAmount, getPeriodDuration } from './amount.js';
import {
  SubscriptionDelegationService,
  serviceName,
} from './SubscriptionDelegationService.js';
import type { SubscriptionDelegationServiceMessenger } from './SubscriptionDelegationService.js';
import type { PrepareSubscriptionDelegationRequest } from './types.js';
import { SUBSCRIPTION_PAYMENT_DELEGATION_TYPE } from './types.js';

const TOKEN = '0x3333333333333333333333333333333333333333' as Hex;
const DELEGATE = '0x4444444444444444444444444444444444444444' as Hex;
const PAYER = '0x5555555555555555555555555555555555555555' as Hex;
const CHAIN_ID = '0x1' as Hex;
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

const SERVICE_DETAILS: ServiceDetailsResponse = {
  auth: { message: 'CHOMP Authentication' },
  chains: {
    [CHAIN_ID]: {
      autoDepositDelegate: DELEGATE,
      protocol: {},
    },
  },
};

const REQUEST: PrepareSubscriptionDelegationRequest = {
  product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
  recurringInterval: RECURRING_INTERVALS.month,
  payerAddress: PAYER,
  tokenAddress: TOKEN,
  tokenSymbol: 'pvmUSD',
  tokenDecimals: 18,
  unitAmount: 1000,
  unitDecimals: 2,
  minimumFundingCycles: 3,
};

const PERIOD_AMOUNT = calculatePeriodAmount({
  unitAmount: REQUEST.unitAmount,
  unitDecimals: REQUEST.unitDecimals,
  tokenDecimals: REQUEST.tokenDecimals,
});
const PERIOD_DURATION = getPeriodDuration(REQUEST.recurringInterval);

type Mocks = {
  listDelegations: jest.Mock;
  createDelegation: jest.Mock;
  signDelegation: jest.Mock;
  verifyDelegation: jest.Mock;
  getIntentsByAddress: jest.Mock;
  createIntents: jest.Mock;
  getRemoteFeatureFlagState: jest.Mock;
  getServiceDetails: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(
  options: {
    listDelegations?: unknown[];
    intents?: unknown[];
    verify?: { valid: boolean; delegationHash?: Hex; errors?: string[] };
    remoteFeatureFlags?: Record<string, unknown>;
    serviceDetails?: ServiceDetailsResponse;
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
    getServiceDetails: jest
      .fn()
      .mockResolvedValue(options.serviceDetails ?? SERVICE_DETAILS),
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
        type: 'ChompApiService:getServiceDetails';
        handler: Mocks['getServiceDetails'];
      };

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    | AllowedActions
    | {
        type: `${typeof serviceName}:prepareDelegation`;
        handler: SubscriptionDelegationService['prepareDelegation'];
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
    'ChompApiService:getServiceDetails',
    mocks.getServiceDetails,
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
      'ChompApiService:getServiceDetails',
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
}: {
  periodAmount?: bigint;
  periodDuration?: number;
  delegationHash?: Hex;
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
            startDate: 1_700_000_000,
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
      type: SUBSCRIPTION_PAYMENT_DELEGATION_TYPE,
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

describe('SubscriptionDelegationService', () => {
  describe('prepareDelegation', () => {
    it('creates, verifies, persists, and registers using feature flag and CHOMP config', async () => {
      const { service, mocks } = setup();

      const result = await service.prepareDelegation(REQUEST);

      expect(result.disposition).toBe('created');
      expect(result.delegationHash).toMatch(/^0x[0-9a-fA-F]{64}$/u);
      expect(mocks.getRemoteFeatureFlagState).toHaveBeenCalledTimes(1);
      expect(mocks.getServiceDetails).toHaveBeenCalledWith([CHAIN_ID]);
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
          type: SUBSCRIPTION_PAYMENT_DELEGATION_TYPE,
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
            type: SUBSCRIPTION_PAYMENT_DELEGATION_TYPE,
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
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
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
        expect(mocks.getServiceDetails).not.toHaveBeenCalled();
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
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
      expectNoSideEffects(mocks);
    });

    it('rejects when CHOMP service details omit the feature-flag chain', async () => {
      const { service, mocks } = setup({
        serviceDetails: {
          auth: { message: 'CHOMP Authentication' },
          chains: {},
        },
      });

      await expect(service.prepareDelegation(REQUEST)).rejects.toThrow(
        `${SubscriptionDelegationServiceErrorMessage.ChompChainNotFound}: ${CHAIN_ID}`,
      );
      expect(mocks.getServiceDetails).toHaveBeenCalledWith([CHAIN_ID]);
      expectNoSideEffects(mocks);
    });
  });
});
