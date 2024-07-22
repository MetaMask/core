import type { Entry, Asset } from 'contentful';
import type { TypeFeatureAnnouncement } from '../types/feature-announcement/type-feature-announcement';
import type { INotification } from '../types/notification/notification';
export declare const FEATURE_ANNOUNCEMENT_API: string;
export declare const FEATURE_ANNOUNCEMENT_URL: string;
type Env = {
    spaceId: string;
    accessToken: string;
    platform: string;
};
/**
 * Contentful API Response Shape
 */
export type ContentfulResult = {
    includes?: {
        Entry?: Entry[];
        Asset?: Asset[];
    };
    items?: TypeFeatureAnnouncement[];
};
/**
 * Gets Feature Announcement from our services
 * @param env - environment for feature announcements
 * @returns Raw Feature Announcements
 */
export declare function getFeatureAnnouncementNotifications(env: Env): Promise<INotification[]>;
export {};
//# sourceMappingURL=feature-announcements.d.ts.map