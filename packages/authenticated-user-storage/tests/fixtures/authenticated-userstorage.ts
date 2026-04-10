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

export function handleMockListDelegations(mockReply?: MockReply): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: [MOCK_DELEGATION_RESPONSE],
  };
  return nock(MOCK_DELEGATIONS_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
}

export function handleMockCreateDelegation(
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
): nock.Scope {
  const reply = mockReply ?? { status: 200 };
  const interceptor = nock(MOCK_DELEGATIONS_URL).persist().post('');

  if (callback) {
    return interceptor.reply(reply.status, async (uri, requestBody) => {
      return callback(uri, requestBody);
    });
  }
  return interceptor.reply(reply.status, reply.body);
}

export function handleMockRevokeDelegation(mockReply?: MockReply): nock.Scope {
  const reply = mockReply ?? { status: 204 };
  return nock(MOCK_DELEGATIONS_URL)
    .persist()
    .delete(/.*/u)
    .reply(reply.status, reply.body);
}

export function handleMockGetNotificationPreferences(
  mockReply?: MockReply,
): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_NOTIFICATION_PREFERENCES,
  };
  return nock(MOCK_NOTIFICATION_PREFERENCES_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
}

export function handleMockPutNotificationPreferences(
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
): nock.Scope {
  const reply = mockReply ?? { status: 200 };
  const interceptor = nock(MOCK_NOTIFICATION_PREFERENCES_URL).persist().put('');

  if (callback) {
    return interceptor.reply(reply.status, async (uri, requestBody) => {
      return callback(uri, requestBody);
    });
  }
  return interceptor.reply(reply.status, reply.body);
}
