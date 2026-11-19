import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';
import type { Mock, MockedFunction } from 'vitest';

import { flushPromises } from '../../../tests/vitest/helpers.js';
import type { KycAccountLinkAdapter } from './accountLink.js';
import type { KycSumSubLaunchParams } from './providers/sumsub.js';
import type { KycSessionStatus, KycStepInfo } from './types.js';
import { assertAttestedServerPublicKey } from './ukyc/jwtChain.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';
import {
  getDefaultVendorOnboardingControllerState,
  VendorOnboardingController,
} from './VendorOnboardingController.js';
import type {
  VendorOnboardingControllerMessenger,
  VendorOnboardingControllerOptions,
} from './VendorOnboardingController.js';

vi.mock(import('./ukyc/jwtChain.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  assertAttestedServerPublicKey: vi.fn(),
}));
vi.mock(import('./ukyc/wrapEncryptionKey.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  wrapEncryptionKey: vi.fn(),
}));

const mockAssertAttestedServerPublicKey =
  assertAttestedServerPublicKey as MockedFunction<
    typeof assertAttestedServerPublicKey
  >;
const mockWrapEncryptionKey = wrapEncryptionKey as MockedFunction<
  typeof wrapEncryptionKey
>;

const AAL2_TOKEN = 'aal2-token';

const ENCRYPTION_SCHEMA = {
  serverPublicKey: { kty: 'OKP', crv: 'X25519', x: 'spk-x' },
  jwtChain: 'jwt.chain.sig',
};

const UKYC_SESSION = {
  sessionId: 'sid-1',
  encryptionDataKey: ENCRYPTION_SCHEMA,
  ukycCapabilityToken: ENCRYPTION_SCHEMA,
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<VendorOnboardingControllerMessenger>,
  MessengerEvents<VendorOnboardingControllerMessenger>
>;

const SESSION_STATUS: KycSessionStatus = {
  id: 'sid-1',
  finalStatus: 'new',
  externalUserId: 'ext-1',
  kycStatus: 'new',
  vendor: 'kalshi',
  vendorStatus: 'new',
};

describe('VendorOnboardingController', () => {
  describe('constructor', () => {
    it('starts with no vendors', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultVendorOnboardingControllerState(),
        );
      });
    });

    it('merges initial state over the defaults', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'done',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'done',
            status: 'none',
            sessionId: 'sid-1',
          });
        },
      );
    });
  });

  describe('refreshStep', () => {
    it('saves the step kyc-api answers with', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'account_link',
          status: 'none',
        });

        const step = await controller.refreshStep({ vendor: 'kalshi' });

        expect(step).toBe('account_link');
        expect(handlers.getStep).toHaveBeenCalledWith('kalshi', {});
        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: 'account_link',
          status: 'none',
          sessionId: null,
        });
      });
    });

    it('leaves the step unknown while only a session id is saved', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue({
          ...SESSION_STATUS,
          id: 'sid-1',
        });
        handlers.getStep.mockRejectedValue(new Error('step unavailable'));

        await controller.fetchSessionDisclaimers({ vendor: 'kalshi' });
        await expect(
          controller.refreshStep({ vendor: 'kalshi' }),
        ).rejects.toThrow('step unavailable');

        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: null,
          status: null,
          sessionId: 'sid-1',
        });
      });
    });

    it('replaces a step saved earlier, and keeps the session id', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'vendor_terms',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({ step: 'done', status: 'none' });

          await controller.refreshStep({ vendor: 'kalshi' });

          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'done',
            status: 'none',
            sessionId: 'sid-1',
          });
        },
      );
    });

    it('keeps each vendor apart', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockResolvedValueOnce({ step: 'done', status: 'approved' })
          .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

        await controller.refreshStep({ vendor: 'iron' });
        await controller.refreshStep({ vendor: 'kalshi' });

        expect(controller.state.vendors.iron?.step).toBe('done');
        expect(controller.state.vendors.iron?.status).toBe('approved');
        expect(controller.state.vendors.kalshi?.step).toBe('account_link');
      });
    });

    it('shares one request between overlapping reads', async () => {
      await withController(async ({ controller, handlers }) => {
        let answer: (info: KycStepInfo) => void = () => undefined;
        handlers.getStep.mockReturnValueOnce(
          new Promise<KycStepInfo>((resolve) => {
            answer = resolve;
          }),
        );

        const first = controller.refreshStep({ vendor: 'kalshi' });
        const second = controller.refreshStep({ vendor: 'kalshi' });
        answer({ step: 'account_link', status: 'none' });

        expect(await Promise.all([first, second])).toStrictEqual([
          'account_link',
          'account_link',
        ]);
        expect(handlers.getStep).toHaveBeenCalledTimes(1);
      });
    });

    it('asks again once the earlier read has finished', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockResolvedValueOnce({ step: 'vendor_terms', status: 'none' })
          .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

        await controller.refreshStep({ vendor: 'kalshi' });
        const step = await controller.refreshStep({ vendor: 'kalshi' });

        expect(step).toBe('account_link');
        expect(handlers.getStep).toHaveBeenCalledTimes(2);
      });
    });

    it('does not share reads between vendors', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockResolvedValueOnce({ step: 'done', status: 'approved' })
          .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

        await Promise.all([
          controller.refreshStep({ vendor: 'iron' }),
          controller.refreshStep({ vendor: 'kalshi' }),
        ]);

        expect(handlers.getStep).toHaveBeenCalledTimes(2);
      });
    });

    it('lets every caller of a failed shared read see the failure, then asks again', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockRejectedValueOnce(new Error('down'))
          .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

        const first = controller.refreshStep({ vendor: 'kalshi' });
        const second = controller.refreshStep({ vendor: 'kalshi' });

        await expect(first).rejects.toThrow('down');
        await expect(second).rejects.toThrow('down');
        expect(await controller.refreshStep({ vendor: 'kalshi' })).toBe(
          'account_link',
        );
      });
    });

    describe('after a change at kyc-api', () => {
      const linked = {
        startLink: vi.fn().mockResolvedValue(undefined),
        verifyLink: vi.fn().mockResolvedValue({}),
      };

      it('does not join a read that started before the change', async () => {
        await withController(
          { options: { accountLinkAdapters: { kalshi: linked } } },
          async ({ controller, handlers }) => {
            let answerOld: (info: KycStepInfo) => void = () => undefined;
            handlers.getStep
              .mockReturnValueOnce(
                new Promise<KycStepInfo>((resolve) => {
                  answerOld = resolve;
                }),
              )
              .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

            const old = controller.refreshStep({ vendor: 'kalshi' });
            const step = await controller.startAccountLink({
              vendor: 'kalshi',
              email: 'a@b.co',
            });
            answerOld({ step: 'account_link', status: 'none' });
            await old;

            expect(step).toBe('account_link');
            expect(handlers.getStep).toHaveBeenCalledTimes(2);
            expect(controller.state.vendors.kalshi?.step).toBe('account_link');
          },
        );
      });

      it('lets a later plain read join the read the change started', async () => {
        await withController(
          { options: { accountLinkAdapters: { kalshi: linked } } },
          async ({ controller, handlers }) => {
            let answer: (info: KycStepInfo) => void = () => undefined;
            handlers.getStep.mockReturnValueOnce(
              new Promise<KycStepInfo>((resolve) => {
                answer = resolve;
              }),
            );

            const action = controller.startAccountLink({
              vendor: 'kalshi',
              email: 'a@b.co',
            });
            await flushPromises();
            const plain = controller.refreshStep({ vendor: 'kalshi' });
            answer({ step: 'account_link', status: 'none' });

            expect(await Promise.all([action, plain])).toStrictEqual([
              'account_link',
              'account_link',
            ]);
            expect(handlers.getStep).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('drops an older read that finishes after a newer one', async () => {
        await withController(async ({ controller, handlers }) => {
          let answerOld: (info: KycStepInfo) => void = () => undefined;
          handlers.getStep
            .mockReturnValueOnce(
              new Promise<KycStepInfo>((resolve) => {
                answerOld = resolve;
              }),
            )
            .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

          const old = controller.refreshStep({ vendor: 'kalshi' });
          // An action starts its own read, which answers first.
          await controller.acceptTerms({
            vendor: 'kalshi',
            disclaimerIds: ['a'],
          });
          answerOld({ step: 'vendor_terms', status: 'none' });
          await old;

          expect(controller.state.vendors.kalshi?.step).toBe('account_link');
        });
      });

      it('does not let a later refresh join a read an action overtook', async () => {
        await withController(async ({ controller, handlers }) => {
          let answerOld: (info: KycStepInfo) => void = () => undefined;
          handlers.getStep
            .mockReturnValueOnce(
              new Promise<KycStepInfo>((resolve) => {
                answerOld = resolve;
              }),
            )
            .mockResolvedValueOnce({ step: 'account_link', status: 'none' })
            .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

          const old = controller.refreshStep({ vendor: 'kalshi' });
          await controller.acceptTerms({
            vendor: 'kalshi',
            disclaimerIds: ['a'],
          });
          const fresh = await controller.refreshStep({ vendor: 'kalshi' });
          answerOld({ step: 'vendor_terms', status: 'none' });
          await old;

          expect(fresh).toBe('account_link');
          expect(handlers.getStep).toHaveBeenCalledTimes(3);
        });
      });
    });

    it('leaves the saved step alone when kyc-api fails', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'account_link',
                  status: 'none',
                  sessionId: null,
                },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockRejectedValue(new Error('down'));

          await expect(
            controller.refreshStep({ vendor: 'kalshi' }),
          ).rejects.toThrow('down');

          expect(controller.state.vendors.kalshi?.step).toBe('account_link');
        },
      );
    });
  });

  describe('acceptTerms', () => {
    it('sends the terms to kyc-api, then saves the step it reads', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'account_link',
          status: 'none',
        });

        const step = await controller.acceptTerms({
          vendor: 'kalshi',
          disclaimerIds: ['tos-v1'],
          country: 'USA',
        });

        expect(step).toBe('account_link');
        expect(handlers.acceptVendorTerms).toHaveBeenCalledWith({
          vendor: 'kalshi',
          disclaimerIds: ['tos-v1'],
          country: 'USA',
        });
        expect(controller.state.vendors.kalshi?.step).toBe('account_link');
      });
    });

    it('leaves the country out when none is given', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'confirm_identity',
          status: 'none',
        });

        await controller.acceptTerms({
          vendor: 'iron',
          disclaimerIds: ['tos-v1'],
        });

        expect(handlers.acceptVendorTerms).toHaveBeenCalledWith({
          vendor: 'iron',
          disclaimerIds: ['tos-v1'],
        });
      });
    });

    it('saves nothing when kyc-api rejects the terms', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.acceptVendorTerms.mockRejectedValue(new Error('rejected'));

        await expect(
          controller.acceptTerms({ vendor: 'kalshi', disclaimerIds: ['a'] }),
        ).rejects.toThrow('rejected');

        expect(controller.state.vendors).toStrictEqual({});
      });
    });
  });

  describe('account link', () => {
    it('starts the link through the adapter, then reads the step', async () => {
      const adapter = getAdapter();
      await withController(
        { options: { accountLinkAdapters: { kalshi: adapter } } },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'account_link',
            status: 'none',
          });

          const step = await controller.startAccountLink({
            vendor: 'kalshi',
            email: 'a@b.co',
          });

          expect(adapter.startLink).toHaveBeenCalledWith({ email: 'a@b.co' });
          expect(step).toBe('account_link');
          expect(controller.state.vendors.kalshi?.step).toBe('account_link');
        },
      );
    });

    it('verifies the code through the adapter, then reads the step', async () => {
      const adapter = getAdapter();
      await withController(
        { options: { accountLinkAdapters: { kalshi: adapter } } },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'confirm_identity',
            status: 'none',
          });

          const result = await controller.verifyAccountLink({
            vendor: 'kalshi',
            code: '888888',
          });

          expect(adapter.verifyLink).toHaveBeenCalledWith({ code: '888888' });
          expect(result).toStrictEqual({ step: 'confirm_identity' });
        },
      );
    });

    it('passes on the MFA method the vendor asks for, without saving it', async () => {
      const adapter = getAdapter();
      adapter.verifyLink.mockResolvedValue({ mfaMethod: 'sms' });
      await withController(
        { options: { accountLinkAdapters: { kalshi: adapter } } },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'account_link',
            status: 'none',
          });

          const result = await controller.verifyAccountLink({
            vendor: 'kalshi',
            code: '888888',
          });

          expect(result).toStrictEqual({
            step: 'account_link',
            mfaMethod: 'sms',
          });
          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'account_link',
            status: 'none',
            sessionId: null,
          });
        },
      );
    });

    it('does not read the step when the adapter fails', async () => {
      const adapter = getAdapter();
      adapter.startLink.mockRejectedValue(new Error('link failed'));
      await withController(
        { options: { accountLinkAdapters: { kalshi: adapter } } },
        async ({ controller, handlers }) => {
          await expect(
            controller.startAccountLink({ vendor: 'kalshi', email: 'a@b.co' }),
          ).rejects.toThrow('link failed');

          expect(handlers.getStep).not.toHaveBeenCalled();
        },
      );
    });

    it('throws when the vendor has no adapter', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.startAccountLink({ vendor: 'iron', email: 'a@b.co' }),
        ).rejects.toThrow('no account link adapter for iron');
        await expect(
          controller.verifyAccountLink({ vendor: 'iron', code: '1' }),
        ).rejects.toThrow('no account link adapter for iron');
      });
    });
  });

  describe('onboarding steps', () => {
    it.each([
      [
        'submitPhone',
        { phoneNumber: '+18888888888' },
        'phone/send-otp',
        {
          phoneNumber: '+18888888888',
        },
      ],
      [
        'submitPhoneCode',
        { code: '888888' },
        'phone/verify-otp',
        {
          otp: '888888',
        },
      ],
      [
        'submitEmailCode',
        { code: '123456' },
        'email/verify-otp',
        {
          otp: '123456',
        },
      ],
    ] as const)(
      '%s runs its step on the saved session, then reads the step',
      async (method, args, step, body) => {
        await withController(
          {
            options: {
              state: {
                vendors: {
                  kalshi: {
                    step: 'identity_provider',
                    status: 'none',
                    sessionId: 'sid-1',
                  },
                },
              },
            },
          },
          async ({ controller, handlers }) => {
            handlers.getStep.mockResolvedValue({
              step: 'identity_provider',
              status: 'none',
            });

            const next = await controller[method]({
              vendor: 'kalshi',
              ...args,
            } as never);

            expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
              sessionId: 'sid-1',
              step,
              body,
            });
            expect(next).toBe('identity_provider');
            expect(handlers.getSessionStatusForVendor).not.toHaveBeenCalled();
          },
        );
      },
    );

    it('resends the email code without a body', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'identity_provider',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'identity_provider',
            status: 'none',
          });

          await controller.resendEmailCode({ vendor: 'kalshi' });

          expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
            sessionId: 'sid-1',
            step: 'email/resend-otp',
          });
        },
      );
    });

    it('asks kyc-api for the session when the phone has none, and keeps it', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(SESSION_STATUS);
        handlers.getStep.mockResolvedValue({
          step: 'identity_provider',
          status: 'none',
        });

        await controller.submitEmailCode({ vendor: 'kalshi', code: '123456' });

        expect(handlers.getSessionStatusForVendor).toHaveBeenCalledWith(
          'kalshi',
        );
        expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          step: 'email/verify-otp',
          body: { otp: '123456' },
        });
        expect(controller.state.vendors.kalshi?.sessionId).toBe('sid-1');
      });
    });

    it('throws when there is no session to continue', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(null);

        await expect(
          controller.submitPhone({
            vendor: 'kalshi',
            phoneNumber: '+18888888888',
          }),
        ).rejects.toThrow('no kalshi session to continue');
        expect(handlers.postOnboardingStep).not.toHaveBeenCalled();
      });
    });
  });

  describe('startSession', () => {
    it('creates and authorizes a session, then reads the step', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'identity_provider',
          status: 'none',
        });

        const step = await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
        });

        expect(step).toBe('identity_provider');
        expect(handlers.getGeoCountry).toHaveBeenCalledOnce();
        expect(handlers.createUkycSession).toHaveBeenCalledWith({
          sessionClientPublicKey: expect.any(String),
          residenceCountry: 'USA',
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          partnerIdentityToken: 'partner-token',
        });
        expect(handlers.setAuthorizations).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          wrappedEncryptionDataKey: { data: 'enc', nonce: 'nonce' },
          wrappedUkycCapabilityToken: { data: 'enc', nonce: 'nonce' },
        });
        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: 'identity_provider',
          status: 'none',
          sessionId: 'sid-1',
        });
      });
    });

    it('sends no email, because kyc-api takes it from the identity token', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
        });

        expect(handlers.createUkycSession.mock.calls[0][0]).not.toHaveProperty(
          'email',
        );
      });
    });

    it('verifies both wrapping keys before it trusts them', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
        });

        expect(handlers.fetchIdosEnclaveJwks).toHaveBeenCalledOnce();
        expect(handlers.fetchIdosRelayJwks).toHaveBeenCalledOnce();
        expect(mockAssertAttestedServerPublicKey).toHaveBeenCalledTimes(2);
      });
    });

    it('creates the local user secret when the user has none', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
        });

        expect(handlers.performGetStorage).toHaveBeenCalled();
        expect(handlers.performSetStorage).toHaveBeenCalledOnce();
      });
    });

    it('records the consent before it mints the identity token', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
        });

        // MetaMask Auth answers 403 consent_required for an audience the
        // user has not granted, so the order is load-bearing.
        expect(handlers.putIdentitySharingConsent).toHaveBeenCalledWith({
          audience: 'iron',
          granted: true,
        });
        expect(
          handlers.putIdentitySharingConsent.mock.invocationCallOrder[0],
        ).toBeLessThan(
          handlers.getPartnerIdentityToken.mock.invocationCallOrder[0],
        );
      });
    });

    it('sends the minted token to kyc-api', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
        });

        expect(handlers.getPartnerIdentityToken).toHaveBeenCalledWith(
          ['email'],
          'iron',
        );
        expect(handlers.createUkycSession).toHaveBeenCalledWith(
          expect.objectContaining({ partnerIdentityToken: 'partner-token' }),
        );
      });
    });

    it('does not create a session when kyc-api already has one', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(SESSION_STATUS);
        handlers.getStep.mockResolvedValue({ step: 'done', status: 'none' });

        const step = await controller.startSession({ vendor: 'kalshi' });

        expect(step).toBe('done');
        expect(handlers.createUkycSession).not.toHaveBeenCalled();
        expect(handlers.resetWrappingKeys).not.toHaveBeenCalled();
        expect(controller.state.vendors.kalshi?.sessionId).toBe('sid-1');
      });
    });

    it.each(['new', 'expired'])(
      'sends fresh authorizations when the session says they are %s',
      async (capabilityAuthorizationStatus) => {
        await withController(async ({ controller, handlers }) => {
          handlers.getSessionStatusForVendor.mockResolvedValue({
            ...SESSION_STATUS,
            capabilityAuthorizationStatus,
          });

          await controller.startSession({ vendor: 'kalshi' });

          expect(handlers.resetWrappingKeys).toHaveBeenCalledWith({
            sessionId: 'sid-1',
            sessionClientPublicKey: expect.any(String),
          });
          expect(handlers.setAuthorizations).toHaveBeenCalledOnce();
          expect(handlers.createUkycSession).not.toHaveBeenCalled();
        });
      },
    );

    it('leaves authorizations alone once KYC has finished', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue({
          ...SESSION_STATUS,
          finalStatus: 'approved',
          capabilityAuthorizationStatus: 'expired',
        });

        await controller.startSession({ vendor: 'kalshi' });

        expect(handlers.resetWrappingKeys).not.toHaveBeenCalled();
      });
    });

    it('needs an AAL2 token to create a session', async () => {
      await withController(async ({ controller, handlers }) => {
        await expect(
          controller.startSession({ vendor: 'kalshi' }),
        ).rejects.toThrow('aal2Token is required');

        expect(handlers.createUkycSession).not.toHaveBeenCalled();
        expect(controller.state.vendors).toStrictEqual({});
      });
    });

    it('does not save a session when the wrapping keys fail to verify', async () => {
      await withController(async ({ controller, handlers }) => {
        mockAssertAttestedServerPublicKey.mockImplementationOnce(() => {
          throw new Error('bad key');
        });

        await expect(
          controller.startSession({
            vendor: 'kalshi',
            aal2Token: AAL2_TOKEN,
          }),
        ).rejects.toThrow('Failed to verify the wrapping keys');

        expect(handlers.setAuthorizations).not.toHaveBeenCalled();
        expect(controller.state.vendors).toStrictEqual({});
      });
    });

    it('explains when the issuer keys cannot be fetched', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.fetchIdosRelayJwks.mockRejectedValue(new Error('offline'));

        await expect(
          controller.startSession({
            vendor: 'kalshi',
            aal2Token: AAL2_TOKEN,
          }),
        ).rejects.toThrow('Unable to fetch JWKS');

        expect(handlers.setAuthorizations).not.toHaveBeenCalled();
      });
    });
  });

  describe('session disclaimers', () => {
    const SESSION_DISCLAIMERS = {
      idOS: [
        {
          key: 'idos-tos',
          version: '1',
          title: 'idOS ToS',
          url: 'https://idos.example/tos',
          consented: false,
        },
      ],
      kycProvider: [],
      credentialReusabilityConsentGiven: false,
    };
    const saved = {
      options: {
        state: {
          vendors: {
            kalshi: {
              step: 'identity_provider',
              status: 'none',
              sessionId: 'sid-1',
            },
          },
        },
      },
    } satisfies WithControllerOptions;

    it('fetches the documents for the saved session without saving them', async () => {
      await withController(saved, async ({ controller, handlers }) => {
        handlers.fetchSessionDisclaimersBySessionId.mockResolvedValue(
          SESSION_DISCLAIMERS,
        );

        const result = await controller.fetchSessionDisclaimers({
          vendor: 'kalshi',
        });

        expect(result).toStrictEqual(SESSION_DISCLAIMERS);
        expect(
          handlers.fetchSessionDisclaimersBySessionId,
        ).toHaveBeenCalledWith({ sessionId: 'sid-1' });
        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: 'identity_provider',
          status: 'none',
          sessionId: 'sid-1',
        });
      });
    });

    it('asks kyc-api for the session when the phone has none', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(SESSION_STATUS);
        handlers.fetchSessionDisclaimersBySessionId.mockResolvedValue(
          SESSION_DISCLAIMERS,
        );

        await controller.fetchSessionDisclaimers({ vendor: 'kalshi' });

        expect(
          handlers.fetchSessionDisclaimersBySessionId,
        ).toHaveBeenCalledWith({ sessionId: 'sid-1' });
      });
    });

    it('throws when there is no session to fetch documents for', async () => {
      await withController(async ({ controller, handlers }) => {
        await expect(
          controller.fetchSessionDisclaimers({ vendor: 'kalshi' }),
        ).rejects.toThrow('no kalshi session to continue');
        expect(
          handlers.fetchSessionDisclaimersBySessionId,
        ).not.toHaveBeenCalled();
      });
    });

    it('records the consents with kyc-api, then reads the step', async () => {
      await withController(saved, async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({ step: 'done', status: 'none' });

        const step = await controller.acceptSessionDisclaimers({
          vendor: 'kalshi',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        });

        expect(step).toBe('done');
        expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        });
        expect(controller.state.vendors.kalshi?.step).toBe('done');
      });
    });

    it('passes on a refusal to share credentials', async () => {
      await withController(saved, async ({ controller, handlers }) => {
        await controller.acceptSessionDisclaimers({
          vendor: 'kalshi',
          idOS: [],
          kycProvider: [],
          credentialReusabilityConsentGiven: false,
        });

        expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith(
          expect.objectContaining({ credentialReusabilityConsentGiven: false }),
        );
      });
    });

    it('does not read the step when kyc-api rejects the consents', async () => {
      await withController(saved, async ({ controller, handlers }) => {
        handlers.submitSessionDisclaimers.mockRejectedValue(
          new Error('conflict'),
        );

        await expect(
          controller.acceptSessionDisclaimers({
            vendor: 'kalshi',
            idOS: [],
            kycProvider: [],
            credentialReusabilityConsentGiven: false,
          }),
        ).rejects.toThrow('conflict');

        expect(handlers.getStep).not.toHaveBeenCalled();
      });
    });
  });

  describe('launchProviderFlow', () => {
    const saved = {
      state: {
        vendors: {
          kalshi: {
            step: 'identity_provider',
            status: 'none',
            sessionId: 'sid-1',
          },
        },
      },
    } satisfies WithControllerOptions['options'];

    type Launcher = NonNullable<
      VendorOnboardingControllerOptions['sumsubLauncher']
    >;
    const getLauncher = (
      launch: Mock = vi.fn().mockResolvedValue({ status: 'Pending' }),
      isAvailable = true,
    ): Launcher & { launch: Mock } => ({
      isAvailable: () => isAvailable,
      launch,
    });

    it('launches SumSub for the session, then tells kyc-api it was submitted', async () => {
      const launcher = getLauncher();
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller, handlers }) => {
          handlers.createJourney.mockResolvedValue({
            applicantAccessToken: 'token-1',
          });
          handlers.getStep.mockResolvedValue({ step: 'done', status: 'none' });

          const outcome = await controller.launchProviderFlow({
            vendor: 'kalshi',
            locale: 'fr',
          });

          expect(outcome).toBe('submitted');
          expect(handlers.createJourney).toHaveBeenCalledWith('sid-1');
          expect(launcher.launch).toHaveBeenCalledWith(
            expect.objectContaining({
              applicantAccessToken: 'token-1',
              locale: 'fr',
              debug: false,
            }),
          );
          // Nothing records a submission: kyc-api reads where the user is
          // from the relay, so the phone only asks.
          expect(handlers.getStep).toHaveBeenCalledTimes(1);
          expect(controller.state.vendors.kalshi?.step).toBe('done');
        },
      );
    });

    it('counts a completion the SDK only reports through its callback', async () => {
      const launcher = getLauncher(
        vi
          .fn()
          .mockImplementation(
            async ({ onStatusChange }: KycSumSubLaunchParams) => {
              onStatusChange?.('Incomplete', 'Pending');
              return {};
            },
          ),
      );
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller }) => {
          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('submitted');
        },
      );
    });

    it.each(['TemporarilyDeclined', 'FinallyRejected', 'Approved'])(
      'reports abandoned when the SDK only opens on the %s decision',
      async (status) => {
        const launcher = getLauncher(
          vi
            .fn()
            .mockImplementation(
              async ({ onStatusChange }: KycSumSubLaunchParams) => {
                onStatusChange?.('Ready', status);
                return { status };
              },
            ),
        );
        await withController(
          { options: { ...saved, sumsubLauncher: launcher } },
          async ({ controller, handlers }) => {
            expect(
              await controller.launchProviderFlow({ vendor: 'kalshi' }),
            ).toBe('abandoned');
            expect(handlers.getStep).not.toHaveBeenCalled();
          },
        );
      },
    );

    it('counts a decision that follows a submission', async () => {
      const launcher = getLauncher(
        vi
          .fn()
          .mockImplementation(
            async ({ onStatusChange }: KycSumSubLaunchParams) => {
              onStatusChange?.('Incomplete', 'Pending');
              onStatusChange?.('Pending', 'TemporarilyDeclined');
              return { status: 'TemporarilyDeclined' };
            },
          ),
      );
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller }) => {
          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('submitted');
        },
      );
    });

    it('reports abandoned when a Pending partway through a level is followed by Initial', async () => {
      const launcher = getLauncher(
        vi
          .fn()
          .mockImplementation(
            async ({ onStatusChange }: KycSumSubLaunchParams) => {
              onStatusChange?.('Incomplete', 'Pending');
              onStatusChange?.('Pending', 'Initial');
              return {};
            },
          ),
      );
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller, handlers }) => {
          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('abandoned');
          expect(handlers.getStep).not.toHaveBeenCalled();
        },
      );
    });

    it('gets a fresh access token when SumSub asks for one', async () => {
      const launcher = getLauncher(
        vi
          .fn()
          .mockImplementation(
            async ({ onTokenExpiration }: KycSumSubLaunchParams) => {
              expect(await onTokenExpiration()).toBe('token-2');
              return { status: 'Pending' };
            },
          ),
      );
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller, handlers }) => {
          handlers.createJourney
            .mockResolvedValueOnce({ applicantAccessToken: 'token-1' })
            .mockResolvedValueOnce({ applicantAccessToken: 'token-2' });

          await controller.launchProviderFlow({ vendor: 'kalshi' });

          expect(handlers.createJourney).toHaveBeenCalledTimes(2);
        },
      );
    });

    it.each(['Incomplete', 'Initial', 'Ready'])(
      'reports abandoned, and tells kyc-api nothing, when the user leaves at %s',
      async (status) => {
        const launcher = getLauncher(vi.fn().mockResolvedValue({ status }));
        await withController(
          { options: { ...saved, sumsubLauncher: launcher } },
          async ({ controller, handlers }) => {
            expect(
              await controller.launchProviderFlow({ vendor: 'kalshi' }),
            ).toBe('abandoned');
            expect(handlers.getStep).not.toHaveBeenCalled();
          },
        );
      },
    );

    it('reports failed when SumSub says it could not run', async () => {
      const launcher = getLauncher(
        vi.fn().mockResolvedValue({ status: 'Failed' }),
      );
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller, handlers }) => {
          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('failed');
          expect(handlers.getStep).not.toHaveBeenCalled();
        },
      );
    });

    it('reports failed when the SDK is not available', async () => {
      const launcher = getLauncher(undefined, false);
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller, handlers }) => {
          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('failed');
          expect(launcher.launch).not.toHaveBeenCalled();
          expect(handlers.createJourney).not.toHaveBeenCalled();
        },
      );
    });

    it('reports failed when no launcher was given', async () => {
      await withController(
        { options: saved },
        async ({ controller, handlers }) => {
          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('failed');
          expect(handlers.createJourney).not.toHaveBeenCalled();
        },
      );
    });

    it('reports failed when the access token cannot be fetched', async () => {
      const launcher = getLauncher();
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller, handlers }) => {
          handlers.createJourney.mockRejectedValue(new Error('down'));

          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('failed');
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('reports failed when there is no session to verify', async () => {
      const launcher = getLauncher();
      await withController(
        { options: { sumsubLauncher: launcher } },
        async ({ controller }) => {
          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('failed');
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('reports failed when kyc-api cannot be asked where the user is', async () => {
      const launcher = getLauncher();
      await withController(
        { options: { ...saved, sumsubLauncher: launcher } },
        async ({ controller, handlers }) => {
          handlers.getStep.mockRejectedValue(new Error('down'));

          expect(
            await controller.launchProviderFlow({ vendor: 'kalshi' }),
          ).toBe('failed');
        },
      );
    });
  });

  describe('the step an action reads once it has run', () => {
    const saved = {
      state: {
        vendors: {
          kalshi: {
            step: 'identity_provider',
            status: 'none',
            sessionId: 'sid-1',
          },
        },
      },
    } satisfies WithControllerOptions['options'];

    it('reads and saves the step after accepting terms', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'account_link',
          status: 'none',
        });

        const step = await controller.acceptTerms({
          vendor: 'kalshi',
          disclaimerIds: ['a'],
        });

        expect(handlers.acceptVendorTerms).toHaveBeenCalledTimes(1);
        // Read after the write, so the step reflects the terms just stored.
        expect(
          handlers.acceptVendorTerms.mock.invocationCallOrder[0],
        ).toBeLessThan(handlers.getStep.mock.invocationCallOrder[0]);
        expect(step).toBe('account_link');
        expect(controller.state.vendors.kalshi?.step).toBe('account_link');
      });
    });

    it.each([
      ['submitPhone', { phoneNumber: '+18888888888' }],
      ['submitPhoneCode', { code: '888888' }],
      ['submitEmailCode', { code: '123456' }],
      ['resendEmailCode', {}],
    ] as const)(
      '%s reads the step once the code step has run',
      async (method, args) => {
        await withController(
          { options: saved },
          async ({ controller, handlers }) => {
            handlers.postOnboardingStep.mockResolvedValue(SESSION_STATUS);
            handlers.getStep.mockResolvedValue({
              step: 'identity_phone',
              status: 'none',
            });

            const step = await controller[method]({
              vendor: 'kalshi',
              ...args,
            } as never);

            expect(step).toBe('identity_phone');
            expect(handlers.getStep).toHaveBeenCalledTimes(1);
            expect(
              handlers.postOnboardingStep.mock.invocationCallOrder[0],
            ).toBeLessThan(handlers.getStep.mock.invocationCallOrder[0]);
            expect(controller.state.vendors.kalshi?.step).toBe(
              'identity_phone',
            );
          },
        );
      },
    );

    it('reads the step after a verified account link code', async () => {
      const adapter = {
        startLink: vi.fn(),
        verifyLink: vi.fn().mockResolvedValue({}),
      };
      await withController(
        { options: { accountLinkAdapters: { kalshi: adapter } } },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'confirm_identity',
            status: 'none',
          });

          const result = await controller.verifyAccountLink({
            vendor: 'kalshi',
            code: '888888',
          });

          expect(result).toStrictEqual({ step: 'confirm_identity' });
          expect(handlers.getStep).toHaveBeenCalledTimes(1);
          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'confirm_identity',
            status: 'none',
            sessionId: null,
          });
        },
      );
    });

    it('asks for the step when the adapter returns none, such as for a second code', async () => {
      const adapter = {
        startLink: vi.fn(),
        verifyLink: vi.fn().mockResolvedValue({ mfaMethod: 'sms' }),
      };
      await withController(
        { options: { accountLinkAdapters: { kalshi: adapter } } },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'account_link',
            status: 'none',
          });

          const result = await controller.verifyAccountLink({
            vendor: 'kalshi',
            code: '888888',
          });

          expect(result).toStrictEqual({
            step: 'account_link',
            mfaMethod: 'sms',
          });
          expect(handlers.getStep).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('reset', () => {
    const state = {
      vendors: {
        iron: { step: 'done', status: 'none', sessionId: 'sid-iron' },
        kalshi: {
          step: 'done',
          status: 'none',
          sessionId: 'sid-kalshi',
        },
      },
    } satisfies VendorOnboardingControllerOptions['state'];

    it('forgets one vendor and keeps the other', async () => {
      await withController({ options: { state } }, ({ controller }) => {
        controller.reset({ vendor: 'kalshi' });

        expect(controller.state.vendors).toStrictEqual({
          iron: state.vendors.iron,
        });
      });
    });

    it('forgets every vendor when none is named', async () => {
      await withController({ options: { state } }, ({ controller }) => {
        controller.reset();

        expect(controller.state.vendors).toStrictEqual({});
      });
    });

    it.each([
      ['the vendor', { vendor: 'kalshi' as const }],
      ['every vendor', undefined],
    ])(
      'drops a step read in flight when forgetting %s',
      async (_label, params) => {
        await withController(
          { options: { state } },
          async ({ controller, handlers }) => {
            let answer: (info: KycStepInfo) => void = () => undefined;
            handlers.getStep
              .mockReturnValueOnce(
                new Promise<KycStepInfo>((resolve) => {
                  answer = resolve;
                }),
              )
              .mockResolvedValueOnce({ step: 'account_link', status: 'none' });

            const pending = controller.refreshStep({ vendor: 'kalshi' });
            controller.reset(params);
            answer({ step: 'identity_phone', status: 'none' });
            await pending;

            expect(controller.state.vendors.kalshi).toBeUndefined();
            // A refresh after the reset asks again instead of joining.
            expect(await controller.refreshStep({ vendor: 'kalshi' })).toBe(
              'account_link',
            );
            expect(handlers.getStep).toHaveBeenCalledTimes(2);
          },
        );
      },
    );
  });

  describe('messenger actions', () => {
    it('exposes the actions on the messenger', async () => {
      await withController(async ({ rootMessenger, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'vendor_terms',
          status: 'none',
        });

        const step = await rootMessenger.call(
          'VendorOnboardingController:refreshStep',
          {
            vendor: 'iron',
          },
        );

        expect(step).toBe('vendor_terms');
      });
    });
  });
});

type ServiceHandlers = {
  getStep: Mock;
  acceptVendorTerms: Mock;
  postOnboardingStep: Mock;
  getSessionStatusForVendor: Mock;
  createJourney: Mock;
  fetchSessionDisclaimersBySessionId: Mock;
  submitSessionDisclaimers: Mock;
  getGeoCountry: Mock;
  createUkycSession: Mock;
  resetWrappingKeys: Mock;
  setAuthorizations: Mock;
  fetchIdosEnclaveJwks: Mock;
  fetchIdosRelayJwks: Mock;
  performGetStorage: Mock;
  performSetStorage: Mock;
  putIdentitySharingConsent: Mock;
  getPartnerIdentityToken: Mock;
};

type WithControllerOptions = {
  options?: Partial<VendorOnboardingControllerOptions>;
};

type WithControllerCallback<ReturnValue> = (payload: {
  controller: VendorOnboardingController;
  rootMessenger: RootMessenger;
  handlers: ServiceHandlers;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Builds a controller on a messenger whose KycService actions are mocks.
 *
 * @param args - Either a callback, or options and a callback.
 * @returns Whatever the callback returns.
 */
function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): ReturnValue | Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: VendorOnboardingControllerMessenger = new Messenger({
    namespace: 'VendorOnboardingController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'KycService:getStep',
      'KycService:acceptVendorTerms',
      'KycService:postOnboardingStep',
      'KycService:getSessionStatusForVendor',
      'KycService:createJourney',
      'KycService:fetchSessionDisclaimersBySessionId',
      'KycService:submitSessionDisclaimers',
      'KycService:getGeoCountry',
      'KycService:createUkycSession',
      'KycService:resetWrappingKeys',
      'KycService:setAuthorizations',
      'KycService:fetchIdosEnclaveJwks',
      'KycService:fetchIdosRelayJwks',
      'UserStorageController:performGetStorage',
      'UserStorageController:performSetStorage',
      'AuthenticatedUserStorageService:putIdentitySharingConsent',
      'AuthenticationController:getPartnerIdentityToken',
    ],
    events: [],
    messenger,
  });

  const handlers: ServiceHandlers = {
    getStep: vi
      .fn()
      .mockResolvedValue({ step: 'vendor_terms', status: 'none' }),
    acceptVendorTerms: vi.fn().mockResolvedValue(undefined),
    postOnboardingStep: vi.fn().mockResolvedValue(SESSION_STATUS),
    getSessionStatusForVendor: vi.fn().mockResolvedValue(null),
    createJourney: vi
      .fn()
      .mockResolvedValue({ status: 'ok', applicantAccessToken: 'aat' }),
    fetchSessionDisclaimersBySessionId: vi.fn().mockResolvedValue({
      idOS: [],
      kycProvider: [],
      credentialReusabilityConsentGiven: false,
    }),
    submitSessionDisclaimers: vi.fn().mockResolvedValue({
      idOS: [],
      kycProvider: [],
      credentialReusabilityConsentGiven: true,
    }),
    getGeoCountry: vi.fn().mockResolvedValue('USA'),
    createUkycSession: vi.fn().mockResolvedValue(UKYC_SESSION),
    resetWrappingKeys: vi.fn().mockResolvedValue(UKYC_SESSION),
    setAuthorizations: vi.fn().mockResolvedValue(SESSION_STATUS),
    fetchIdosEnclaveJwks: vi.fn().mockResolvedValue({ keys: [] }),
    fetchIdosRelayJwks: vi.fn().mockResolvedValue({ keys: [] }),
    performGetStorage: vi.fn().mockResolvedValue(null),
    performSetStorage: vi.fn().mockResolvedValue(undefined),
    putIdentitySharingConsent: vi.fn().mockResolvedValue(undefined),
    getPartnerIdentityToken: vi.fn().mockResolvedValue('partner-token'),
  };
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:putIdentitySharingConsent',
    handlers.putIdentitySharingConsent,
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:getPartnerIdentityToken',
    handlers.getPartnerIdentityToken,
  );
  rootMessenger.registerActionHandler('KycService:getStep', handlers.getStep);
  rootMessenger.registerActionHandler(
    'KycService:acceptVendorTerms',
    handlers.acceptVendorTerms,
  );
  rootMessenger.registerActionHandler(
    'KycService:postOnboardingStep',
    handlers.postOnboardingStep,
  );
  rootMessenger.registerActionHandler(
    'KycService:getSessionStatusForVendor',
    handlers.getSessionStatusForVendor,
  );
  rootMessenger.registerActionHandler(
    'KycService:createJourney',
    handlers.createJourney,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchSessionDisclaimersBySessionId',
    handlers.fetchSessionDisclaimersBySessionId,
  );
  rootMessenger.registerActionHandler(
    'KycService:submitSessionDisclaimers',
    handlers.submitSessionDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:getGeoCountry',
    handlers.getGeoCountry,
  );
  rootMessenger.registerActionHandler(
    'KycService:createUkycSession',
    handlers.createUkycSession,
  );
  rootMessenger.registerActionHandler(
    'KycService:resetWrappingKeys',
    handlers.resetWrappingKeys,
  );
  rootMessenger.registerActionHandler(
    'KycService:setAuthorizations',
    handlers.setAuthorizations,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchIdosEnclaveJwks',
    handlers.fetchIdosEnclaveJwks,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchIdosRelayJwks',
    handlers.fetchIdosRelayJwks,
  );
  rootMessenger.registerActionHandler(
    'UserStorageController:performGetStorage',
    handlers.performGetStorage,
  );
  rootMessenger.registerActionHandler(
    'UserStorageController:performSetStorage',
    handlers.performSetStorage,
  );
  mockAssertAttestedServerPublicKey.mockReset();
  mockWrapEncryptionKey.mockReset();
  mockWrapEncryptionKey.mockReturnValue({ data: 'enc', nonce: 'nonce' });

  const controller = new VendorOnboardingController({ messenger, ...options });
  return testFunction({ controller, rootMessenger, handlers });
}

/**
 * Builds an account link adapter whose calls succeed.
 *
 * @returns The adapter, with mock functions.
 */
function getAdapter(): {
  startLink: Mock;
  verifyLink: Mock;
} & KycAccountLinkAdapter {
  return {
    startLink: vi.fn().mockResolvedValue(undefined),
    verifyLink: vi.fn().mockResolvedValue({}),
  };
}
