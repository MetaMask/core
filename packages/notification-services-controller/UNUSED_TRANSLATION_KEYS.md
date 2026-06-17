# Push notification i18n keys to migrate to the backend

`createOnChainPushNotificationMessage` now sources its `title`, `description`,
and `ctaLink` from the API-provided notification `template` field. As a result,
the `TranslationKeys` type and the `createOnChainPushNotificationMessages`
dictionary were removed from this package.

The following is the complete list of i18n keys that were used by
`createOnChainPushNotificationMessages` before these changes. They are listed
regardless of whether they are also used elsewhere — the point is that the copy
they produced now needs to be moved to the backend (provided via the notification
`template`), so each of these keys must have a corresponding backend translation.

| # | Translation key |
| --- | --- |
| 1 | `pushPlatformNotificationsFundsSentTitle` |
| 2 | `pushPlatformNotificationsFundsSentDescriptionDefault` |
| 3 | `pushPlatformNotificationsFundsSentDescription` |
| 4 | `pushPlatformNotificationsFundsReceivedTitle` |
| 5 | `pushPlatformNotificationsFundsReceivedDescriptionDefault` |
| 6 | `pushPlatformNotificationsFundsReceivedDescription` |
| 7 | `pushPlatformNotificationsSwapCompletedTitle` |
| 8 | `pushPlatformNotificationsSwapCompletedDescription` |
| 9 | `pushPlatformNotificationsNftSentTitle` |
| 10 | `pushPlatformNotificationsNftSentDescription` |
| 11 | `pushPlatformNotificationsNftReceivedTitle` |
| 12 | `pushPlatformNotificationsNftReceivedDescription` |
| 13 | `pushPlatformNotificationsStakingRocketpoolStakeCompletedTitle` |
| 14 | `pushPlatformNotificationsStakingRocketpoolStakeCompletedDescription` |
| 15 | `pushPlatformNotificationsStakingRocketpoolUnstakeCompletedTitle` |
| 16 | `pushPlatformNotificationsStakingRocketpoolUnstakeCompletedDescription` |
| 17 | `pushPlatformNotificationsStakingLidoStakeCompletedTitle` |
| 18 | `pushPlatformNotificationsStakingLidoStakeCompletedDescription` |
| 19 | `pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnTitle` |
| 20 | `pushPlatformNotificationsStakingLidoStakeReadyToBeWithdrawnDescription` |
| 21 | `pushPlatformNotificationsStakingLidoWithdrawalRequestedTitle` |
| 22 | `pushPlatformNotificationsStakingLidoWithdrawalRequestedDescription` |
| 23 | `pushPlatformNotificationsStakingLidoWithdrawalCompletedTitle` |
| 24 | `pushPlatformNotificationsStakingLidoWithdrawalCompletedDescription` |
