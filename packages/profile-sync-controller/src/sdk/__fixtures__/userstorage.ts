import nock from 'nock';

import {
  MOCK_STORAGE_RESPONSE,
  MOCK_STORAGE_URL,
  MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES,
} from '../mocks/userstorage.js';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const handleMockUserStorageGet = async (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: await MOCK_STORAGE_RESPONSE(),
  };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .get(/.*/u)
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockUserStorageGetAllFeatureEntries = async (
  mockReply?: MockReply,
) => {
  const reply = mockReply ?? {
    status: 200,
    body: [await MOCK_STORAGE_RESPONSE()],
  };
  const mockEndpoint = nock(MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES)
    .persist()
    .get('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

/**
 * Intercepts PUT requests to the given URL. The request body is captured with
 * a body matcher, because the arguments passed to `.reply()` callbacks differ
 * between nock versions.
 *
 * @param url - The URL to intercept.
 * @param status - The status to reply with.
 * @param callback - Called with the request body of each request.
 * @param options - Options for the interceptor.
 * @param options.path - The path to match.
 * @param options.persist - Whether the interceptor outlives one request.
 * @returns The nock scope.
 */
export const mockPutWithBodyCallback = (
  url: string,
  status: nock.StatusCode,
  callback?: (requestBody: nock.Body) => Promise<void>,
  {
    path = /.*/u,
    persist = true,
  }: { path?: string | RegExp; persist?: boolean } = {},
): nock.Scope => {
  let lastRequestBody: nock.Body;
  const scope = nock(url);
  return (persist ? scope.persist() : scope)
    .put(
      path,
      callback
        ? (requestBody: nock.Body): boolean => {
            lastRequestBody = requestBody;
            return true;
          }
        : undefined,
    )
    .reply(status, async () => {
      await callback?.(lastRequestBody);
    });
};

export const handleMockUserStoragePut = (
  mockReply?: MockReply,
  callback?: (requestBody: nock.Body) => Promise<void>,
) => {
  const reply = mockReply ?? { status: 204 };
  return mockPutWithBodyCallback(MOCK_STORAGE_URL, reply.status, callback);
};

export const handleMockUserStorageBatchDelete = (
  mockReply?: MockReply,
  callback?: (requestBody: nock.Body) => Promise<void>,
) => {
  const reply = mockReply ?? { status: 204 };
  return mockPutWithBodyCallback(MOCK_STORAGE_URL, reply.status, callback);
};

export const handleMockUserStorageDelete = async (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .delete(/.*/u)
    .reply(reply.status);

  return mockEndpoint;
};

export const handleMockUserStorageDeleteAllFeatureEntries = async (
  mockReply?: MockReply,
) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES)
    .persist()
    .delete('')
    .reply(reply.status);

  return mockEndpoint;
};
