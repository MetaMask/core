import nock from 'nock';

import {
  getMockRetrievePushNotificationLinksResponse,
  getMockUpdatePushNotificationLinksResponse,
} from './mockResponse';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointGetPushNotificationLinks = (mockReply?: MockReply) => {
  const mockResponse = getMockRetrievePushNotificationLinksResponse();
  const reply = mockReply ?? {
    status: 200,
    body: mockResponse.response,
  };

  const mockEndpoint = nock(mockResponse.url)
    .get('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockEndpointUpdatePushNotificationLinks = (
  mockReply?: MockReply,
) => {
  const mockResponse = getMockUpdatePushNotificationLinksResponse();
  const reply = mockReply ?? {
    status: 200,
    body: mockResponse.response,
  };

  const mockEndpoint = nock(mockResponse.url).post('').reply(reply.status);

  return mockEndpoint;
};
