import nock from 'nock';

import {
  getMockDeletePushNotificationLinksResponse,
  getMockUpdatePushNotificationLinksResponse,
} from '../mocks/mockResponse';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointUpdatePushNotificationLinks = (
  mockReply?: MockReply,
): nock.Scope => {
  const mockResponse = getMockUpdatePushNotificationLinksResponse();
  const reply = mockReply ?? {
    status: 204,
    body: mockResponse.response,
  };

  const mockEndpoint = nock(mockResponse.url).post('').reply(reply.status);

  return mockEndpoint;
};

export const mockEndpointDeletePushNotificationLinks = (
  mockReply?: MockReply,
  requestBody?: nock.RequestBodyMatcher,
): nock.Scope => {
  const mockResponse = getMockDeletePushNotificationLinksResponse();
  const reply = mockReply ?? {
    status: 204,
    body: mockResponse.response,
  };

  const mockEndpoint = nock(mockResponse.url)
    .delete('', requestBody)
    .reply(reply.status);

  return mockEndpoint;
};
