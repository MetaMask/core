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
 * A nock scope that also records the body of every request it answered.
 */
export type MockPutScope = nock.Scope & { requestBodies: nock.Body[] };

/**
 * Reads the JSON body of a request from the arguments that nock passes to a
 * reply function: `(uri, body)` on nock 13, or a Fetch API `Request` followed
 * by a callback on later versions.
 *
 * @param replyArgs - The arguments that nock passed to the reply function.
 * @returns The request body.
 */
const readRequestBody = async (replyArgs: unknown[]): Promise<nock.Body> => {
  const [first, second] = replyArgs;
  if (typeof first === 'string') {
    return second as nock.Body;
  }
  return (await (first as Request).clone().json()) as nock.Body;
};

/**
 * Normalizes a recorded request body to an object, failing loudly if it is not
 * one, so that a test cannot pass without checking the body.
 *
 * @param requestBody - A body recorded by {@link mockPutCapturingBodies}.
 * @returns The request body as an object.
 */
export const parseRequestBodyObject = (
  requestBody: nock.Body,
): Exclude<nock.Body, string> => {
  const parsed: unknown =
    typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected the request body to be a JSON object');
  }
  return parsed as Exclude<nock.Body, string>;
};

/**
 * Intercepts PUT requests to the given URL and records the body of each
 * request that it answers, so tests can assert on the bodies after the
 * operation under test has finished.
 *
 * @param url - The URL to intercept.
 * @param status - The status to reply with.
 * @param options - Options for the interceptor.
 * @param options.path - The path to match.
 * @param options.persist - Whether the interceptor outlives one request.
 * @returns The nock scope, with the recorded `requestBodies`.
 */
export const mockPutCapturingBodies = (
  url: string,
  status: nock.StatusCode,
  {
    path = /.*/u,
    persist = true,
  }: { path?: string | RegExp; persist?: boolean } = {},
): MockPutScope => {
  const requestBodies: nock.Body[] = [];
  const scope = nock(url);
  const interceptedScope = (persist ? scope.persist() : scope)
    .put(path)
    // The rest parameter keeps the function length at 0, because nock 15 treats
    // a function with two parameters as a callback style reply.
    .reply(status, async (...replyArgs: unknown[]) => {
      requestBodies.push(await readRequestBody(replyArgs));
    });
  return Object.assign(interceptedScope, { requestBodies });
};

export const handleMockUserStoragePut = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  return mockPutCapturingBodies(MOCK_STORAGE_URL, reply.status);
};

export const handleMockUserStorageBatchDelete = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  return mockPutCapturingBodies(MOCK_STORAGE_URL, reply.status);
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
