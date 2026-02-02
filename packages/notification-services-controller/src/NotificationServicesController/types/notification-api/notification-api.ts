// Types derived from external Notification API schema - naming follows API conventions
/* eslint-disable @typescript-eslint/naming-convention */
import type { components } from './schema';
import type { TRIGGER_TYPES } from '../../constants/notification-schema';
import type { Compute } from '../type-utils';

export type Data_MetamaskSwapCompleted =
  components['schemas']['Data_MetamaskSwapCompleted'];
export type Data_LidoStakeReadyToBeWithdrawn =
  components['schemas']['Data_LidoStakeReadyToBeWithdrawn'];
export type Data_LidoStakeCompleted =
  components['schemas']['Data_LidoStakeCompleted'];
export type Data_LidoWithdrawalRequested =
  components['schemas']['Data_LidoWithdrawalRequested'];
export type Data_LidoWithdrawalCompleted =
  components['schemas']['Data_LidoWithdrawalCompleted'];
export type Data_RocketPoolStakeCompleted =
  components['schemas']['Data_RocketPoolStakeCompleted'];
export type Data_RocketPoolUnstakeCompleted =
  components['schemas']['Data_RocketPoolUnstakeCompleted'];
export type Data_ETHSent = components['schemas']['Data_ETHSent'];
export type Data_ETHReceived = components['schemas']['Data_ETHReceived'];
export type Data_ERC20Sent = components['schemas']['Data_ERC20Sent'];
export type Data_ERC20Received = components['schemas']['Data_ERC20Received'];
export type Data_ERC721Sent = components['schemas']['Data_ERC721Sent'];
export type Data_ERC721Received = components['schemas']['Data_ERC721Received'];

type Notification = components['schemas']['NotificationOutputV3'][number];
type PlatformNotification = Extract<
  Notification,
  { notification_type: 'platform' }
>;
type OnChainNotification = Extract<
  Notification,
  { notification_type: 'on-chain' }
>;

type ConvertToEnum<Kind> = {
  [K in TRIGGER_TYPES]: Kind extends `${K}` ? K : never;
}[TRIGGER_TYPES];

/**
 * Type-Computation.
 * Adds a `type` field to on-chain notifications for easier enum checking.
 * Preserves the original nested payload structure.
 */
type NormalizeOnChainNotification<
  N extends OnChainNotification = OnChainNotification,
  NotificationDataKinds extends string = NonNullable<
    N['payload']['data']
  >['kind'],
> = {
  [K in NotificationDataKinds]: Compute<
    Omit<N, 'payload'> & {
      type: ConvertToEnum<K>;
      payload: Compute<
        Omit<N['payload'], 'data'> & {
          data: Extract<NonNullable<N['payload']['data']>, { kind: K }>;
        }
      >;
    }
  >;
}[NotificationDataKinds];

/**
 * Type-Computation.
 * Adds a `type` field to platform notifications for easier enum checking.
 * Preserves the original nested payload structure.
 */
type NormalizePlatformNotification<
  N extends PlatformNotification = PlatformNotification,
  NotificationKind extends string = N['notification_type'],
> = {
  [K in NotificationKind]: Compute<
    N & {
      type: ConvertToEnum<K>;
    }
  >;
}[NotificationKind];

export type OnChainRawNotification = Compute<
  NormalizeOnChainNotification<OnChainNotification>
>;

export type PlatformRawNotification = Compute<
  NormalizePlatformNotification<PlatformNotification>
>;

export type UnprocessedRawNotification = Notification;

export type NormalisedAPINotification =
  | OnChainRawNotification
  | PlatformRawNotification;

export type OnChainRawNotificationsWithNetworkFields = Extract<
  OnChainRawNotification,
  { payload: { data: { network_fee: unknown } } }
>;
