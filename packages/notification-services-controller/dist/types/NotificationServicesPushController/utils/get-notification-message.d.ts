import type { Types } from '../../NotificationServicesController';
import { Constants } from '../../NotificationServicesController';
export type TranslationKeys = {
    pushPlatformNotificationsFundsSentTitle: () => string;
    pushPlatformNotificationsFundsSentDescriptionDefault: () => string;
    pushPlatformNotificationsFundsSentDescription: (...args: [string, string]) => string;
    pushPlatformNotificationsFundsReceivedTitle: () => string;
    pushPlatformNotificationsFundsReceivedDescriptionDefault: () => string;
    pushPlatformNotificationsFundsReceivedDescription: (...args: [string, string]) => string;
    pushPlatformNotificationsSwapCompletedTitle: () => string;
    pushPlatformNotificationsSwapCompletedDescription: () => string;
    pushPlatformNotificationsNftSentTitle: () => string;
    pushPlatformNotificationsNftSentDescription: () => string;
    pushPlatformNotificationsNftReceivedTitle: () => string;
    pushPlatformNotificationsNftReceivedDescription: () => string;
    pushPlatformNotificationsStakingRocketpoolStakeCompletedTitle: () => string;
    pushPlatformNotificationsStakingRocketpoolStakeCompletedDescription: () => string;
    pushPlatformNotificationsStakingRocketpoolUnstakeCompletedTitle: () => string;
    pushPlatformNotificationsStakingRocketpoolUnstakeCompletedDescription: () => string;
    pushPlatformNotificationsStakingLidoStakeCompletedTitle: () => string;
    pushPlatformNotificationsStakingLidoStakeCompletedDescription: () => string;
    pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnTitle: () => string;
    pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnDescription: () => string;
    pushPlatformNotificationsStakingLidoWithdrawalRequestedTitle: () => string;
    pushPlatformNotificationsStakingLidoWithdrawalRequestedDescription: () => string;
    pushPlatformNotificationsStakingLidoWithdrawalCompletedTitle: () => string;
    pushPlatformNotificationsStakingLidoWithdrawalCompletedDescription: () => string;
};
type PushNotificationMessage = {
    title: string;
    description: string;
};
type NotificationMessage<N extends Types.INotification> = {
    title: string | null;
    defaultDescription: string | null;
    getDescription?: (n: N) => string | null;
};
type NotificationMessageDict = {
    [K in Constants.TRIGGER_TYPES]?: NotificationMessage<Extract<Types.INotification, {
        type: K;
    }>>;
};
/**
 * On Chain Push Notification Messages.
 * This is a list of all the push notifications we support. Update this for synced notifications on mobile and extension
 *
 * @param translationKeys - all translations supported
 * @returns A translation push message object.
 */
export declare const createOnChainPushNotificationMessages: (translationKeys: TranslationKeys) => NotificationMessageDict;
/**
 * Checks if the given value is an OnChainRawNotification object.
 *
 * @param n - The value to check.
 * @returns True if the value is an OnChainRawNotification object, false otherwise.
 */
export declare function isOnChainNotification(n: unknown): n is Types.OnChainRawNotification;
/**
 * Creates a push notification message based on the given on-chain raw notification.
 *
 * @param n - processed notification.
 * @param translations - translates keys into text
 * @returns The push notification message object, or null if the notification is invalid.
 */
export declare function createOnChainPushNotificationMessage(n: Types.INotification, translations: TranslationKeys): PushNotificationMessage | null;
export {};
//# sourceMappingURL=get-notification-message.d.ts.map