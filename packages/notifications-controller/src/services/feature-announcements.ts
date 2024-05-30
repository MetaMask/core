import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import type { Entry, Asset } from 'contentful';
import log from 'loglevel';

import { FEATURE_ANNOUNCEMENT_URL } from '../constants/constants';
import { TRIGGER_TYPES } from '../constants/notification-schema';
import { processFeatureAnnouncement } from '../processors/process-feature-announcement';
import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type { TypeActionFields } from '../types/feature-announcement/type-action';
import type {
  TypeFeatureAnnouncement,
  ImageFields,
} from '../types/feature-announcement/type-feature-announcement';
import type { TypeLinkFields } from '../types/feature-announcement/type-link';
import type { Notification as INotification } from '../types/notification/notification';

export type ContentfulResult = {
  includes?: {
    Entry?: Entry[];
    Asset?: Asset[];
  };
  items?: TypeFeatureAnnouncement[];
};

/**
 *
 * @param url
 * @param retries
 * @param retryDelay
 */
async function fetchFromContentful(
  url: string,
  retries = 3,
  retryDelay = 1000,
): Promise<ContentfulResult | null> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Fetch failed with status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      }
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  log.error(
    `Error fetching from Contentful after ${retries} retries: ${lastError}`,
  );
  return null;
}

/**
 *
 */
async function fetchFeatureAnnouncementNotifications(): Promise<
  FeatureAnnouncementRawNotification[]
> {
  const data = await fetchFromContentful(FEATURE_ANNOUNCEMENT_URL);

  if (!data) {
    return [];
  }

  const findIncludedItem = (sysId: string) => {
    const item =
      data?.includes?.Entry?.find((i: Entry) => i?.sys?.id === sysId) ||
      data?.includes?.Asset?.find((i: Asset) => i?.sys?.id === sysId);
    return item ? item?.fields : null;
  };

  const contentfulNotifications = data?.items ?? [];
  const rawNotifications: FeatureAnnouncementRawNotification[] =
    contentfulNotifications.map((n: TypeFeatureAnnouncement) => {
      const { fields } = n;
      const imageFields = fields.image
        ? (findIncludedItem(fields.image.sys.id) as ImageFields['fields'])
        : undefined;
      const actionFields = fields.action
        ? (findIncludedItem(fields.action.sys.id) as TypeActionFields['fields'])
        : undefined;
      const linkFields = fields.link
        ? (findIncludedItem(fields.link.sys.id) as TypeLinkFields['fields'])
        : undefined;

      const notification: FeatureAnnouncementRawNotification = {
        type: TRIGGER_TYPES.FEATURES_ANNOUNCEMENT,
        createdAt: new Date(n.sys.createdAt).toString(),
        data: {
          id: fields.id,
          category: fields.category,
          title: fields.title,
          longDescription: documentToHtmlString(fields.longDescription),
          shortDescription: fields.shortDescription,
          image: {
            title: imageFields?.title,
            description: imageFields?.description,
            url: imageFields?.file?.url ?? '',
          },
          link: linkFields && {
            linkText: linkFields?.linkText,
            linkUrl: linkFields?.linkUrl,
            isExternal: linkFields?.isExternal,
          },
          action: actionFields && {
            actionText: actionFields?.actionText,
            actionUrl: actionFields?.actionUrl,
            isExternal: actionFields?.isExternal,
          },
        },
      };

      return notification;
    });

  return rawNotifications;
}

/**
 *
 */
export async function getFeatureAnnouncementNotifications(): Promise<
  INotification[]
> {
  const rawNotifications = await fetchFeatureAnnouncementNotifications();
  const notifications = rawNotifications.map((notification) =>
    processFeatureAnnouncement(notification),
  );

  return notifications;
}
