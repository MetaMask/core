import { REGISTRATION_TOKENS_ENDPOINT } from '../services/endpoints';
import type { LinksResult } from '../services/services';

type MockResponse = {
  url: string | RegExp;
  requestMethod: 'GET' | 'POST' | 'PUT';
  response: unknown;
};

export const MOCK_REG_TOKEN = 'REG_TOKEN';
export const MOCK_LINKS_RESPONSE: LinksResult = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  trigger_ids: ['1', '2', '3'],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  registration_tokens: [
    { token: 'reg_token_1', platform: 'portfolio' },
    { token: 'reg_token_2', platform: 'extension' },
  ],
};

export const getMockRetrievePushNotificationLinksResponse = () => {
  return {
    url: REGISTRATION_TOKENS_ENDPOINT,
    requestMethod: 'GET',
    response: MOCK_LINKS_RESPONSE,
  } satisfies MockResponse;
};

export const getMockUpdatePushNotificationLinksResponse = () => {
  return {
    url: REGISTRATION_TOKENS_ENDPOINT,
    requestMethod: 'POST',
    response: null,
  } satisfies MockResponse;
};

export const MOCK_FCM_RESPONSE = {
  name: '',
  token: 'fcm-token',
  web: {
    endpoint: '',
    p256dh: '',
    auth: '',
    applicationPubKey: '',
  },
};

export const getMockCreateFCMRegistrationTokenResponse = () => {
  return {
    url: /^https:\/\/fcmregistrations\.googleapis\.com\/v1\/projects\/.*$/u,
    requestMethod: 'POST',
    response: MOCK_FCM_RESPONSE,
  } satisfies MockResponse;
};

export const getMockDeleteFCMRegistrationTokenResponse = () => {
  return {
    url: /^https:\/\/fcmregistrations\.googleapis\.com\/v1\/projects\/.*$/u,
    requestMethod: 'POST',
    response: {},
  } satisfies MockResponse;
};
