import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';

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
