import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';
import type { MockedFunction } from 'vitest';

import {
  getDefaultKycFlowControllerState,
  KycFlowController,
} from './KycFlowController.js';
import type {
  KycAccountLinkAdapter,
  KycFlowControllerMessenger,
  KycFlowControllerOptions,
} from './KycFlowController.js';
import type { KycSessionStatus, KycStep } from './types.js';
import { assertAttestedServerPublicKey } from './ukyc/jwtChain.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';

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
  MessengerActions<KycFlowControllerMessenger>,
  MessengerEvents<KycFlowControllerMessenger>
>;

const SESSION_STATUS: KycSessionStatus = {
  id: 'sid-1',
  finalStatus: 'new',
  externalUserId: 'ext-1',
  kycStatus: 'new',
  vendor: 'kalshi',
  vendorStatus: 'new',
};

describe('KycFlowController', () => {
  describe('constructor', () => {
    it('starts with no vendors', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultKycFlowControllerState(),
        );
      });
    });

    it('merges initial state over the defaults', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: { kalshi: { step: 'kyc_pending', sessionId: 'sid-1' } },
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'kyc_pending',
            sessionId: 'sid-1',
          });
        },
      );
    });
  });

  describe('refreshStep', () => {
    it('saves the step kyc-api answers with', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue('account_link');

        const step = await controller.refreshStep({ vendor: 'kalshi' });

        expect(step).toBe('account_link');
        expect(handlers.getStep).toHaveBeenCalledWith('kalshi');
        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: 'account_link',
          sessionId: null,
        });
      });
    });

    it('replaces a step saved earlier, and keeps the session id', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: { kalshi: { step: 'vendor_terms', sessionId: 'sid-1' } },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue('approved');

          await controller.refreshStep({ vendor: 'kalshi' });

          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'approved',
            sessionId: 'sid-1',
          });
        },
      );
    });

    it('keeps each vendor apart', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockResolvedValueOnce('approved')
          .mockResolvedValueOnce('account_link');

        await controller.refreshStep({ vendor: 'iron' });
        await controller.refreshStep({ vendor: 'kalshi' });

        expect(controller.state.vendors.iron?.step).toBe('approved');
        expect(controller.state.vendors.kalshi?.step).toBe('account_link');
      });
    });

    it('ignores a slow answer that a newer request has passed', async () => {
      await withController(async ({ controller, handlers }) => {
        let answerFirst: (step: KycStep) => void = () => undefined;
        const slowAnswer = new Promise<KycStep>((resolve) => {
          answerFirst = resolve;
        });
        handlers.getStep
          .mockReturnValueOnce(slowAnswer)
          .mockResolvedValueOnce('kyc_pending');

        const first = controller.refreshStep({ vendor: 'kalshi' });
        await controller.refreshStep({ vendor: 'kalshi' });
        answerFirst('vendor_terms');
        await first;

        expect(controller.state.vendors.kalshi?.step).toBe('kyc_pending');
      });
    });

    it('leaves the saved step alone when kyc-api fails', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: { kalshi: { step: 'account_link', sessionId: null } },
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
    it('sends the terms to kyc-api and saves the next step', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.acceptVendorTerms.mockResolvedValue('account_link');

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
        handlers.acceptVendorTerms.mockResolvedValue('confirm_identity');

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
          handlers.getStep.mockResolvedValue('account_link_code');

          const step = await controller.startAccountLink({
            vendor: 'kalshi',
            email: 'a@b.co',
          });

          expect(adapter.startLink).toHaveBeenCalledWith({ email: 'a@b.co' });
          expect(step).toBe('account_link_code');
          expect(controller.state.vendors.kalshi?.step).toBe(
            'account_link_code',
          );
        },
      );
    });

    it('verifies the code through the adapter, then reads the step', async () => {
      const adapter = getAdapter();
      await withController(
        { options: { accountLinkAdapters: { kalshi: adapter } } },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue('confirm_identity');

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
          handlers.getStep.mockResolvedValue('account_link_code');

          const result = await controller.verifyAccountLink({
            vendor: 'kalshi',
            code: '888888',
          });

          expect(result).toStrictEqual({
            step: 'account_link_code',
            mfaMethod: 'sms',
          });
          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'account_link_code',
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
                  kalshi: { step: 'identity_verification', sessionId: 'sid-1' },
                },
              },
            },
          },
          async ({ controller, handlers }) => {
            handlers.getStep.mockResolvedValue('identity_verification');

            const next = await controller[method]({
              vendor: 'kalshi',
              ...args,
            } as never);

            expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
              sessionId: 'sid-1',
              step,
              body,
            });
            expect(next).toBe('identity_verification');
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
                kalshi: { step: 'identity_verification', sessionId: 'sid-1' },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue('identity_verification');

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
        handlers.getStep.mockResolvedValue('identity_verification');

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
        handlers.getStep.mockResolvedValue('identity_verification');

        const step = await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: 'a@b.co',
        });

        expect(step).toBe('identity_verification');
        expect(handlers.getGeoCountry).toHaveBeenCalledOnce();
        expect(handlers.createUkycSession).toHaveBeenCalledWith({
          sessionClientPublicKey: expect.any(String),
          residenceCountry: 'USA',
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: 'a@b.co',
        });
        expect(handlers.setAuthorizations).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          wrappedEncryptionDataKey: { data: 'enc', nonce: 'nonce' },
          wrappedUkycCapabilityToken: { data: 'enc', nonce: 'nonce' },
        });
        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: 'identity_verification',
          sessionId: 'sid-1',
        });
      });
    });

    it('leaves the email out when none is given', async () => {
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

    it('does not create a session when kyc-api already has one', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(SESSION_STATUS);
        handlers.getStep.mockResolvedValue('kyc_pending');

        const step = await controller.startSession({ vendor: 'kalshi' });

        expect(step).toBe('kyc_pending');
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
            kalshi: { step: 'identity_verification', sessionId: 'sid-1' },
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
          step: 'identity_verification',
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
        handlers.getStep.mockResolvedValue('kyc_pending');

        const step = await controller.acceptSessionDisclaimers({
          vendor: 'kalshi',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        });

        expect(step).toBe('kyc_pending');
        expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        });
        expect(controller.state.vendors.kalshi?.step).toBe('kyc_pending');
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

  describe('markProviderSubmitted', () => {
    it('tells kyc-api and saves the next step', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: { step: 'identity_verification', sessionId: 'sid-1' },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.markProviderSubmitted.mockResolvedValue('kyc_pending');

          const step = await controller.markProviderSubmitted({
            vendor: 'kalshi',
          });

          expect(handlers.markProviderSubmitted).toHaveBeenCalledWith({
            sessionId: 'sid-1',
          });
          expect(step).toBe('kyc_pending');
          expect(controller.state.vendors.kalshi?.step).toBe('kyc_pending');
        },
      );
    });
  });

  describe('reset', () => {
    const state = {
      vendors: {
        iron: { step: 'approved', sessionId: 'sid-iron' },
        kalshi: { step: 'kyc_pending', sessionId: 'sid-kalshi' },
      },
    } satisfies KycFlowControllerOptions['state'];

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
  });

  describe('messenger actions', () => {
    it('exposes the actions on the messenger', async () => {
      await withController(async ({ rootMessenger, handlers }) => {
        handlers.getStep.mockResolvedValue('vendor_terms');

        const step = await rootMessenger.call('KycFlowController:refreshStep', {
          vendor: 'iron',
        });

        expect(step).toBe('vendor_terms');
      });
    });
  });
});

type ServiceHandlers = {
  getStep: ReturnType<typeof vi.fn>;
  acceptVendorTerms: ReturnType<typeof vi.fn>;
  markProviderSubmitted: ReturnType<typeof vi.fn>;
  postOnboardingStep: ReturnType<typeof vi.fn>;
  getSessionStatusForVendor: ReturnType<typeof vi.fn>;
  fetchSessionDisclaimersBySessionId: ReturnType<typeof vi.fn>;
  submitSessionDisclaimers: ReturnType<typeof vi.fn>;
  getGeoCountry: ReturnType<typeof vi.fn>;
  createUkycSession: ReturnType<typeof vi.fn>;
  resetWrappingKeys: ReturnType<typeof vi.fn>;
  setAuthorizations: ReturnType<typeof vi.fn>;
  fetchIdosEnclaveJwks: ReturnType<typeof vi.fn>;
  fetchIdosRelayJwks: ReturnType<typeof vi.fn>;
  performGetStorage: ReturnType<typeof vi.fn>;
  performSetStorage: ReturnType<typeof vi.fn>;
};

type WithControllerOptions = {
  options?: Partial<KycFlowControllerOptions>;
};

type WithControllerCallback<ReturnValue> = (payload: {
  controller: KycFlowController;
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
  const messenger: KycFlowControllerMessenger = new Messenger({
    namespace: 'KycFlowController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'KycService:getStep',
      'KycService:acceptVendorTerms',
      'KycService:markProviderSubmitted',
      'KycService:postOnboardingStep',
      'KycService:getSessionStatusForVendor',
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
    ],
    events: [],
    messenger,
  });

  const handlers: ServiceHandlers = {
    getStep: vi.fn().mockResolvedValue('vendor_terms'),
    acceptVendorTerms: vi.fn().mockResolvedValue('vendor_terms'),
    markProviderSubmitted: vi.fn().mockResolvedValue('kyc_pending'),
    postOnboardingStep: vi.fn().mockResolvedValue(SESSION_STATUS),
    getSessionStatusForVendor: vi.fn().mockResolvedValue(null),
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
  };
  rootMessenger.registerActionHandler('KycService:getStep', handlers.getStep);
  rootMessenger.registerActionHandler(
    'KycService:acceptVendorTerms',
    handlers.acceptVendorTerms,
  );
  rootMessenger.registerActionHandler(
    'KycService:markProviderSubmitted',
    handlers.markProviderSubmitted,
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

  const controller = new KycFlowController({ messenger, ...options });
  return testFunction({ controller, rootMessenger, handlers });
}

/**
 * Builds an account link adapter whose calls succeed.
 *
 * @returns The adapter, with mock functions.
 */
function getAdapter(): {
  startLink: ReturnType<typeof vi.fn>;
  verifyLink: ReturnType<typeof vi.fn>;
} & KycAccountLinkAdapter {
  return {
    startLink: vi.fn().mockResolvedValue(undefined),
    verifyLink: vi.fn().mockResolvedValue({}),
  };
}
