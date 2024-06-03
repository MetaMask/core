/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/require-jsdoc */
import nock from 'nock';

import {
  NOTIFICATION_API_LIST_ENDPOINT,
  TRIGGER_API_BATCH_ENDPOINT,
} from '../services/onchain-notifications';
import { createMockRawOnChainNotifications } from './mock-raw-notifications';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

/**
 *
 * @param mockReply
 */
export function mockBatchCreateTriggers(mockReply?: MockReply) {
  const reply = mockReply ?? { status: 204 };

  const mockEndpoint = nock(TRIGGER_API_BATCH_ENDPOINT)
    .post('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
}

/**
 *
 * @param mockReply
 */
export function mockBatchDeleteTriggers(mockReply?: MockReply) {
  const reply = mockReply ?? { status: 204 };

  const mockEndpoint = nock(TRIGGER_API_BATCH_ENDPOINT)
    .delete('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
}

/**
 *
 * @param mockReply
 */
export function mockListNotifications(mockReply?: MockReply) {
  const reply = mockReply ?? {
    status: 200,
    body: createMockRawOnChainNotifications(),
  };

  const mockEndpoint = nock(NOTIFICATION_API_LIST_ENDPOINT)
    .post('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockEndpoint;
}

/**
 *
 * @param mockReply
 */
export function mockMarkNotificationsAsRead(mockReply?: MockReply) {
  const reply = mockReply ?? {
    status: 200,
  };

  const mockEndpoint = nock(
    'https://notification.api.cx.metamask.io/api/v1/notifications/mark-as-read',
  )
    .post('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
}
