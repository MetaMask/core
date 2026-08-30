import nock from 'nock';

import {
  getMockDeletePushNotificationLinksResponse,
  getMockUpdatePushNotificationLinksResponse,
} from '../mocks/mockResponse.js';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointUpdatePushNotificationLinks = (
  mockReply?: MockReply,
  requestBody?: nock.RequestBodyMatcher,
): nock.Scope => {
  const mockResponse = getMockUpdatePushNotificationLinksResponse();
  const reply = mockReply ?? {
    status: 204,
    body: mockResponse.response,
  };

  const endpoint = nock(mockResponse.url);
  const mockEndpoint =
    requestBody === undefined
      ? endpoint.post('')
      : endpoint.post('', requestBody);

  return mockEndpoint.reply(reply.status);
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
