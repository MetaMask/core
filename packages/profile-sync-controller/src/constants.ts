const AUTH_ENDPOINT = 'https://authentication.api.cx.metamask.io';
export const AUTH_NONCE_ENDPOINT = `${AUTH_ENDPOINT}/api/v2/nonce`;
export const AUTH_LOGIN_ENDPOINT = `${AUTH_ENDPOINT}/api/v2/srp/login`;

const OIDC_ENDPOINT = 'https://oidc.api.cx.metamask.io';
export const OIDC_TOKENS_ENDPOINT = `${OIDC_ENDPOINT}/oauth2/token`;
export const OIDC_CLIENT_ID = '1132f10a-b4e5-4390-a5f2-d9c6022db564';
export const OIDC_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

export const GET_PUBLIC_KEY = 'getPublicKey';
export const SIGN_MESSAGE = 'signMessage';

export const USER_STORAGE_API = 'https://user-storage.api.cx.metamask.io';
export const USER_STORAGE_ENDPOINT = `${USER_STORAGE_API}/api/v1/userstorage`;
