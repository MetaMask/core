import nock from 'nock';

import {
  getMockUpdateOnChainNotifications,
  getMockOnChainNotificationsConfig,
  getMockFeatureAnnouncementResponse,
  getMockListNotificationsResponse,
  getMockMarkNotificationsAsReadResponse,
  getMockCreatePerpOrderNotification,
} from '../mocks/mockResponses';
import { PERPS_API } from '../services/perp-notifications';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockFetchFeatureAnnouncementNotifications = (
  mockReply?: MockReply,
) => {
  const mockResponse = getMockFeatureAnnouncementResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };
  const mockEndpoint = nock(mockResponse.url)
    .get('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockUpdateOnChainNotifications = (mockReply?: MockReply) => {
  const mockResponse = getMockUpdateOnChainNotifications();
  const reply = mockReply ?? { status: 204 };

  const mockEndpoint = nock(mockResponse.url)
    .post('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockGetOnChainNotificationsConfig = (mockReply?: MockReply) => {
  const mockResponse = getMockOnChainNotificationsConfig();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };

  const mockEndpoint = nock(mockResponse.url)
    .post('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockGetOnChainNotifications = (mockReply?: MockReply) => {
  const mockResponse = getMockListNotificationsResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };

  const mockEndpoint = nock(mockResponse.url)
    .post('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockMarkNotificationsAsRead = (mockReply?: MockReply) => {
  const mockResponse = getMockMarkNotificationsAsReadResponse();
  const reply = mockReply ?? { status: 200 };

  const mockEndpoint = nock(mockResponse.url)
    .post('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockCreatePerpNotification = (mockReply?: MockReply) => {
  const mockResponse = getMockCreatePerpOrderNotification();
  const reply = mockReply ?? { status: 201 };
  const mockEndpoint = nock(mockResponse.url)
    .persist()
    .post('')
    .reply(reply.status);
  return mockEndpoint;
};
