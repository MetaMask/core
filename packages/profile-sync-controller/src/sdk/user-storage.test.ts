import { HttpResponse } from 'msw';
import { AuthType, JwtBearerAuth, LoginResponse } from './authentication';
import { Env } from './env';
import { NotFoundError, UserStorageError } from './errors';
import { MOCK_ACCESS_JWT, MOCK_JWT, handleMockNonce, handleMockOAuth2Token, handleMockSiweLogin, handleMockSrpLogin } from './mocks/mock-auth';
import { MOCK_NOTIFICATIONS_DATA_ENCRYPTED, MOCK_STORAGE_KEY, handleMockUserStorageGet, handleMockUserStoragePut } from './mocks/mock-userstorage';
import { server } from './mocks/msw';
import { UserStorage } from './user-storage';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

describe('User Storage', () => {
    test('get/set user storage using SRP', async () => {
        const authInstance = new JwtBearerAuth({
            env: Env.DEV,
            type: AuthType.SRP
        }, {
            storage: {
                getLoginResponse: function (): Promise<LoginResponse | null> {
                    return Promise.resolve(null);
                },
                setLoginResponse: function (val: LoginResponse): Promise<void> {
                    return Promise.resolve();
                }
            },
            signing: {
                getIdentifier: function (): Promise<string> {
                    return Promise.resolve(MOCK_SRP);
                },
                signMessage: function (msg: string): Promise<string> {
                    return Promise.resolve('MOCK_SRP_SIGNATURE');
                }
            }
        });

        const userStorageInstance = new UserStorage({
            auth: authInstance,
            env: Env.DEV
        }, {
            storage: {
                getStorageKey: function (): Promise<string | null> {
                    return Promise.resolve(MOCK_STORAGE_KEY);
                },
                setStorageKey: function (val: string): Promise<void> {
                    return Promise.resolve();
                }
            }
        })

        server.use(
            handleMockOAuth2Token({
                async inspect(ctx) {
                    const body = await ctx.request.formData()
                    expect(body.get('assertion')).toBe(MOCK_JWT);
                }
            })
        );

        const expected = JSON.stringify({ is_compact: false });
        await userStorageInstance.setItem('notifications', 'ui_settings', expected)
        const response = await userStorageInstance.getItem('notifications', 'ui_settings')
        expect(response).toBe(expected);
    });

    test('get/set user storage using SiWE', async () => {
        const authInstance = new JwtBearerAuth({
            env: Env.DEV,
            type: AuthType.SiWE
        }, {
            storage: {
                getLoginResponse: function (): Promise<LoginResponse | null> {
                    return Promise.resolve(null);
                },
                setLoginResponse: function (val: LoginResponse): Promise<void> {
                    return Promise.resolve();
                }
            },
            signing: {
                getIdentifier: function (): Promise<string> {
                    return Promise.resolve(MOCK_SRP);
                },
                signMessage: function (msg: string): Promise<string> {
                    return Promise.resolve('MOCK_SiWE_SIGNATURE');
                }
            }
        });
        authInstance.initialize({ address: MOCK_ADDRESS, chainId: 1, domain: 'https://metamask.io' })

        const userStorageInstance = new UserStorage({
            auth: authInstance,
            env: Env.DEV
        }, {
            storage: {
                getStorageKey: function (): Promise<string | null> {
                    return Promise.resolve(MOCK_STORAGE_KEY);
                },
                setStorageKey: function (val: string): Promise<void> {
                    return Promise.resolve();
                }
            }
        })

        server.use(
            handleMockOAuth2Token({
                async inspect(ctx) {
                    const body = await ctx.request.formData();
                    expect(body.get('assertion')).toBe(MOCK_JWT);
                }
            })
        );

        const expected = JSON.stringify({ is_compact: false })
        await userStorageInstance.setItem('notifications', 'ui_settings', expected)
        const response = await userStorageInstance.getItem('notifications', 'ui_settings')
        expect(response).toBe(expected);
    });

    test('user storage: failed to set key', async () => {
        const authInstance = new JwtBearerAuth({
            env: Env.DEV,
            type: AuthType.SiWE
        }, {
            storage: {
                getLoginResponse: function (): Promise<LoginResponse | null> {
                    return Promise.resolve(null);
                },
                setLoginResponse: function (val: LoginResponse): Promise<void> {
                    return Promise.resolve();
                }
            },
            signing: {
                getIdentifier: function (): Promise<string> {
                    return Promise.resolve(MOCK_SRP);
                },
                signMessage: function (msg: string): Promise<string> {
                    return Promise.resolve('MOCK_SiWE_SIGNATURE');
                }
            }
        });
        authInstance.initialize({ address: MOCK_ADDRESS, chainId: 1, domain: 'https://metamask.io' })

        const userStorageInstance = new UserStorage({
            auth: authInstance,
            env: Env.DEV
        }, {
            storage: {
                getStorageKey: function (): Promise<string | null> {
                    return Promise.resolve(MOCK_STORAGE_KEY);
                },
                setStorageKey: function (val: string): Promise<void> {
                    return Promise.resolve();
                }
            }
        })

        server.use(
            handleMockOAuth2Token({
                async inspect(ctx) {
                    const body = await ctx.request.formData();
                    expect(body.get('assertion')).toBe(MOCK_JWT);
                }
            })
        );

        server.use(
            handleMockUserStoragePut({
              callback: () => HttpResponse.json({
                message: 'failed to insert storage entry',
                error: 'generic-error' 
              }, { status: 500, statusText: `Internal` })
            })
          );

        const expected = JSON.stringify({ is_compact: false })
        await expect(userStorageInstance.setItem('notifications', 'ui_settings', expected)).rejects.toThrow(UserStorageError);
    });

    test('user storage: failed to get key', async () => {
        const authInstance = new JwtBearerAuth({
            env: Env.DEV,
            type: AuthType.SRP
        }, {
            storage: {
                getLoginResponse: function (): Promise<LoginResponse | null> {
                    return Promise.resolve(null);
                },
                setLoginResponse: function (val: LoginResponse): Promise<void> {
                    return Promise.resolve();
                }
            },
            signing: {
                getIdentifier: function (): Promise<string> {
                    return Promise.resolve(MOCK_SRP);
                },
                signMessage: function (msg: string): Promise<string> {
                    return Promise.resolve('MOCK_SRP_SIGNATURE');
                }
            }
        });

        const userStorageInstance = new UserStorage({
            auth: authInstance,
            env: Env.DEV
        }, {
            storage: {
                getStorageKey: function (): Promise<string | null> {
                    return Promise.resolve(MOCK_STORAGE_KEY);
                },
                setStorageKey: function (val: string): Promise<void> {
                    return Promise.resolve();
                }
            }
        })

        server.use(
            handleMockOAuth2Token({
                async inspect(ctx) {
                    const body = await ctx.request.formData();
                    expect(body.get('assertion')).toBe(MOCK_JWT);
                }
            })
        );

        server.use(
            handleMockUserStorageGet({
              callback: () => HttpResponse.json({
                message: 'failed to get storage entry',
                error: 'generic-error' 
              }, { status: 500, statusText: `Internal` })
            })
          );

        await expect(userStorageInstance.getItem('notifications', 'ui_settings')).rejects.toThrow(UserStorageError);
    });

    test('user storage: key not found', async () => {
        const authInstance = new JwtBearerAuth({
            env: Env.DEV,
            type: AuthType.SiWE
        }, {
            storage: {
                getLoginResponse: function (): Promise<LoginResponse | null> {
                    return Promise.resolve(null);
                },
                setLoginResponse: function (val: LoginResponse): Promise<void> {
                    return Promise.resolve();
                }
            },
            signing: {
                getIdentifier: function (): Promise<string> {
                    return Promise.resolve(MOCK_SRP);
                },
                signMessage: function (msg: string): Promise<string> {
                    return Promise.resolve('MOCK_SiWE_SIGNATURE');
                }
            }
        });
        authInstance.initialize({ address: MOCK_ADDRESS, chainId: 1, domain: 'https://metamask.io' })

        const userStorageInstance = new UserStorage({
            auth: authInstance,
            env: Env.DEV
        }, {
            storage: {
                getStorageKey: function (): Promise<string | null> {
                    return Promise.resolve(MOCK_STORAGE_KEY);
                },
                setStorageKey: function (val: string): Promise<void> {
                    return Promise.resolve();
                }
            }
        })

        server.use(
            handleMockOAuth2Token({
                async inspect(ctx) {
                    const body = await ctx.request.formData();
                    expect(body.get('assertion')).toBe(MOCK_JWT);
                }
            })
        );

        server.use(
            handleMockUserStorageGet({
              callback: () => HttpResponse.json({
                message: 'key not found',
                error: 'cannot get key' 
              }, { status: 404, statusText: `Not Found` })
            })
          );

        await expect(userStorageInstance.getItem('notifications', 'ui_settings')).rejects.toThrow(NotFoundError);
    });
});