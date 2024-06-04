import type { TriggerType } from '../../constants/notification-schema';
import type { TypeFeatureAnnouncement } from './type-feature-announcement';

export type FeatureAnnouncementRawNotificationData = Omit<
  TypeFeatureAnnouncement['fields'],
  'image' | 'longDescription' | 'link' | 'action'
> & {
  longDescription: string;
  image: {
    title?: string;
    description?: string;
    url: string;
  };
  link?: {
    linkText: string;
    linkUrl: string;
    isExternal: boolean;
  };
  action?: {
    actionText: string;
    actionUrl: string;
    isExternal: boolean;
  };
};

export type FeatureAnnouncementRawNotification = {
  type: TriggerType.FeaturesAnnouncement;
  createdAt: string;
  data: FeatureAnnouncementRawNotificationData;
};
