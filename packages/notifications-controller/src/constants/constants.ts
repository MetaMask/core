export const USER_STORAGE_VERSION = '1';

// Force cast. We don't really care about the type here since we treat it as a unique symbol
export const USER_STORAGE_VERSION_KEY: unique symbol = 'v' as never;

export const CONTENTFUL_ACCESS_SPACE_ID = '';
export const CONTENTFUL_ACCESS_TOKEN = '';
export const FEATURE_ANNOUNCEMENT_URL = `https://cdn.contentful.com/spaces/${CONTENTFUL_ACCESS_SPACE_ID}/environments/master/entries?access_token=${CONTENTFUL_ACCESS_TOKEN}&content_type=productAnnouncement&include=10&fields.clients=extension`;

export const TRIGGERS_SERVICE_URL = '';
export const NOTIFICATIONS_SERVICE_URL = '';
