import type { TRIGGER_TYPES } from '../../constants';

export type ExpandedView = {
  title: string;
  interfaceId: string;
  footerLink?: { href: string; text: string };
};

export type RawSnapNotificationData =
  | {
      message: string;
      origin: string;
    }
  | { message: string; origin: string; detailedView: ExpandedView };

export type RawSnapNotification = {
  type: TRIGGER_TYPES.SNAP;
  data: RawSnapNotificationData;
  readDate: null;
};
