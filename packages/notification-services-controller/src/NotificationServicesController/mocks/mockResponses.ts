import {
  NOTIFICATION_API_LIST_ENDPOINT,
  NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT,
  TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT,
} from '../services/api-notifications';
import { FEATURE_ANNOUNCEMENT_API } from '../services/feature-announcements';
import { PERPS_API_CREATE_ORDERS } from '../services/perp-notifications';
import { createMockFeatureAnnouncementAPIResult } from './mock-feature-announcements';
import { createMockRawOnChainNotifications } from './mock-raw-notifications';

type MockResponse = {
  url: string;
  requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  response: unknown;
};

export const CONTENTFUL_RESPONSE = createMockFeatureAnnouncementAPIResult();

// Using `satisfies` to preserve narrow return types while ensuring type safety; explicit return types would widen to MockResponse
export const getMockFeatureAnnouncementResponse = (): MockResponse => {
  return {
    url: FEATURE_ANNOUNCEMENT_API,
    requestMethod: 'GET',
    response: CONTENTFUL_RESPONSE,
  } satisfies MockResponse;
};

export const getMockOnChainNotificationsConfig = (): MockResponse => {
  return {
    url: TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT(),
    requestMethod: 'POST',
    response: [{ address: '0xTestAddress', enabled: true }],
  } satisfies MockResponse;
};

export const MOCK_RAW_ON_CHAIN_NOTIFICATIONS =
  createMockRawOnChainNotifications();

// Using `satisfies` to preserve narrow return types while ensuring type safety; explicit return types would widen to MockResponse
export const getMockListNotificationsResponse = (): MockResponse => {
  return {
    url: NOTIFICATION_API_LIST_ENDPOINT(),
    requestMethod: 'POST',
    response: MOCK_RAW_ON_CHAIN_NOTIFICATIONS,
  } satisfies MockResponse;
};

export const getMockMarkNotificationsAsReadResponse = (): MockResponse => {
  return {
    url: NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT(),
    requestMethod: 'POST',
    response: null,
  } satisfies MockResponse;
};

export const getMockCreatePerpOrderNotification = (): MockResponse => {
  return {
    url: PERPS_API_CREATE_ORDERS,
    requestMethod: 'POST',
    response: null,
  } satisfies MockResponse;
};
