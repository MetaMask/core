"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkEJ52BDLBjs = require('./chunk-EJ52BDLB.js');


var _chunkQY4UST5Vjs = require('./chunk-QY4UST5V.js');

// src/NotificationServicesPushController/utils/get-notification-message.ts
var createOnChainPushNotificationMessages = (translationKeys) => {
  const t = (...args) => {
    const [key, ...otherArgs] = args;
    const fn = translationKeys[key];
    return fn(...otherArgs);
  };
  return {
    erc20_sent: {
      title: t("pushPlatformNotificationsFundsSentTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsFundsSentDescriptionDefault"
      ),
      getDescription: (n) => {
        const symbol = n?.data?.token?.symbol;
        const tokenAmount = n?.data?.token?.amount;
        const tokenDecimals = n?.data?.token?.decimals;
        if (!symbol || !tokenAmount || !tokenDecimals) {
          return null;
        }
        const amount = _chunkEJ52BDLBjs.getAmount.call(void 0, tokenAmount, tokenDecimals, {
          shouldEllipse: true
        });
        return t(
          "pushPlatformNotificationsFundsSentDescription",
          amount,
          symbol
        );
      }
    },
    eth_sent: {
      title: t("pushPlatformNotificationsFundsSentTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsFundsSentDescriptionDefault"
      ),
      getDescription: (n) => {
        const symbol = getChainSymbol(n?.chain_id);
        const tokenAmount = n?.data?.amount?.eth;
        if (!symbol || !tokenAmount) {
          return null;
        }
        const amount = _chunkEJ52BDLBjs.formatAmount.call(void 0, parseFloat(tokenAmount), {
          shouldEllipse: true
        });
        return t(
          "pushPlatformNotificationsFundsSentDescription",
          amount,
          symbol
        );
      }
    },
    erc20_received: {
      title: t("pushPlatformNotificationsFundsReceivedTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsFundsReceivedDescriptionDefault"
      ),
      getDescription: (n) => {
        const symbol = n?.data?.token?.symbol;
        const tokenAmount = n?.data?.token?.amount;
        const tokenDecimals = n?.data?.token?.decimals;
        if (!symbol || !tokenAmount || !tokenDecimals) {
          return null;
        }
        const amount = _chunkEJ52BDLBjs.getAmount.call(void 0, tokenAmount, tokenDecimals, {
          shouldEllipse: true
        });
        return t(
          "pushPlatformNotificationsFundsReceivedDescription",
          amount,
          symbol
        );
      }
    },
    eth_received: {
      title: t("pushPlatformNotificationsFundsReceivedTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsFundsReceivedDescriptionDefault"
      ),
      getDescription: (n) => {
        const symbol = getChainSymbol(n?.chain_id);
        const tokenAmount = n?.data?.amount?.eth;
        if (!symbol || !tokenAmount) {
          return null;
        }
        const amount = _chunkEJ52BDLBjs.formatAmount.call(void 0, parseFloat(tokenAmount), {
          shouldEllipse: true
        });
        return t(
          "pushPlatformNotificationsFundsReceivedDescription",
          amount,
          symbol
        );
      }
    },
    metamask_swap_completed: {
      title: t("pushPlatformNotificationsSwapCompletedTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsSwapCompletedDescription"
      )
    },
    erc721_sent: {
      title: t("pushPlatformNotificationsNftSentTitle"),
      defaultDescription: t("pushPlatformNotificationsNftSentDescription")
    },
    erc1155_sent: {
      title: t("pushPlatformNotificationsNftSentTitle"),
      defaultDescription: t("pushPlatformNotificationsNftSentDescription")
    },
    erc721_received: {
      title: t("pushPlatformNotificationsNftReceivedTitle"),
      defaultDescription: t("pushPlatformNotificationsNftReceivedDescription")
    },
    erc1155_received: {
      title: t("pushPlatformNotificationsNftReceivedTitle"),
      defaultDescription: t("pushPlatformNotificationsNftReceivedDescription")
    },
    rocketpool_stake_completed: {
      title: t("pushPlatformNotificationsStakingRocketpoolStakeCompletedTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsStakingRocketpoolStakeCompletedDescription"
      )
    },
    rocketpool_unstake_completed: {
      title: t(
        "pushPlatformNotificationsStakingRocketpoolUnstakeCompletedTitle"
      ),
      defaultDescription: t(
        "pushPlatformNotificationsStakingRocketpoolUnstakeCompletedDescription"
      )
    },
    lido_stake_completed: {
      title: t("pushPlatformNotificationsStakingLidoStakeCompletedTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsStakingLidoStakeCompletedDescription"
      )
    },
    lido_stake_ready_to_be_withdrawn: {
      title: t(
        "pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnTitle"
      ),
      defaultDescription: t(
        "pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnDescription"
      )
    },
    lido_withdrawal_requested: {
      title: t("pushPlatformNotificationsStakingLidoWithdrawalRequestedTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsStakingLidoWithdrawalRequestedDescription"
      )
    },
    lido_withdrawal_completed: {
      title: t("pushPlatformNotificationsStakingLidoWithdrawalCompletedTitle"),
      defaultDescription: t(
        "pushPlatformNotificationsStakingLidoWithdrawalCompletedDescription"
      )
    }
  };
};
function getChainSymbol(chainId) {
  return _chunkQY4UST5Vjs.constants_exports.CHAIN_SYMBOLS[chainId] ?? null;
}
function isOnChainNotification(n) {
  const assumed = n;
  const isValidEnoughToBeOnChainNotification = [
    assumed?.id,
    assumed?.data,
    assumed?.trigger_id
  ].every((field) => field !== void 0);
  return isValidEnoughToBeOnChainNotification;
}
function createOnChainPushNotificationMessage(n, translations) {
  if (!n?.type) {
    return null;
  }
  const notificationMessage = createOnChainPushNotificationMessages(translations)[n.type];
  if (!notificationMessage) {
    return null;
  }
  let description = null;
  try {
    description = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notificationMessage?.getDescription?.(n) ?? notificationMessage.defaultDescription ?? null;
  } catch (e) {
    description = notificationMessage.defaultDescription ?? null;
  }
  return {
    title: notificationMessage.title ?? "",
    // Ensure title is always a string
    description: description ?? ""
    // Fallback to empty string if null
  };
}





exports.createOnChainPushNotificationMessages = createOnChainPushNotificationMessages; exports.isOnChainNotification = isOnChainNotification; exports.createOnChainPushNotificationMessage = createOnChainPushNotificationMessage;
//# sourceMappingURL=chunk-BUT7X5F2.js.map