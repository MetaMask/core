import { REGISTRATION_TOKENS_ENDPOINT } from '../services/endpoints';

type MockResponse = {
  url: string | RegExp;
  requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  response: unknown;
};

export const MOCK_REG_TOKEN = 'REG_TOKEN';

export const getMockUpdatePushNotificationLinksResponse = (): MockResponse => {
  return {
    url: REGISTRATION_TOKENS_ENDPOINT(),
    requestMethod: 'POST',
    response: null,
  } satisfies MockResponse;
};

export const getMockDeletePushNotificationLinksResponse = (): MockResponse => {
  return {
    url: REGISTRATION_TOKENS_ENDPOINT(),
    requestMethod: 'DELETE',
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

export const getMockCreateFCMRegistrationTokenResponse = (): MockResponse => {
  return {
    url: /^https:\/\/fcmregistrations\.googleapis\.com\/v1\/projects\/.*$/u,
    requestMethod: 'POST',
    response: MOCK_FCM_RESPONSE,
  } satisfies MockResponse;
};

export const getMockDeleteFCMRegistrationTokenResponse = (): MockResponse => {
  return {
    url: /^https:\/\/fcmregistrations\.googleapis\.com\/v1\/projects\/.*$/u,
    requestMethod: 'POST',
    response: {},
  } satisfies MockResponse;
};
