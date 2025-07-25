export type SubscriptionControllerCheckSubscriptionStatusAction = {
  type: 'SubscriptionController:checkSubscriptionStatus';
  handler: (product: string) => Promise<'subscribed' | 'not-subscribed'>;
};
