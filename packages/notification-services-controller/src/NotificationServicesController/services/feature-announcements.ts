import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import type { Entry, Asset } from 'contentful';
import log from 'loglevel';

import { TRIGGER_TYPES } from '../constants/notification-schema';
import { processFeatureAnnouncement } from '../processors/process-feature-announcement';
import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type {
  ImageFields,
  TypeFeatureAnnouncement,
} from '../types/feature-announcement/type-feature-announcement';
import type { TypeExtensionLinkFields } from '../types/feature-announcement/type-links';
import type { INotification } from '../types/notification/notification';

const DEFAULT_SPACE_ID = ':space_id';
const DEFAULT_ACCESS_TOKEN = ':access_token';
const DEFAULT_CLIENT_ID = ':client_id';
export const FEATURE_ANNOUNCEMENT_API = `https://cdn.contentful.com/spaces/${DEFAULT_SPACE_ID}/environments/master/entries`;
export const FEATURE_ANNOUNCEMENT_URL = `${FEATURE_ANNOUNCEMENT_API}?access_token=${DEFAULT_ACCESS_TOKEN}&content_type=productAnnouncement&include=10&fields.clients=${DEFAULT_CLIENT_ID}`;

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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Entry?: Entry[];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Asset?: Asset[];
  };
  items?: TypeFeatureAnnouncement[];
};

const fetchFromContentful = async (
  url: string,
  retries = 3,
  retryDelay = 1000,
): Promise<ContentfulResult | null> => {
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
    `Error fetching from Contentful after ${retries} retries:`,
    lastError,
  );
  return null;
};

const fetchFeatureAnnouncementNotifications = async (
  env: Env,
): Promise<FeatureAnnouncementRawNotification[]> => {
  const url = FEATURE_ANNOUNCEMENT_URL.replace(DEFAULT_SPACE_ID, env.spaceId)
    .replace(DEFAULT_ACCESS_TOKEN, env.accessToken)
    .replace(DEFAULT_CLIENT_ID, env.platform);
  const data = await fetchFromContentful(url);

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
      const extensionLinkFields = fields.extensionLink
        ? (findIncludedItem(
            fields.extensionLink.sys.id,
          ) as TypeExtensionLinkFields['fields'])
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
          extensionLink: extensionLinkFields && {
            extensionLinkText: extensionLinkFields?.extensionLinkText,
            extensionLinkRoute: extensionLinkFields?.extensionLinkRoute,
          },
        },
      };

      return notification;
    });

  return rawNotifications;
};

/**
 * Gets Feature Announcement from our services
 * @param env - environment for feature announcements
 * @returns Raw Feature Announcements
 */
export async function getFeatureAnnouncementNotifications(
  env: Env,
): Promise<INotification[]> {
  const rawNotifications = await fetchFeatureAnnouncementNotifications(env);
  const notifications = rawNotifications.map((notification) =>
    processFeatureAnnouncement(notification),
  );

  return notifications;
}
