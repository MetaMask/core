import type { TRIGGER_TYPES } from '../../constants/notification-schema';
import type { TypeFeatureAnnouncement } from './type-feature-announcement';
export type FeatureAnnouncementRawNotificationData = Omit<TypeFeatureAnnouncement['fields'], 'image' | 'longDescription' | 'extensionLink' | 'link' | 'action'> & {
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
    extensionLink?: {
        extensionLinkText: string;
        extensionLinkRoute: string;
    };
};
export type FeatureAnnouncementRawNotification = {
    type: TRIGGER_TYPES.FEATURES_ANNOUNCEMENT;
    createdAt: string;
    data: FeatureAnnouncementRawNotificationData;
};
//# sourceMappingURL=feature-announcement.d.ts.map