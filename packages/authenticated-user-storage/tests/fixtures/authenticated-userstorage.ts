import nock from 'nock';

import {
  MOCK_ASSETS_WATCHLIST_BLOB,
  MOCK_ASSETS_WATCHLIST_URL,
  MOCK_DELEGATIONS_URL,
  MOCK_DELEGATION_RESPONSE,
  MOCK_MARKETING_CONSENT,
  MOCK_MARKETING_CONSENT_URL,
  MOCK_IDENTITY_SHARING_CONSENT,
  MOCK_IDENTITY_SHARING_CONSENT_URL,
  MOCK_NOTIFICATION_PREFERENCES,
  MOCK_NOTIFICATION_PREFERENCES_URL,
  MOCK_USER_ASSETS_BLOB,
  MOCK_USER_ASSETS_URL,
} from '../mocks/authenticated-userstorage.js';

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

export function handleMockGetMarketingConsent(
  mockReply?: MockReply,
): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_MARKETING_CONSENT,
  };
  return nock(MOCK_MARKETING_CONSENT_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
}

export function handleMockPutMarketingConsent(
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
): nock.Scope {
  const reply = mockReply ?? { status: 200 };
  const interceptor = nock(MOCK_MARKETING_CONSENT_URL).persist().put('');

  if (callback) {
    return interceptor.reply(reply.status, async (uri, requestBody) => {
      return callback(uri, requestBody);
    });
  }
  return interceptor.reply(reply.status, reply.body);
}

export function handleMockGetIdentitySharingConsent(
  mockReply?: MockReply,
): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_IDENTITY_SHARING_CONSENT,
  };
  return nock(MOCK_IDENTITY_SHARING_CONSENT_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
}

export function handleMockPutIdentitySharingConsent(
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
): nock.Scope {
  const reply = mockReply ?? { status: 200 };
  const interceptor = nock(MOCK_IDENTITY_SHARING_CONSENT_URL).persist().put('');

  if (callback) {
    return interceptor.reply(reply.status, async (uri, requestBody) => {
      return callback(uri, requestBody);
    });
  }
  return interceptor.reply(reply.status, reply.body);
}

export function handleMockGetAssetsWatchlist(
  mockReply?: MockReply,
): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_ASSETS_WATCHLIST_BLOB,
  };
  return nock(MOCK_ASSETS_WATCHLIST_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
}

export function handleMockSetAssetsWatchlist(
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
): nock.Scope {
  const reply = mockReply ?? { status: 200 };
  const interceptor = nock(MOCK_ASSETS_WATCHLIST_URL).persist().put('');

  if (callback) {
    return interceptor.reply(reply.status, async (uri, requestBody) => {
      return callback(uri, requestBody);
    });
  }
  return interceptor.reply(reply.status, reply.body);
}

export function handleMockGetUserAssets(mockReply?: MockReply): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_USER_ASSETS_BLOB,
  };
  return nock(MOCK_USER_ASSETS_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
}

export function handleMockSetUserAssets(
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
): nock.Scope {
  const reply = mockReply ?? { status: 200 };
  const interceptor = nock(MOCK_USER_ASSETS_URL).persist().put('');

  if (callback) {
    return interceptor.reply(reply.status, async (uri, requestBody) => {
      return callback(uri, requestBody);
    });
  }
  return interceptor.reply(reply.status, reply.body);
}
