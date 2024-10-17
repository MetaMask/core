import { TRIGGER_TYPES } from '../..';
import type { FeatureAnnouncementRawNotification } from '../feature-announcement/feature-announcement';
import type { OnChainRawNotification } from '../on-chain-notification/on-chain-notification';
import type { Compute } from '../type-utils';

export type NotificationUnion =
  | FeatureAnnouncementRawNotification
  | OnChainRawNotification;

/**
 * The shape of a "generic" notification.
 * Other than the fields listed below, tt will also contain:
 * - `type` field (declared in the Raw shapes)
 * - `data` field (declared in the Raw shapes)
 */
export type INotification = Compute<
  NotificationUnion & {
    id: string;
    createdAt: string;
    isRead: boolean;
  }
>;

// NFT
export type NFT = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  token_id: string;
  image: string;
  collection?: {
    name: string;
    image: string;
  };
};

export type MarkAsReadNotificationsParam = Pick<
  INotification,
  'id' | 'type' | 'isRead'
>[];

// Testing the new Notification shape to see if we can discriminate
declare const notification: INotification;
//            ^?

if (notification.type === TRIGGER_TYPES.ERC20_SENT) {
  // this field does exist on erc20 sent
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _x = notification.tx_hash;
}

if (notification.type === TRIGGER_TYPES.AAVE_V3_HEALTH_FACTOR) {
  // @ts-expect-error - this field does not exist on aave v3 :)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _x = notification.tx_hash;
}
