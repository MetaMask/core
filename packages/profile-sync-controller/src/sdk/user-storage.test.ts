import { AuthType, JwtBearerAuth, LoginResponse } from './authentication';
import { Env } from './env';
import { MOCK_ACCESS_JWT, MOCK_JWT, handleMockNonce, handleMockOAuth2Token, handleMockSiweLogin, handleMockSrpLogin } from './mocks/mock-auth';
import { handleMockUserStoragePut } from './mocks/mock-userstorage';
import { server } from './mocks/msw';
import { UserStorage } from './user-storage';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';

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
                    return Promise.resolve(null);
                },
                setStorageKey: function (val: string): Promise<void> {
                    return Promise.resolve();
                }
            }
        })

        server.use(
            handleMockNonce({
                inspect(ctx) {
                    expect(ctx.request.url).toContain(`identifier=${MOCK_SRP}`);
                }
            })
        );

        server.use(
            handleMockSrpLogin({
                async inspect(ctx) {
                    const body = (await ctx.request.json()) as {
                        signature: string;
                        raw_message: string;
                    };
                    expect(body.signature).toBe('MOCK_SRP_SIGNATURE');
                }
            })
        );

        server.use(
            handleMockOAuth2Token({
                async inspect(ctx) {
                    const body = await ctx.request.formData()
                    expect(body.get('assertion')).toBe(MOCK_JWT);
                }
            })
        );

        //   server.use(
        //     handleMockUserStoragePut({
        //       async inspect(ctx) {
        //         const body = (await ctx.request.json()) as { data: string };
        //         console.log(body.data);
        //         //expect(body.data).toBe(`{"v":"1","d":"GIPkHJ1NnXIEB130Aya8gK5l+Dx1JHs00USNLJa2UTTJEUWLcGQm8uvGvyMyPUg7I55XNCKsdn+vfaTbBqJ9zg==","iterations":900000}`);
        //       }
        //     })
        //   );


        const expected = JSON.stringify({ is_compact: false })
        await userStorageInstance.setItem('notifications', 'ui_settings', expected)
        const response = await userStorageInstance.getItem('notifications', 'ui_settings')
        expect(response).toBe(expected);
    });
});