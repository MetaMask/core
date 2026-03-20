import nock from 'nock';

import {
  MOCK_DELEGATIONS_URL,
  MOCK_DELEGATION_RESPONSE,
  MOCK_NOTIFICATION_PREFERENCES,
  MOCK_NOTIFICATION_PREFERENCES_URL,
} from '../mocks/authenticated-userstorage';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const handleMockListDelegations = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: [MOCK_DELEGATION_RESPONSE],
  };
  return nock(MOCK_DELEGATIONS_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
};

export const handleMockCreateDelegation = (
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
) => {
  const reply = mockReply ?? { status: 200 };
  return nock(MOCK_DELEGATIONS_URL)
    .persist()
    .post('')
    .reply(reply.status, async (uri, requestBody) => {
      await callback?.(uri, requestBody);
    });
};

export const handleMockRevokeDelegation = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  return nock(MOCK_DELEGATIONS_URL)
    .persist()
    .delete(/.*/u)
    .reply(reply.status, reply.body);
};

export const handleMockGetNotificationPreferences = (
  mockReply?: MockReply,
) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_NOTIFICATION_PREFERENCES,
  };
  return nock(MOCK_NOTIFICATION_PREFERENCES_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
};

export const handleMockPutNotificationPreferences = (
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
) => {
  const reply = mockReply ?? { status: 200 };
  return nock(MOCK_NOTIFICATION_PREFERENCES_URL)
    .persist()
    .put('')
    .reply(reply.status, async (uri, requestBody) => {
      await callback?.(uri, requestBody);
    });
};
