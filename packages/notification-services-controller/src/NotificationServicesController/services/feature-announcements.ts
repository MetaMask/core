import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import type { Entry, Asset, EntryCollection } from 'contentful';

import { TRIGGER_TYPES } from '../constants/notification-schema';
import { processFeatureAnnouncement } from '../processors/process-feature-announcement';
import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type {
  ImageFields,
  TypeFeatureAnnouncement,
} from '../types/feature-announcement/type-feature-announcement';
import type {
  TypeExternalLinkFields,
  TypePortfolioLinkFields,
  TypeExtensionLinkFields,
  TypeMobileLinkFields,
} from '../types/feature-announcement/type-links';
import type { INotification } from '../types/notification/notification';

const DEFAULT_SPACE_ID = ':space_id';
const DEFAULT_ACCESS_TOKEN = ':access_token';
const DEFAULT_CLIENT_ID = ':client_id';
const DEFAULT_DOMAIN = 'cdn.contentful.com';
const PREVIEW_DOMAIN = 'preview.contentful.com';
export const FEATURE_ANNOUNCEMENT_API = `https://${DEFAULT_DOMAIN}/spaces/${DEFAULT_SPACE_ID}/environments/master/entries`;
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

export const getFeatureAnnouncementUrl = (env: Env, previewToken?: string) => {
  const domain = previewToken ? PREVIEW_DOMAIN : DEFAULT_DOMAIN;
  return FEATURE_ANNOUNCEMENT_URL.replace(DEFAULT_SPACE_ID, env.spaceId)
    .replace(DEFAULT_ACCESS_TOKEN, previewToken || env.accessToken)
    .replace(DEFAULT_CLIENT_ID, env.platform)
    .replace(DEFAULT_DOMAIN, domain);
};

const fetchFeatureAnnouncementNotifications = async (
  env: Env,
  previewToken?: string,
): Promise<FeatureAnnouncementRawNotification[]> => {
  const url = getFeatureAnnouncementUrl(env, previewToken);

  const data = await fetch(url)
    .then((r) => r.json())
    .catch(() => null);

  if (!data) {
    return [];
  }

  const findIncludedItem = (sysId: string) => {
    const typedData: EntryCollection<
      | ImageFields
      | TypeExtensionLinkFields
      | TypePortfolioLinkFields
      | TypeMobileLinkFields
      | TypeExternalLinkFields
    > = data;
    const item =
      typedData?.includes?.Entry?.find((i: Entry) => i?.sys?.id === sysId) ||
      typedData?.includes?.Asset?.find((i: Asset) => i?.sys?.id === sysId);
    return item ? item?.fields : null;
  };

  const contentfulNotifications = data?.items ?? [];
  const rawNotifications: FeatureAnnouncementRawNotification[] =
    contentfulNotifications.map((n: TypeFeatureAnnouncement) => {
      const { fields } = n;
      const imageFields = fields.image
        ? (findIncludedItem(fields.image.sys.id) as ImageFields['fields'])
        : undefined;

      const externalLinkFields = fields.externalLink
        ? (findIncludedItem(
            fields.externalLink.sys.id,
          ) as TypeExternalLinkFields['fields'])
        : undefined;
      const portfolioLinkFields = fields.portfolioLink
        ? (findIncludedItem(
            fields.portfolioLink.sys.id,
          ) as TypePortfolioLinkFields['fields'])
        : undefined;
      const extensionLinkFields = fields.extensionLink
        ? (findIncludedItem(
            fields.extensionLink.sys.id,
          ) as TypeExtensionLinkFields['fields'])
        : undefined;
      const mobileLinkFields = fields.mobileLink
        ? (findIncludedItem(
            fields.mobileLink.sys.id,
          ) as TypeMobileLinkFields['fields'])
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
          externalLink: externalLinkFields && {
            externalLinkText: externalLinkFields?.externalLinkText,
            externalLinkUrl: externalLinkFields?.externalLinkUrl,
          },
          portfolioLink: portfolioLinkFields && {
            portfolioLinkText: portfolioLinkFields?.portfolioLinkText,
            portfolioLinkUrl: portfolioLinkFields?.portfolioLinkUrl,
          },
          extensionLink: extensionLinkFields && {
            extensionLinkText: extensionLinkFields?.extensionLinkText,
            extensionLinkRoute: extensionLinkFields?.extensionLinkRoute,
          },
          mobileLink: mobileLinkFields && {
            mobileLinkText: mobileLinkFields?.mobileLinkText,
            mobileLinkUrl: mobileLinkFields?.mobileLinkUrl,
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
 * @param previewToken - the preview token to use if needed
 * @returns Raw Feature Announcements
 */
export async function getFeatureAnnouncementNotifications(
  env: Env,
  previewToken?: string,
): Promise<INotification[]> {
  if (env?.accessToken && env?.spaceId && env?.platform) {
    const rawNotifications = await fetchFeatureAnnouncementNotifications(
      env,
      previewToken,
    );
    const notifications = rawNotifications.map((notification) =>
      processFeatureAnnouncement(notification),
    );

    return notifications;
  }

  return [];
}
