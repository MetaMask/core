import nock from 'nock';

import { getMockUpdatePushNotificationLinksResponse } from '../mocks/mockResponse';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
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
