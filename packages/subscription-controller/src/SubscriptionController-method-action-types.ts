/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SubscriptionController } from './SubscriptionController';

/**
 * Gets the pricing information from the subscription service.
 *
 * @returns The pricing information.
 */
export type SubscriptionControllerGetPricingAction = {
  type: `SubscriptionController:getPricing`;
  handler: SubscriptionController['getPricing'];
};

export type SubscriptionControllerGetSubscriptionsAction = {
  type: `SubscriptionController:getSubscriptions`;
  handler: SubscriptionController['getSubscriptions'];
};

/**
 * Get the subscription by product.
 *
 * @param productType - The product type.
 * @returns The subscription.
 */
export type SubscriptionControllerGetSubscriptionByProductAction = {
  type: `SubscriptionController:getSubscriptionByProduct`;
  handler: SubscriptionController['getSubscriptionByProduct'];
};

/**
 * Get the subscriptions eligibilities.
 *
 * @param request - Optional request object containing user balance to check cohort eligibility.
 * @returns The subscriptions eligibilities.
 */
export type SubscriptionControllerGetSubscriptionsEligibilitiesAction = {
  type: `SubscriptionController:getSubscriptionsEligibilities`;
  handler: SubscriptionController['getSubscriptionsEligibilities'];
};

export type SubscriptionControllerCancelSubscriptionAction = {
  type: `SubscriptionController:cancelSubscription`;
  handler: SubscriptionController['cancelSubscription'];
};

export type SubscriptionControllerUnCancelSubscriptionAction = {
  type: `SubscriptionController:unCancelSubscription`;
  handler: SubscriptionController['unCancelSubscription'];
};

export type SubscriptionControllerStartShieldSubscriptionWithCardAction = {
  type: `SubscriptionController:startShieldSubscriptionWithCard`;
  handler: SubscriptionController['startShieldSubscriptionWithCard'];
};

export type SubscriptionControllerStartSubscriptionWithCryptoAction = {
  type: `SubscriptionController:startSubscriptionWithCrypto`;
  handler: SubscriptionController['startSubscriptionWithCrypto'];
};

/**
 * Handles shield subscription crypto approval transactions.
 *
 * @param txMeta - The transaction metadata.
 * @param isSponsored - Whether the transaction is sponsored.
 * @param rewardAccountId - The account ID of the reward subscription to link to the shield subscription.
 * @returns void
 */
export type SubscriptionControllerSubmitShieldSubscriptionCryptoApprovalAction =
  {
    type: `SubscriptionController:submitShieldSubscriptionCryptoApproval`;
    handler: SubscriptionController['submitShieldSubscriptionCryptoApproval'];
  };

/**
 * Get transaction params to create crypto approve transaction for subscription payment
 *
 * @param request - The request object
 * @param request.chainId - The chain ID
 * @param request.tokenAddress - The address of the token
 * @param request.productType - The product type
 * @param request.interval - The interval
 * @returns The crypto approve transaction params
 */
export type SubscriptionControllerGetCryptoApproveTransactionParamsAction = {
  type: `SubscriptionController:getCryptoApproveTransactionParams`;
  handler: SubscriptionController['getCryptoApproveTransactionParams'];
};

export type SubscriptionControllerUpdatePaymentMethodAction = {
  type: `SubscriptionController:updatePaymentMethod`;
  handler: SubscriptionController['updatePaymentMethod'];
};

/**
 * Gets the billing portal URL.
 *
 * @returns The billing portal URL
 */
export type SubscriptionControllerGetBillingPortalUrlAction = {
  type: `SubscriptionController:getBillingPortalUrl`;
  handler: SubscriptionController['getBillingPortalUrl'];
};

/**
 * Cache the last selected payment method for a specific product.
 *
 * @param product - The product to cache the payment method for.
 * @param paymentMethod - The payment method to cache.
 * @param paymentMethod.type - The type of the payment method.
 * @param paymentMethod.paymentTokenAddress - The payment token address.
 * @param paymentMethod.plan - The plan of the payment method.
 * @param paymentMethod.product - The product of the payment method.
 */
export type SubscriptionControllerCacheLastSelectedPaymentMethodAction = {
  type: `SubscriptionController:cacheLastSelectedPaymentMethod`;
  handler: SubscriptionController['cacheLastSelectedPaymentMethod'];
};

/**
 * Clear the last selected payment method for a specific product.
 *
 * @param product - The product to clear the payment method for.
 */
export type SubscriptionControllerClearLastSelectedPaymentMethodAction = {
  type: `SubscriptionController:clearLastSelectedPaymentMethod`;
  handler: SubscriptionController['clearLastSelectedPaymentMethod'];
};

/**
 * Submit sponsorship intents to the Subscription Service backend.
 *
 * This is intended to be used together with the crypto subscription flow.
 * When the user has enabled the smart transaction feature, we will sponsor the gas fees for the subscription approval transaction.
 *
 * @param request - Request object containing the address and products.
 * @example {
 * address: '0x1234567890123456789012345678901234567890',
 * products: [ProductType.Shield],
 * recurringInterval: RecurringInterval.Month,
 * billingCycles: 1,
 * }
 * @returns resolves to true if the sponsorship is supported and intents were submitted successfully, false otherwise
 */
export type SubscriptionControllerSubmitSponsorshipIntentsAction = {
  type: `SubscriptionController:submitSponsorshipIntents`;
  handler: SubscriptionController['submitSponsorshipIntents'];
};

/**
 * Submit a user event from the UI. (e.g. shield modal viewed)
 *
 * @param request - Request object containing the event to submit.
 * @example { event: SubscriptionUserEvent.ShieldEntryModalViewed, cohort: 'post_tx' }
 */
export type SubscriptionControllerSubmitUserEventAction = {
  type: `SubscriptionController:submitUserEvent`;
  handler: SubscriptionController['submitUserEvent'];
};

/**
 * Assign user to a cohort.
 *
 * @param request - Request object containing the cohort to assign the user to.
 * @example { cohort: 'post_tx' }
 */
export type SubscriptionControllerAssignUserToCohortAction = {
  type: `SubscriptionController:assignUserToCohort`;
  handler: SubscriptionController['assignUserToCohort'];
};

/**
 * Link rewards to a subscription.
 *
 * @param request - Request object containing the reward subscription ID.
 * @param request.subscriptionId - The ID of the subscription to link rewards to.
 * @param request.rewardAccountId - The account ID of the reward subscription to link to the subscription.
 * @example { subscriptionId: '1234567890', rewardAccountId: 'eip155:1:0x1234567890123456789012345678901234567890' }
 * @returns Resolves when the rewards are linked successfully.
 */
export type SubscriptionControllerLinkRewardsAction = {
  type: `SubscriptionController:linkRewards`;
  handler: SubscriptionController['linkRewards'];
};

/**
 * Calculate token approve amount from price info
 *
 * @param price - The price info
 * @param tokenPaymentInfo - The token price info
 * @returns The token approve amount
 */
export type SubscriptionControllerGetTokenApproveAmountAction = {
  type: `SubscriptionController:getTokenApproveAmount`;
  handler: SubscriptionController['getTokenApproveAmount'];
};

/**
 * Calculate token minimum balance amount from price info
 *
 * @param price - The price info
 * @param tokenPaymentInfo - The token price info
 * @returns The token balance amount
 */
export type SubscriptionControllerGetTokenMinimumBalanceAmountAction = {
  type: `SubscriptionController:getTokenMinimumBalanceAmount`;
  handler: SubscriptionController['getTokenMinimumBalanceAmount'];
};

/**
 * Clears the subscription state and resets to default values.
 */
export type SubscriptionControllerClearStateAction = {
  type: `SubscriptionController:clearState`;
  handler: SubscriptionController['clearState'];
};

/**
 * Triggers an access token refresh.
 */
export type SubscriptionControllerTriggerAccessTokenRefreshAction = {
  type: `SubscriptionController:triggerAccessTokenRefresh`;
  handler: SubscriptionController['triggerAccessTokenRefresh'];
};

/**
 * Union of all SubscriptionController action types.
 */
export type SubscriptionControllerMethodActions =
  | SubscriptionControllerGetPricingAction
  | SubscriptionControllerGetSubscriptionsAction
  | SubscriptionControllerGetSubscriptionByProductAction
  | SubscriptionControllerGetSubscriptionsEligibilitiesAction
  | SubscriptionControllerCancelSubscriptionAction
  | SubscriptionControllerUnCancelSubscriptionAction
  | SubscriptionControllerStartShieldSubscriptionWithCardAction
  | SubscriptionControllerStartSubscriptionWithCryptoAction
  | SubscriptionControllerSubmitShieldSubscriptionCryptoApprovalAction
  | SubscriptionControllerGetCryptoApproveTransactionParamsAction
  | SubscriptionControllerUpdatePaymentMethodAction
  | SubscriptionControllerGetBillingPortalUrlAction
  | SubscriptionControllerCacheLastSelectedPaymentMethodAction
  | SubscriptionControllerClearLastSelectedPaymentMethodAction
  | SubscriptionControllerSubmitSponsorshipIntentsAction
  | SubscriptionControllerSubmitUserEventAction
  | SubscriptionControllerAssignUserToCohortAction
  | SubscriptionControllerLinkRewardsAction
  | SubscriptionControllerGetTokenApproveAmountAction
  | SubscriptionControllerGetTokenMinimumBalanceAmountAction
  | SubscriptionControllerClearStateAction
  | SubscriptionControllerTriggerAccessTokenRefreshAction;
