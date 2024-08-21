import type { TRIGGER_TYPES } from '../../constants/notification-schema';
import type { TypeFeatureAnnouncement } from './type-feature-announcement';

export type FeatureAnnouncementRawNotificationData = Omit<
  TypeFeatureAnnouncement['fields'],
  'image' | 'longDescription' | 'extensionLink' | 'link' | 'action'
> & {
  longDescription: string;
  image: {
    title?: string;
    description?: string;
    url: string;
  };

  // External Link
  externalLink?: {
    externalLinkText: string;
    externalLinkUrl: string;
  };

  // Portfolio Link
  portfolioLink?: {
    portfolioLinkText: string;
    portfolioLinkUrl: string;
  };

  // Extension Link
  extensionLink?: {
    extensionLinkText: string;
    extensionLinkRoute: string;
  };

  // Mobile Link
  mobileLink?: {
    mobileLinkText: string;
    mobileLinkUrl: string;
  };
};

export type FeatureAnnouncementRawNotification = {
  type: TRIGGER_TYPES.FEATURES_ANNOUNCEMENT;
  createdAt: string;
  data: FeatureAnnouncementRawNotificationData;
};
