import nock from 'nock';

import {
  getMockAuthAccessTokenResponse,
  getMockAuthLoginResponse,
  getMockAuthNonceResponse,
} from '../mocks/mockResponses';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointGetNonce = (mockReply?: MockReply) => {
  const mockResponse = getMockAuthNonceResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };
  const mockNonceEndpoint = nock(mockResponse.url)
    .persist()
    .get('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockNonceEndpoint;
};

export const mockEndpointLogin = (mockReply?: MockReply) => {
  const mockResponse = getMockAuthLoginResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };
  const mockLoginEndpoint = nock(mockResponse.url)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockLoginEndpoint;
};

export const mockEndpointAccessToken = (mockReply?: MockReply) => {
  const mockResponse = getMockAuthAccessTokenResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };
  const mockOidcTokensEndpoint = nock(mockResponse.url)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockOidcTokensEndpoint;
};
