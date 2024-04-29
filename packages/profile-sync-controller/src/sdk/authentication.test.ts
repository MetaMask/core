import { HttpResponse } from 'msw';

import type { LoginResponse } from './authentication';
import { AuthType, JwtBearerAuth } from './authentication';
import { Env } from './env';
import { NonceRetrievalError, SignInError } from './errors';
import {
  MOCK_ACCESS_JWT,
  MOCK_JWT,
  handleMockNonce,
  handleMockOAuth2Token,
  handleMockSiweLogin,
  handleMockSrpLogin,
} from './mocks/mock-auth';
import { server } from './mocks/msw';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

describe('Authentication', () => {
  it('the SRP signIn success', async () => {
    const instance = new JwtBearerAuth(
      {
        env: Env.DEV,
        type: AuthType.SRP,
      },
      {
        storage: {
          getLoginResponse: (): Promise<LoginResponse | null> => {
            return Promise.resolve(null);
          },
          setLoginResponse: (): Promise<void> => {
            return Promise.resolve();
          },
        },
        signing: {
          getIdentifier: (): Promise<string> => {
            return Promise.resolve(MOCK_SRP);
          },
          signMessage: (): Promise<string> => {
            return Promise.resolve('MOCK_SRP_SIGNATURE');
          },
        },
      },
    );

    server.use(
      handleMockNonce({
        inspect(ctx) {
          expect(ctx.request.url).toContain(`identifier=${MOCK_SRP}`);
        },
      }),
    );

    server.use(
      handleMockSrpLogin({
        async inspect(ctx) {
          const body = (await ctx.request.json()) as {
            signature: string;
            raw_message: string;
          };
          expect(body.signature).toBe('MOCK_SRP_SIGNATURE');
        },
      }),
    );

    server.use(
      handleMockOAuth2Token({
        async inspect(ctx) {
          const body = await ctx.request.formData();

          expect(body.get('grant_type')).toBe(
            'urn:ietf:params:oauth:grant-type:jwt-bearer',
          );
          expect(body.get('client_id')).toBe(
            'f1a963d7-50dc-4cb5-8d81-f1f3654f0df3',
          );
          expect(body.get('assertion')).toBe(MOCK_JWT);
        },
      }),
    );

    const tokenResponse = await instance.getAccessToken();
    expect(tokenResponse.accessToken).toBe(MOCK_ACCESS_JWT);
    expect(tokenResponse.expiresIn).toBe(3600);
  });

  it('the SRP signIn failed: nonce error', async () => {
    const instance = new JwtBearerAuth(
      {
        env: Env.DEV,
        type: AuthType.SRP,
      },
      {
        storage: {
          getLoginResponse: (): Promise<LoginResponse | null> => {
            return Promise.resolve(null);
          },
          setLoginResponse: (): Promise<void> => {
            return Promise.resolve();
          },
        },
        signing: {
          getIdentifier: (): Promise<string> => {
            return Promise.resolve('INVALID-IDENTIFIER');
          },
          signMessage: (): Promise<string> => {
            return Promise.resolve('MOCK_SRP_SIGNATURE');
          },
        },
      },
    );

    server.use(
      handleMockNonce({
        callback: () =>
          HttpResponse.json(
            {
              message: 'invalid identifier',
              error: 'validation-error',
            },
            { status: 400, statusText: `Bad Request` },
          ),
      }),
    );

    await expect(instance.getAccessToken()).rejects.toThrow(
      NonceRetrievalError,
    );
  });

  it('the SRP signIn failed: auth error', async () => {
    const instance = new JwtBearerAuth(
      {
        env: Env.DEV,
        type: AuthType.SRP,
      },
      {
        storage: {
          getLoginResponse: (): Promise<LoginResponse | null> => {
            return Promise.resolve(null);
          },
          setLoginResponse: (): Promise<void> => {
            return Promise.resolve();
          },
        },
        signing: {
          getIdentifier: (): Promise<string> => {
            return Promise.resolve(MOCK_SRP);
          },
          signMessage: (): Promise<string> => {
            return Promise.resolve('MOCK_INVALID_SRP_SIGNATURE');
          },
        },
      },
    );

    server.use(
      handleMockNonce({
        inspect(ctx) {
          expect(ctx.request.url).toContain(`identifier=${MOCK_SRP}`);
        },
      }),
    );

    server.use(
      handleMockSrpLogin({
        callback: () =>
          HttpResponse.json(
            {
              message: 'invalid message signature',
              error: 'invalid-auth-request',
            },
            { status: 401, statusText: `Forbidden` },
          ),
      }),
    );

    await expect(instance.getAccessToken()).rejects.toThrow(SignInError);
  });

  it('the SRP signIn failed: oauth2 error', async () => {
    const instance = new JwtBearerAuth(
      {
        env: Env.DEV,
        type: AuthType.SRP,
      },
      {
        storage: {
          getLoginResponse: (): Promise<LoginResponse | null> => {
            return Promise.resolve(null);
          },
          setLoginResponse: (): Promise<void> => {
            return Promise.resolve();
          },
        },
        signing: {
          getIdentifier: (): Promise<string> => {
            return Promise.resolve(MOCK_SRP);
          },
          signMessage: (): Promise<string> => {
            return Promise.resolve('MOCK_SRP_SIGNATURE');
          },
        },
      },
    );

    server.use(
      handleMockNonce({
        inspect(ctx) {
          expect(ctx.request.url).toContain(`identifier=${MOCK_SRP}`);
        },
      }),
    );

    server.use(
      handleMockSrpLogin({
        async inspect(ctx) {
          const body = (await ctx.request.json()) as {
            signature: string;
            raw_message: string;
          };
          expect(body.signature).toBe('MOCK_SRP_SIGNATURE');
        },
      }),
    );

    server.use(
      handleMockOAuth2Token({
        callback: () =>
          HttpResponse.json(
            {
              error_description: 'invalid JWT token',
              error: 'invalid_request',
            },
            { status: 400, statusText: `Bad Request` },
          ),
      }),
    );

    await expect(instance.getAccessToken()).rejects.toThrow(SignInError);
  });

  it('the SiWE signIn success', async () => {
    const instance = new JwtBearerAuth(
      {
        env: Env.DEV,
        type: AuthType.SiWE,
      },
      {
        storage: {
          getLoginResponse: (): Promise<LoginResponse | null> => {
            return Promise.resolve(null);
          },
          setLoginResponse: (): Promise<void> => {
            return Promise.resolve();
          },
        },
        signing: {
          getIdentifier: (): Promise<string> => {
            return Promise.resolve(MOCK_ADDRESS);
          },
          signMessage: (): Promise<string> => {
            return Promise.resolve('MOCK_SIWE_SIGNATURE');
          },
        },
      },
    );
    instance.initialize({
      address: MOCK_ADDRESS,
      chainId: 1,
      domain: 'https://metamask.io',
    });

    server.use(
      handleMockNonce({
        inspect(ctx) {
          expect(ctx.request.url).toContain(`identifier=${MOCK_ADDRESS}`);
        },
      }),
    );

    server.use(
      handleMockSiweLogin({
        async inspect(ctx) {
          const body = (await ctx.request.json()) as {
            signature: string;
            raw_message: string;
          };
          expect(body.signature).toBe('MOCK_SIWE_SIGNATURE');
        },
      }),
    );

    server.use(
      handleMockOAuth2Token({
        async inspect(ctx) {
          const body = await ctx.request.formData();

          expect(body.get('grant_type')).toBe(
            'urn:ietf:params:oauth:grant-type:jwt-bearer',
          );
          expect(body.get('client_id')).toBe(
            'f1a963d7-50dc-4cb5-8d81-f1f3654f0df3',
          );
          expect(body.get('assertion')).toBe(MOCK_JWT);
        },
      }),
    );

    const tokenResponse = await instance.getAccessToken();
    expect(tokenResponse.accessToken).toBe(MOCK_ACCESS_JWT);
    expect(tokenResponse.expiresIn).toBe(3600);
  });
});
