import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import {
  createERC20TokenPeriodTransferTerms,
  createValueLteTerms,
  hashDelegation,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type { Hex } from '@metamask/utils';

import { PRODUCT_TYPES, RECURRING_INTERVALS } from '../types.js';
import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';

import { calculatePeriodAmount, getPeriodDuration } from './amount.js';
import {
  SubscriptionDelegationService,
  serviceName,
} from './SubscriptionDelegationService.js';
import type { SubscriptionDelegationServiceMessenger } from './SubscriptionDelegationService.js';
import type {
  PrepareSubscriptionDelegationRequest,
  SubscriptionDelegationConfig,
} from './types.js';
import { SUBSCRIPTION_PAYMENT_DELEGATION_TYPE } from './types.js';

const TOKEN = '0x3333333333333333333333333333333333333333' as Hex;
const DELEGATE = '0x4444444444444444444444444444444444444444' as Hex;
const PAYER = '0x5555555555555555555555555555555555555555' as Hex;
const CHAIN_ID = '0x1' as Hex;
const SIGNATURE: Hex = `0x${'ab'.repeat(65)}`;
const {
  ValueLteEnforcer: VALUE_LTE,
  ERC20PeriodTransferEnforcer: PERIOD,
} = DELEGATOR_CONTRACTS['1.3.0'][1];

const CONFIG: SubscriptionDelegationConfig = {
  chainId: CHAIN_ID,
  delegateAddress: DELEGATE,
};

const REQUEST: PrepareSubscriptionDelegationRequest = {
  product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
  recurringInterval: RECURRING_INTERVALS.month,
  chainId: CHAIN_ID,
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
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(
  options: {
    listDelegations?: unknown[];
    intents?: unknown[];
    verify?: { valid: boolean; delegationHash?: Hex; errors?: string[] };
    config?: SubscriptionDelegationConfig;
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
    ],
    events: [],
  });

  const service = new SubscriptionDelegationService({
    messenger,
    config: options.config ?? CONFIG,
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
  describe('constructor', () => {
    it('throws when Delegation Framework contracts are unavailable for the configured chain', () => {
      expect(() =>
        setup({
          config: {
            chainId: '0xffffffff',
            delegateAddress: DELEGATE,
          },
        }),
      ).toThrow(
        `${SubscriptionDelegationServiceErrorMessage.DelegationContractsNotFound}: 0xffffffff`,
      );
    });
  });

  describe('prepareDelegation', () => {
    it('creates, verifies, persists, and registers a new delegation using config', async () => {
      const { service, mocks } = setup();

      const result = await service.prepareDelegation(REQUEST);

      expect(result.disposition).toBe('created');
      expect(result.delegationHash).toMatch(/^0x[0-9a-fA-F]{64}$/u);
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
      expectNoSideEffects(mocks);
    });

    it('rejects a chainId that does not match config before any side effects', async () => {
      const { service, mocks } = setup();

      await expect(
        service.prepareDelegation({
          ...REQUEST,
          chainId: '0x89',
        }),
      ).rejects.toThrow(
        SubscriptionDelegationServiceErrorMessage.ChainIdMismatch,
      );
      expectNoSideEffects(mocks);
    });

    it('accepts a matching chainId case-insensitively', async () => {
      const { service, mocks } = setup();

      const result = await service.prepareDelegation({
        ...REQUEST,
        chainId: '0X1' as Hex,
      });

      expect(result.disposition).toBe('created');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
    });
  });
});
