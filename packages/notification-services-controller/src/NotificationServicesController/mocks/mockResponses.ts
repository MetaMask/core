import { createMockFeatureAnnouncementAPIResult } from './mock-feature-announcements';
import { createMockRawOnChainNotifications } from './mock-raw-notifications';
import { FEATURE_ANNOUNCEMENT_API } from '../services/feature-announcements';
import {
  NOTIFICATION_API_LIST_ENDPOINT,
  NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT,
  TRIGGER_API_NOTIFICATIONS_ENDPOINT,
  TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT,
} from '../services/onchain-notifications';

type MockResponse = {
  url: string;
  requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  response: unknown;
};

export const CONTENTFUL_RESPONSE = createMockFeatureAnnouncementAPIResult();

export const getMockFeatureAnnouncementResponse = () => {
  return {
    url: FEATURE_ANNOUNCEMENT_API,
    requestMethod: 'GET',
    response: CONTENTFUL_RESPONSE,
  } satisfies MockResponse;
};

export const getMockUpdateOnChainNotifications = () => {
  return {
    url: TRIGGER_API_NOTIFICATIONS_ENDPOINT,
    requestMethod: 'POST',
    response: null,
  } satisfies MockResponse;
};

export const getMockOnChainNotificationsConfig = () => {
  return {
    url: TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT,
    requestMethod: 'POST',
    response: [{ address: '0xTestAddress', enabled: true }],
  } satisfies MockResponse;
};

export const MOCK_RAW_ON_CHAIN_NOTIFICATIONS =
  createMockRawOnChainNotifications();

export const getMockListNotificationsResponse = () => {
  return {
    url: NOTIFICATION_API_LIST_ENDPOINT,
    requestMethod: 'POST',
    response: MOCK_RAW_ON_CHAIN_NOTIFICATIONS,
  } satisfies MockResponse;
};

export const getMockMarkNotificationsAsReadResponse = () => {
  return {
    url: NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT,
    requestMethod: 'POST',
    response: null,
  } satisfies MockResponse;
};
