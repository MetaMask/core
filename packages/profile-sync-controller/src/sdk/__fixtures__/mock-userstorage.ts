import { HttpResponse, http } from 'msw';

import encryption from '../encryption';
import type { InterceptParams } from './msw';

export const MOCK_STORAGE_KEY = 'MOCK_STORAGE_KEY';
export const MOCK_NOTIFICATIONS_DATA = { is_compact: false };
export const MOCK_NOTIFICATIONS_DATA_ENCRYPTED = encryption.encryptString(
  JSON.stringify(MOCK_NOTIFICATIONS_DATA),
  MOCK_STORAGE_KEY,
);

export const handleMockUserStorageGet = (params?: InterceptParams) =>
  http.get(
    'https://user-storage.dev-api.cx.metamask.io/api/v1/userstorage/notifications/*',
    async (ctx) => {
      if (params?.inspect) {
        await params.inspect(ctx);
      }
      if (params?.callback) {
        return await params.callback(ctx);
      }
      return HttpResponse.json({
        HashedKey:
          '8485d2c14c333ebca415140a276adaf546619b0efc204586b73a5d400a18a5e2',
        Data: MOCK_NOTIFICATIONS_DATA_ENCRYPTED,
      });
    },
  );

export const handleMockUserStoragePut = (params?: InterceptParams) =>
  http.put(
    'https://user-storage.dev-api.cx.metamask.io/api/v1/userstorage/notifications/*',
    async (ctx) => {
      if (params?.inspect) {
        await params.inspect(ctx);
      }
      if (params?.callback) {
        return await params.callback(ctx);
      }
      return HttpResponse.json({});
    },
  );
