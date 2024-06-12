/* eslint-disable @typescript-eslint/naming-convention */
import type { Types } from '../../NotificationServicesController';
import { Constants } from '../../NotificationServicesController';
import { getAmount, formatAmount } from './get-notification-data';

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
};

type NotificationMessage<N extends Types.INotification> = {
  title: string | null;
  defaultDescription: string | null;
  getDescription?: (n: N) => string | null;
};

type NotificationMessageDict = {
  [K in Constants.TRIGGER_TYPES]?: NotificationMessage<
    Extract<Types.INotification, { type: K }>
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
  type TranslationFn = <K extends keyof TranslationKeys>(
    ...args: [K, ...Parameters<TranslationKeys[K]>]
  ) => string;
  const t: TranslationFn = (...args) => {
    const [key, ...otherArgs] = args;

    // Coerce types for the translation function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn: any = translationKeys[key];
    return fn(...otherArgs);
  };

  return {
    erc20_sent: {
      title: t('pushPlatformNotificationsFundsSentTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsFundsSentDescriptionDefault',
      ),
      getDescription: (n) => {
        const symbol = n?.data?.token?.symbol;
        const tokenAmount = n?.data?.token?.amount;
        const tokenDecimals = n?.data?.token?.decimals;
        if (!symbol || !tokenAmount || !tokenDecimals) {
          return null;
        }

        const amount = getAmount(tokenAmount, tokenDecimals, {
          shouldEllipse: true,
        });
        return t(
          'pushPlatformNotificationsFundsSentDescription',
          amount,
          symbol,
        );
      },
    },
    eth_sent: {
      title: t('pushPlatformNotificationsFundsSentTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsFundsSentDescriptionDefault',
      ),
      getDescription: (n) => {
        const symbol = getChainSymbol(n?.chain_id);
        const tokenAmount = n?.data?.amount?.eth;
        if (!symbol || !tokenAmount) {
          return null;
        }

        const amount = formatAmount(parseFloat(tokenAmount), {
          shouldEllipse: true,
        });
        return t(
          'pushPlatformNotificationsFundsSentDescription',
          amount,
          symbol,
        );
      },
    },
    erc20_received: {
      title: t('pushPlatformNotificationsFundsReceivedTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsFundsReceivedDescriptionDefault',
      ),
      getDescription: (n) => {
        const symbol = n?.data?.token?.symbol;
        const tokenAmount = n?.data?.token?.amount;
        const tokenDecimals = n?.data?.token?.decimals;
        if (!symbol || !tokenAmount || !tokenDecimals) {
          return null;
        }

        const amount = getAmount(tokenAmount, tokenDecimals, {
          shouldEllipse: true,
        });
        return t(
          'pushPlatformNotificationsFundsReceivedDescription',
          amount,
          symbol,
        );
      },
    },
    eth_received: {
      title: t('pushPlatformNotificationsFundsReceivedTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsFundsReceivedDescriptionDefault',
      ),
      getDescription: (n) => {
        const symbol = getChainSymbol(n?.chain_id);
        const tokenAmount = n?.data?.amount?.eth;
        if (!symbol || !tokenAmount) {
          return null;
        }

        const amount = formatAmount(parseFloat(tokenAmount), {
          shouldEllipse: true,
        });
        return t(
          'pushPlatformNotificationsFundsReceivedDescription',
          amount,
          symbol,
        );
      },
    },
    metamask_swap_completed: {
      title: t('pushPlatformNotificationsSwapCompletedTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsSwapCompletedDescription',
      ),
    },
    erc721_sent: {
      title: t('pushPlatformNotificationsNftSentTitle'),
      defaultDescription: t('pushPlatformNotificationsNftSentDescription'),
    },
    erc1155_sent: {
      title: t('pushPlatformNotificationsNftSentTitle'),
      defaultDescription: t('pushPlatformNotificationsNftSentDescription'),
    },
    erc721_received: {
      title: t('pushPlatformNotificationsNftReceivedTitle'),
      defaultDescription: t('pushPlatformNotificationsNftReceivedDescription'),
    },
    erc1155_received: {
      title: t('pushPlatformNotificationsNftReceivedTitle'),
      defaultDescription: t('pushPlatformNotificationsNftReceivedDescription'),
    },
    rocketpool_stake_completed: {
      title: t('pushPlatformNotificationsStakingRocketpoolStakeCompletedTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsStakingRocketpoolStakeCompletedDescription',
      ),
    },
    rocketpool_unstake_completed: {
      title: t(
        'pushPlatformNotificationsStakingRocketpoolUnstakeCompletedTitle',
      ),
      defaultDescription: t(
        'pushPlatformNotificationsStakingRocketpoolUnstakeCompletedDescription',
      ),
    },
    lido_stake_completed: {
      title: t('pushPlatformNotificationsStakingLidoStakeCompletedTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsStakingLidoStakeCompletedDescription',
      ),
    },
    lido_stake_ready_to_be_withdrawn: {
      title: t(
        'pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnTitle',
      ),
      defaultDescription: t(
        'pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnDescription',
      ),
    },
    lido_withdrawal_requested: {
      title: t('pushPlatformNotificationsStakingLidoWithdrawalRequestedTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsStakingLidoWithdrawalRequestedDescription',
      ),
    },
    lido_withdrawal_completed: {
      title: t('pushPlatformNotificationsStakingLidoWithdrawalCompletedTitle'),
      defaultDescription: t(
        'pushPlatformNotificationsStakingLidoWithdrawalCompletedDescription',
      ),
    },
  };
};

/**
 * Retrieves the symbol associated with a given chain ID.
 *
 * @param chainId - The ID of the chain.
 * @returns The symbol associated with the chain ID, or null if not found.
 */
function getChainSymbol(chainId: number) {
  return Constants.CHAIN_SYMBOLS[chainId] ?? null;
}

/**
 * Checks if the given value is an OnChainRawNotification object.
 *
 * @param n - The value to check.
 * @returns True if the value is an OnChainRawNotification object, false otherwise.
 */
export function isOnChainNotification(
  n: unknown,
): n is Types.OnChainRawNotification {
  const assumed = n as Types.OnChainRawNotification;

  // We don't have a validation/parsing library to check all possible types of an on chain notification
  // It is safe enough just to check "some" fields, and catch any errors down the line if the shape is bad.
  const isValidEnoughToBeOnChainNotification = [
    assumed?.id,
    assumed?.data,
    assumed?.trigger_id,
  ].every((field) => field !== undefined);
  return isValidEnoughToBeOnChainNotification;
}

/**
 * Creates a push notification message based on the given on-chain raw notification.
 *
 * @param n - processed notification.
 * @param translations - translates keys into text
 * @returns The push notification message object, or null if the notification is invalid.
 */
export function createOnChainPushNotificationMessage(
  n: Types.INotification,
  translations: TranslationKeys,
): PushNotificationMessage | null {
  if (!n?.type) {
    return null;
  }
  const notificationMessage =
    createOnChainPushNotificationMessages(translations)[n.type];

  if (!notificationMessage) {
    return null;
  }

  let description: string | null = null;
  try {
    description =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notificationMessage?.getDescription?.(n as any) ??
      notificationMessage.defaultDescription ??
      null;
  } catch (e) {
    description = notificationMessage.defaultDescription ?? null;
  }

  return {
    title: notificationMessage.title ?? '', // Ensure title is always a string
    description: description ?? '', // Fallback to empty string if null
  };
}
