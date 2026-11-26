import type { DerivedIdentityMigration } from '@metamask/chomp-api-service';
import {
  CRYPTO_AUTH_METHODS,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  SUBSCRIPTION_STATUSES,
} from '@metamask/subscription-controller';
import type {
  RecurringInterval,
  Subscription,
  SubscriptionCryptoPaymentMethod,
} from '@metamask/subscription-controller';
import type { Hex } from '@metamask/utils';

import type {
  BindingMigrationContext,
  BindingMigrationResult,
  BindingMigrator,
  BindingMigratorStatus,
} from './binding-migration.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycleControllerMessenger } from './money-account-lifecycle-controller.js';

export const MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_ID = 'money-account-plus-payer';

const MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_TIMEOUT_MS = 60_000;

const ACTIVE_SUBSCRIPTION_STATUSES: string[] = [
  SUBSCRIPTION_STATUSES.active,
  SUBSCRIPTION_STATUSES.trialing,
  SUBSCRIPTION_STATUSES.provisional,
];

const NO_ELIGIBLE_SUBSCRIPTION_REASON =
  'The premium migration needs an active Money Account Plus subscription paid in crypto by the Money Account or the MPC Money Account';

type MoneyAccountPlusCryptoPayment = {
  subscription: Subscription;
  cryptoPayment: SubscriptionCryptoPaymentMethod['crypto'];
  payerAddress: string;
};

/**
 * Creates the binding migrator that moves an active Money Account Plus
 * subscription paid by the Money Account to the MPC Money Account, in the
 * `afterLink` phase, because CHOMP only accepts the intents of a premium
 * migration once the successor holds the premium eligibility. The MPC Money
 * Account signs a new subscription delegation, which also registers its
 * subscription intent, and becomes the payer of the subscription.
 *
 * `SubscriptionController:updatePaymentMethod` takes no idempotency key, so
 * instead of one, `reconcile` reads the payer fresh first and only moves a
 * subscription the Money Account still pays.
 *
 * @param args - The arguments.
 * @param args.messenger - The messenger of `MoneyAccountLifecycleController`.
 * @param args.getLifecycle - Returns the recorded lifecycle of a Money
 * Account address.
 * @returns The binding migrator.
 */
export function createMoneyAccountPlusPayerMigrator({
  messenger,
  getLifecycle,
}: {
  messenger: MoneyAccountLifecycleControllerMessenger;
  getLifecycle: (address: string) => MoneyAccountLifecycle | undefined;
}): BindingMigrator {
  return {
    id: MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_ID,
    phase: 'afterLink',
    timeoutMs: MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_TIMEOUT_MS,
    reconcile: async (context) => await reconcile(messenger, context),
    getStatus: (context) => getStatus(messenger, getLifecycle, context),
  };
}

/**
 * Moves the subscription when the Money Account pays for it. If CHOMP still
 * reports the subscription intent of the MPC Money Account missing once that
 * account pays, its subscription delegation is prepared again to register the
 * intent. If CHOMP reports it missing and neither account pays, the
 * migration cannot complete.
 *
 * @param messenger - The messenger of `MoneyAccountLifecycleController`.
 * @param context - The binding migration context.
 * @returns The result of the run.
 */
async function reconcile(
  messenger: MoneyAccountLifecycleControllerMessenger,
  context: BindingMigrationContext,
): Promise<BindingMigrationResult> {
  const { previousAddress, currentAddress } = context;
  const payment = findMoneyAccountPlusCryptoPayment(
    await messenger.call('SubscriptionController:getSubscriptions'),
  );

  if (payment?.payerAddress === previousAddress) {
    const { subscription, cryptoPayment } = payment;
    const recurringInterval = subscription.interval;
    const billingCycles = await getMoneyAccountPlusBillingCycles(
      messenger,
      recurringInterval,
    );
    const delegationHash = await prepareSubscriptionDelegation(
      messenger,
      currentAddress,
      recurringInterval,
    );
    await messenger.call('SubscriptionController:updatePaymentMethod', {
      paymentType: PAYMENT_TYPES.byCrypto,
      subscriptionId: subscription.id,
      chainId: cryptoPayment.chainId,
      payerAddress: currentAddress,
      tokenSymbol: cryptoPayment.tokenSymbol,
      recurringInterval,
      billingCycles,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
      delegationHash,
    });
    return { status: 'completed' };
  }

  const response = await messenger.call(
    'ChompApiService:getDerivedIdentityByAddress',
    previousAddress,
  );
  const isIntentMissing = isSubscriptionIntentMissing(
    response?.identity.migration,
  );

  if (payment?.payerAddress === currentAddress) {
    if (isIntentMissing) {
      await prepareSubscriptionDelegation(
        messenger,
        currentAddress,
        payment.subscription.interval,
      );
    }
    return { status: 'completed' };
  }

  return isIntentMissing
    ? { status: 'blocked', reason: NO_ELIGIBLE_SUBSCRIPTION_REASON }
    : { status: 'not_required' };
}

/**
 * Reads the status from `SubscriptionController`'s state and the recorded
 * identity of the Money Account, without calling any backend.
 *
 * @param messenger - The messenger of `MoneyAccountLifecycleController`.
 * @param getLifecycle - Returns the recorded lifecycle of a Money Account
 * address.
 * @param context - The binding migration context.
 * @returns The status.
 */
function getStatus(
  messenger: MoneyAccountLifecycleControllerMessenger,
  getLifecycle: (address: string) => MoneyAccountLifecycle | undefined,
  context: BindingMigrationContext,
): BindingMigratorStatus {
  const { previousAddress, currentAddress } = context;
  const { subscriptions } = messenger.call('SubscriptionController:getState');
  const payment = findMoneyAccountPlusCryptoPayment(subscriptions);
  if (payment?.payerAddress === previousAddress) {
    return { status: 'pending' };
  }
  if (payment?.payerAddress === currentAddress) {
    return { status: 'completed' };
  }

  const lifecycle = getLifecycle(previousAddress);
  const migration =
    lifecycle?.type === 'migrating' ? lifecycle.identity.migration : null;
  return {
    status: isSubscriptionIntentMissing(migration) ? 'blocked' : 'not_required',
  };
}

function findMoneyAccountPlusCryptoPayment(
  subscriptions: Subscription[],
): MoneyAccountPlusCryptoPayment | undefined {
  const subscription = subscriptions.find(isActiveMoneyAccountPlusSubscription);
  if (subscription?.paymentMethod.type !== PAYMENT_TYPES.byCrypto) {
    return undefined;
  }
  const cryptoPayment = subscription.paymentMethod.crypto;
  return {
    subscription,
    cryptoPayment,
    payerAddress: cryptoPayment.payerAddress.toLowerCase(),
  };
}

function isActiveMoneyAccountPlusSubscription(
  subscription: Subscription,
): boolean {
  return (
    ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
    subscription.products.some(
      (product) => product.name === PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
    )
  );
}

function isSubscriptionIntentMissing(
  migration: DerivedIdentityMigration | null | undefined,
): boolean {
  return (
    migration?.steps.some(
      ({ step, completed }) =>
        step === 'SUCCESSOR_SUBSCRIPTION_INTENT' && !completed,
    ) ?? false
  );
}

async function prepareSubscriptionDelegation(
  messenger: MoneyAccountLifecycleControllerMessenger,
  payerAddress: Hex,
  recurringInterval: RecurringInterval,
): Promise<Hex> {
  const { delegationHash } = await messenger.call(
    'SubscriptionDelegationService:prepareDelegation',
    {
      product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
      recurringInterval,
      payerAddress,
      isTrialRequested: false,
    },
  );
  return delegationHash;
}

async function getMoneyAccountPlusBillingCycles(
  messenger: MoneyAccountLifecycleControllerMessenger,
  recurringInterval: RecurringInterval,
): Promise<number> {
  const pricing = await messenger.call('SubscriptionController:getPricing');
  const price = pricing.products
    .find((product) => product.name === PRODUCT_TYPES.MONEY_ACCOUNT_PLUS)
    ?.prices.find((entry) => entry.interval === recurringInterval);
  if (!price) {
    throw new Error(`Money Account Plus has no '${recurringInterval}' price`);
  }
  return price.minBillingCycles;
}
