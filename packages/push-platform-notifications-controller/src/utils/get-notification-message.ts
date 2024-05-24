// We are defining that this file uses a webworker global scope.
// eslint-disable-next-line spaced-comment
/// <reference lib="webworker" />

import { CHAIN_SYMBOLS } from '@metamask/notifications-controller/constants/notification-schema';
import type { TRIGGER_TYPES } from '@metamask/notifications-controller/constants/notification-schema';
import type { OnChainRawNotification } from '@metamask/notifications-controller/types/on-chain-notification/on-chain-notification';

import { t } from '../../../translate';
import { getAmount, formatAmount } from './get-notification-data';

type PushNotificationMessage = {
  title: string;
  description: string;
};

type NotificationMessage<
  N extends OnChainRawNotification = OnChainRawNotification,
> = {
  title: string | null;
  defaultDescription: string | null;
  getDescription?: (n: N) => string | null;
};

type NotificationMessageDict = {
  [K in TRIGGER_TYPES]?: NotificationMessage<
    Extract<OnChainRawNotification, { data: { kind: `${K}` } }>
  >;
};

const sw = self as unknown as ServiceWorkerGlobalScope;

/**
 * Retrieves the symbol associated with a given chain ID.
 *
 * @param chainId - The ID of the chain.
 * @returns The symbol associated with the chain ID, or null if not found.
 */
function getChainSymbol(chainId: number) {
  return CHAIN_SYMBOLS[chainId] ?? null;
}

/**
 * Handles the push notification event.
 *
 * @param notification - The push notification object.
 * @returns A promise that resolves when the notification is handled.
 */
export async function onPushNotification(notification: unknown): Promise<void> {
  if (!notification) {
    return;
  }
  if (!isOnChainNotification(notification)) {
    return;
  }

  const notificationMessage = createNotificationMessage(notification);
  if (!notificationMessage) {
    return;
  }

  const registration = sw?.registration;
  if (!registration) {
    return;
  }

  await registration.showNotification(notificationMessage.title, {
    body: notificationMessage.description,
    icon: './images/icon-64.png',
    tag: notification?.id,
    data: notification,
  });
}

/**
 * Handles the click event when a notification is clicked.
 *
 * @param event - The event object containing information about the notification click.
 * @returns A promise that resolves when the notification is closed and the user is navigated to the appropriate page.
 */
export async function onNotificationClick(event: NotificationEvent) {
  // Close notification
  event.notification.close();

  // Get Data
  const data: OnChainRawNotification = event?.notification?.data;

  // Navigate
  const destination = `chrome-extension://${sw.location.host}/home.html#notifications/${data.id}`;
  event.waitUntil(sw.clients.openWindow(destination));
}

/**
 * Checks if the given value is an OnChainRawNotification object.
 *
 * @param n - The value to check.
 * @returns True if the value is an OnChainRawNotification object, false otherwise.
 */
function isOnChainNotification(n: unknown): n is OnChainRawNotification {
  const assumed = n as OnChainRawNotification;

  // We don't have a validation/parsing library to check all possible types of an on chain notification
  // It is safe enough just to check "some" fields, and catch any errors down the line if the shape is bad.
  const isValidEnoughToBeOnChainNotification = [
    assumed?.id,
    assumed?.data,
    assumed?.trigger_id,
  ].every((field) => field !== undefined);
  return isValidEnoughToBeOnChainNotification;
}

const notificationMessageDict: NotificationMessageDict = {
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
      return t('pushPlatformNotificationsFundsSentDescription', amount, symbol);
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
      return t('pushPlatformNotificationsFundsSentDescription', amount, symbol);
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
    defaultDescription: t('pushPlatformNotificationsSwapCompletedDescription'),
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
    title: t('pushPlatformNotificationsStakingRocketpoolUnstakeCompletedTitle'),
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

/**
 * Creates a push notification message based on the given on-chain raw notification.
 *
 * @param n - The on-chain raw notification object.
 * @returns The push notification message object, or null if the notification is invalid.
 */
export function createNotificationMessage(
  n: OnChainRawNotification,
): PushNotificationMessage | null {
  if (!n?.data?.kind) {
    return null;
  }
  const notificationMessage = notificationMessageDict[n.data.kind] as
    | NotificationMessage
    | undefined;

  if (!notificationMessage) {
    return null;
  }

  let description: string | null = null;
  try {
    description =
      notificationMessage?.getDescription?.(n) ??
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
