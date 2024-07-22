import {
  processFeatureAnnouncement
} from "./chunk-D42BBXBM.mjs";

// src/NotificationServicesController/services/feature-announcements.ts
import { documentToHtmlString } from "@contentful/rich-text-html-renderer";
var DEFAULT_SPACE_ID = ":space_id";
var DEFAULT_ACCESS_TOKEN = ":access_token";
var DEFAULT_CLIENT_ID = ":client_id";
var FEATURE_ANNOUNCEMENT_API = `https://cdn.contentful.com/spaces/${DEFAULT_SPACE_ID}/environments/master/entries`;
var FEATURE_ANNOUNCEMENT_URL = `${FEATURE_ANNOUNCEMENT_API}?access_token=${DEFAULT_ACCESS_TOKEN}&content_type=productAnnouncement&include=10&fields.clients=${DEFAULT_CLIENT_ID}`;
var getFeatureAnnouncementUrl = (env) => FEATURE_ANNOUNCEMENT_URL.replace(DEFAULT_SPACE_ID, env.spaceId).replace(DEFAULT_ACCESS_TOKEN, env.accessToken).replace(DEFAULT_CLIENT_ID, env.platform);
var fetchFeatureAnnouncementNotifications = async (env) => {
  const url = getFeatureAnnouncementUrl(env);
  const data = await fetch(url).then((r) => r.json()).catch(() => null);
  if (!data) {
    return [];
  }
  const findIncludedItem = (sysId) => {
    const typedData = data;
    const item = typedData?.includes?.Entry?.find((i) => i?.sys?.id === sysId) || typedData?.includes?.Asset?.find((i) => i?.sys?.id === sysId);
    return item ? item?.fields : null;
  };
  const contentfulNotifications = data?.items ?? [];
  const rawNotifications = contentfulNotifications.map((n) => {
    const { fields } = n;
    const imageFields = fields.image ? findIncludedItem(fields.image.sys.id) : void 0;
    const extensionLinkFields = fields.extensionLink ? findIncludedItem(
      fields.extensionLink.sys.id
    ) : void 0;
    const notification = {
      type: "features_announcement" /* FEATURES_ANNOUNCEMENT */,
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
          url: imageFields?.file?.url ?? ""
        },
        extensionLink: extensionLinkFields && {
          extensionLinkText: extensionLinkFields?.extensionLinkText,
          extensionLinkRoute: extensionLinkFields?.extensionLinkRoute
        }
      }
    };
    return notification;
  });
  return rawNotifications;
};
async function getFeatureAnnouncementNotifications(env) {
  if (env?.accessToken && env?.spaceId && env?.platform) {
    const rawNotifications = await fetchFeatureAnnouncementNotifications(env);
    const notifications = rawNotifications.map(
      (notification) => processFeatureAnnouncement(notification)
    );
    return notifications;
  }
  return [];
}

export {
  FEATURE_ANNOUNCEMENT_API,
  FEATURE_ANNOUNCEMENT_URL,
  getFeatureAnnouncementNotifications
};
//# sourceMappingURL=chunk-QFJZBLYQ.mjs.map