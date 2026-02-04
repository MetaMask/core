import { getAmount, formatAmount } from './get-notification-data';
import type { Types } from '../../NotificationServicesController';
import type { Constants } from '../../NotificationServicesController';

export type TranslationKeys = {
  pushPlatformNotificationsFundsSentTitle: () => string;
  pushPlatformNotificationsFundsSentDescriptionDefault: () => string;
  pushPlatformNotificationsFundsSentDescription: (
    ...args: [string, string]
  ) => string;
  pushPlatformNotificationsFundsReceivedTitle: () => string;
  pushPlatformNotificationsFundsReceivedDescriptionDefault: () => string;
  pushPlatformNotificationsFundsReceivedDescription: (
    ...args: [string, string]
  ) => string;
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
  ctaLink?: string;
};

type NotificationMessage<TNotification extends Types.INotification> = {
  title: (notification: TNotification) => string | null;
  defaultDescription: (notification: TNotification) => string | null;
  getDescription?: (notification: TNotification) => string | null;
  link?: (notification: TNotification) => string | null;
};

type NotificationMessageDict = {
  [TriggerType in Constants.TRIGGER_TYPES]?: NotificationMessage<
    Extract<Types.INotification, { type: TriggerType }>
  >;
};

/**
 * On Chain Push Notification Messages.
 * This is a list of all the push notifications we support. Update this for synced notifications on mobile and extension
 *
 * @param translationKeys - all translations supported
 * @returns A translation push message object.
 */
export const createOnChainPushNotificationMessages = (
  translationKeys: TranslationKeys,
): NotificationMessageDict => {
  type TranslationFn = <TKey extends keyof TranslationKeys>(
    ...args: [TKey, ...Parameters<TranslationKeys[TKey]>]
  ) => string;
  const translate: TranslationFn = (...args) => {
    const [key, ...otherArgs] = args;

    // Coerce types for the translation function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn: any = translationKeys[key];
    return fn(...otherArgs);
  };

  return {
    erc20_sent: {
      title: (): string | null =>
        translate('pushPlatformNotificationsFundsSentTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsFundsSentDescriptionDefault'),
      getDescription: (notification): string | null => {
        const symbol = notification?.payload?.data?.token?.symbol;
        const tokenAmount = notification?.payload?.data?.token?.amount;
        const tokenDecimals = notification?.payload?.data?.token?.decimals;
        if (!symbol || !tokenAmount || !tokenDecimals) {
          return null;
        }

        const amount = getAmount(tokenAmount, tokenDecimals, {
          shouldEllipse: true,
        });
        return translate(
          'pushPlatformNotificationsFundsSentDescription',
          amount,
          symbol,
        );
      },
    },
    eth_sent: {
      title: (): string | null =>
        translate('pushPlatformNotificationsFundsSentTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsFundsSentDescriptionDefault'),
      getDescription: (notification): string | null => {
        const symbol = notification?.payload?.network?.native_symbol;
        const tokenAmount = notification?.payload?.data?.amount?.eth;
        if (!symbol || !tokenAmount) {
          return null;
        }

        const amount = formatAmount(parseFloat(tokenAmount), {
          shouldEllipse: true,
        });
        return translate(
          'pushPlatformNotificationsFundsSentDescription',
          amount,
          symbol,
        );
      },
    },
    erc20_received: {
      title: (): string | null =>
        translate('pushPlatformNotificationsFundsReceivedTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsFundsReceivedDescriptionDefault'),
      getDescription: (notification): string | null => {
        const symbol = notification?.payload?.data?.token?.symbol;
        const tokenAmount = notification?.payload?.data?.token?.amount;
        const tokenDecimals = notification?.payload?.data?.token?.decimals;
        if (!symbol || !tokenAmount || !tokenDecimals) {
          return null;
        }

        const amount = getAmount(tokenAmount, tokenDecimals, {
          shouldEllipse: true,
        });
        return translate(
          'pushPlatformNotificationsFundsReceivedDescription',
          amount,
          symbol,
        );
      },
    },
    eth_received: {
      title: (): string | null =>
        translate('pushPlatformNotificationsFundsReceivedTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsFundsReceivedDescriptionDefault'),
      getDescription: (notification): string | null => {
        const symbol = notification?.payload?.network?.native_symbol;
        const tokenAmount = notification?.payload?.data?.amount?.eth;
        if (!symbol || !tokenAmount) {
          return null;
        }

        const amount = formatAmount(parseFloat(tokenAmount), {
          shouldEllipse: true,
        });
        return translate(
          'pushPlatformNotificationsFundsReceivedDescription',
          amount,
          symbol,
        );
      },
    },
    metamask_swap_completed: {
      title: (): string | null =>
        translate('pushPlatformNotificationsSwapCompletedTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsSwapCompletedDescription'),
    },
    erc721_sent: {
      title: (): string | null =>
        translate('pushPlatformNotificationsNftSentTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsNftSentDescription'),
    },
    erc1155_sent: {
      title: (): string | null =>
        translate('pushPlatformNotificationsNftSentTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsNftSentDescription'),
    },
    erc721_received: {
      title: (): string | null =>
        translate('pushPlatformNotificationsNftReceivedTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsNftReceivedDescription'),
    },
    erc1155_received: {
      title: (): string | null =>
        translate('pushPlatformNotificationsNftReceivedTitle'),
      defaultDescription: (): string | null =>
        translate('pushPlatformNotificationsNftReceivedDescription'),
    },
    rocketpool_stake_completed: {
      title: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingRocketpoolStakeCompletedTitle',
        ),
      defaultDescription: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingRocketpoolStakeCompletedDescription',
        ),
    },
    rocketpool_unstake_completed: {
      title: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingRocketpoolUnstakeCompletedTitle',
        ),
      defaultDescription: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingRocketpoolUnstakeCompletedDescription',
        ),
    },
    lido_stake_completed: {
      title: (): string | null =>
        translate('pushPlatformNotificationsStakingLidoStakeCompletedTitle'),
      defaultDescription: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingLidoStakeCompletedDescription',
        ),
    },
    lido_stake_ready_to_be_withdrawn: {
      title: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnTitle',
        ),
      defaultDescription: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnDescription',
        ),
    },
    lido_withdrawal_requested: {
      title: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingLidoWithdrawalRequestedTitle',
        ),
      defaultDescription: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingLidoWithdrawalRequestedDescription',
        ),
    },
    lido_withdrawal_completed: {
      title: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingLidoWithdrawalCompletedTitle',
        ),
      defaultDescription: (): string | null =>
        translate(
          'pushPlatformNotificationsStakingLidoWithdrawalCompletedDescription',
        ),
    },
    platform: {
      title: (notification): string | null => notification.template.title,
      defaultDescription: (notification): string | null =>
        notification.template.body,
      getDescription: (notification): string | null =>
        notification.template.body,
    },
  };
};

/**
 * Creates a push notification message based on the given on-chain raw notification.
 *
 * @param notification - processed notification.
 * @param translations - translates keys into text
 * @returns The push notification message object, or null if the notification is invalid.
 */
export function createOnChainPushNotificationMessage(
  notification: Types.INotification,
  translations: TranslationKeys,
): PushNotificationMessage | null {
  if (!notification?.type) {
    return null;
  }
  const notificationMessage =
    createOnChainPushNotificationMessages(translations)[notification.type];

  if (!notificationMessage) {
    return null;
  }

  let description: string | null = null;
  try {
    description =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notificationMessage?.getDescription?.(notification as any) ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notificationMessage.defaultDescription?.(notification as any) ??
      null;
  } catch {
    description =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notificationMessage.defaultDescription?.(notification as any) ?? null;
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    title: notificationMessage?.title?.(notification as any) ?? '', // Ensure title is always a string
    description: description ?? '', // Fallback to empty string if null
  };
}
