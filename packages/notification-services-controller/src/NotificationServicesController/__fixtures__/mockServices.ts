import nock from 'nock';

import {
  getMockBatchCreateTriggersResponse,
  getMockBatchDeleteTriggersResponse,
  getMockFeatureAnnouncementResponse,
  getMockListNotificationsResponse,
  getMockMarkNotificationsAsReadResponse,
} from './mockResponses';

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

export const mockBatchCreateTriggers = (mockReply?: MockReply) => {
  const mockResponse = getMockBatchCreateTriggersResponse();
  const reply = mockReply ?? { status: 204 };

  const mockEndpoint = nock(mockResponse.url)
    .post('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockBatchDeleteTriggers = (mockReply?: MockReply) => {
  const mockResponse = getMockBatchDeleteTriggersResponse();
  const reply = mockReply ?? { status: 204 };

  const mockEndpoint = nock(mockResponse.url)
    .delete('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockListNotifications = (mockReply?: MockReply) => {
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
