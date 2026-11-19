import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';
import type { Mock, MockedFunction } from 'vitest';

import { flushPromises } from '../../../tests/vitest/helpers.js';
import type { CreateUkycSessionParams } from './KycService.js';
import type { KycSumSubLaunchParams } from './providers/sumsub.js';
import { KYC_SIGNED_REQUEST_LIMITS, KYC_VENDOR_SIGN_PATHS } from './types.js';
import type {
  KycSessionStatus,
  KycSignedRequest,
  KycStepInfo,
  KycVendorRequestSigner,
  KycVendorSignOperation,
} from './types.js';
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

const KALSHI_EMAIL = 'a@b.co';

/**
 * The call the test signer answers with for one operation.
 *
 * @param operation - The signed call.
 * @param body - The exact signed body.
 * @returns The signed request.
 */
function signedRequest(
  operation: KycVendorSignOperation,
  body: string,
): KycSignedRequest {
  return {
    path: KYC_VENDOR_SIGN_PATHS[operation],
    headers: { Signature: `signed:${operation}` },
    body,
  };
}

const SIGNED_INTENT = signedRequest('enrollment/intents', '');
const SIGNED_LINK = signedRequest(
  'users/link',
  JSON.stringify({ email: KALSHI_EMAIL }),
);
const SIGNED_VERIFY = signedRequest(
  'users/link/verify',
  JSON.stringify({ code: '123456' }),
);

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
                  step: 'decision',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'decision',
            status: 'none',
            sessionId: 'sid-1',
          });
        },
      );
    });
  });

  describe('refreshStep', () => {
    it.each(['kalshi_email_link', 'kalshi_phone_link'] as const)(
      'keeps the Kalshi step %s',
      async (stepName) => {
        await withController(async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: stepName,
            status: 'none',
          });

          const step = await controller.refreshStep({ vendor: 'kalshi' });

          expect(step).toBe(stepName);
          expect(controller.state.vendors.kalshi?.step).toBe(stepName);
        });
      },
    );

    it('saves the step kyc-api answers with', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'mfa',
          status: 'none',
        });

        const step = await controller.refreshStep({ vendor: 'kalshi' });

        expect(step).toBe('mfa');
        expect(handlers.getStep).toHaveBeenCalledWith('kalshi', {});
        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: 'mfa',
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
                  step: 'terms',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'decision',
            status: 'none',
          });

          await controller.refreshStep({ vendor: 'kalshi' });

          expect(controller.state.vendors.kalshi).toStrictEqual({
            step: 'decision',
            status: 'none',
            sessionId: 'sid-1',
          });
        },
      );
    });

    it('keeps each vendor apart', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockResolvedValueOnce({ step: 'decision', status: 'approved' })
          .mockResolvedValueOnce({ step: 'mfa', status: 'none' });

        await controller.refreshStep({ vendor: 'iron' });
        await controller.refreshStep({ vendor: 'kalshi' });

        expect(controller.state.vendors.iron?.step).toBe('decision');
        expect(controller.state.vendors.iron?.status).toBe('approved');
        expect(controller.state.vendors.kalshi?.step).toBe('mfa');
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
        answer({ step: 'mfa', status: 'none' });

        expect(await Promise.all([first, second])).toStrictEqual([
          'mfa',
          'mfa',
        ]);
        expect(handlers.getStep).toHaveBeenCalledTimes(1);
      });
    });

    it('asks again once the earlier read has finished', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockResolvedValueOnce({ step: 'terms', status: 'none' })
          .mockResolvedValueOnce({ step: 'mfa', status: 'none' });

        await controller.refreshStep({ vendor: 'kalshi' });
        const step = await controller.refreshStep({ vendor: 'kalshi' });

        expect(step).toBe('mfa');
        expect(handlers.getStep).toHaveBeenCalledTimes(2);
      });
    });

    it('does not share reads between vendors', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep
          .mockResolvedValueOnce({ step: 'decision', status: 'approved' })
          .mockResolvedValueOnce({ step: 'mfa', status: 'none' });

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
          .mockResolvedValueOnce({ step: 'mfa', status: 'none' });

        const first = controller.refreshStep({ vendor: 'kalshi' });
        const second = controller.refreshStep({ vendor: 'kalshi' });

        await expect(first).rejects.toThrow('down');
        await expect(second).rejects.toThrow('down');
        expect(await controller.refreshStep({ vendor: 'kalshi' })).toBe('mfa');
      });
    });

    describe('after a change at kyc-api', () => {
      it('does not join a read that started before the change', async () => {
        await withController(async ({ controller, handlers }) => {
          let answerOld: (info: KycStepInfo) => void = () => undefined;
          handlers.getStep
            .mockReturnValueOnce(
              new Promise<KycStepInfo>((resolve) => {
                answerOld = resolve;
              }),
            )
            .mockResolvedValueOnce({
              step: 'mfa',
              status: 'none',
            });

          const old = controller.refreshStep({ vendor: 'kalshi' });
          const step = await controller.acceptTerms({
            vendor: 'kalshi',
            disclaimerIds: ['a'],
          });
          answerOld({ step: 'mfa', status: 'none' });
          await old;

          expect(step).toBe('mfa');
          expect(handlers.getStep).toHaveBeenCalledTimes(2);
          expect(controller.state.vendors.kalshi?.step).toBe('mfa');
        });
      });

      it('lets a later plain read join the read the change started', async () => {
        await withController(async ({ controller, handlers }) => {
          let answer: (info: KycStepInfo) => void = () => undefined;
          handlers.getStep.mockReturnValueOnce(
            new Promise<KycStepInfo>((resolve) => {
              answer = resolve;
            }),
          );

          const action = controller.acceptTerms({
            vendor: 'kalshi',
            disclaimerIds: ['a'],
          });
          await flushPromises();
          const plain = controller.refreshStep({ vendor: 'kalshi' });
          answer({ step: 'mfa', status: 'none' });

          expect(await Promise.all([action, plain])).toStrictEqual([
            'mfa',
            'mfa',
          ]);
          expect(handlers.getStep).toHaveBeenCalledTimes(1);
        });
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
            .mockResolvedValueOnce({
              step: 'mfa',
              status: 'none',
            });

          const old = controller.refreshStep({ vendor: 'kalshi' });
          // An action starts its own read, which answers first.
          await controller.acceptTerms({
            vendor: 'kalshi',
            disclaimerIds: ['a'],
          });
          answerOld({ step: 'terms', status: 'none' });
          await old;

          expect(controller.state.vendors.kalshi?.step).toBe('mfa');
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
            .mockResolvedValueOnce({ step: 'mfa', status: 'none' })
            .mockResolvedValueOnce({
              step: 'mfa',
              status: 'none',
            });

          const old = controller.refreshStep({ vendor: 'kalshi' });
          await controller.acceptTerms({
            vendor: 'kalshi',
            disclaimerIds: ['a'],
          });
          const fresh = await controller.refreshStep({ vendor: 'kalshi' });
          answerOld({ step: 'terms', status: 'none' });
          await old;

          expect(fresh).toBe('mfa');
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
                  step: 'mfa',
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

          expect(controller.state.vendors.kalshi?.step).toBe('mfa');
        },
      );
    });
  });

  describe('acceptTerms', () => {
    it('sends the terms to kyc-api, then saves the step it reads', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'mfa',
          status: 'none',
        });

        const step = await controller.acceptTerms({
          vendor: 'kalshi',
          disclaimerIds: ['tos-v1'],
          country: 'USA',
        });

        expect(step).toBe('mfa');
        expect(handlers.acceptVendorTerms).toHaveBeenCalledWith({
          vendor: 'kalshi',
          disclaimerIds: ['tos-v1'],
          country: 'USA',
        });
        expect(controller.state.vendors.kalshi?.step).toBe('mfa');
      });
    });

    it('leaves the country out when none is given', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'mfa',
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

  describe('Kalshi signed requests', () => {
    it('requires an email before it creates a Kalshi session', async () => {
      await withController(async ({ controller, handlers }) => {
        await expect(
          controller.startSession({
            vendor: 'kalshi',
            aal2Token: AAL2_TOKEN,
          }),
        ).rejects.toThrow('Kalshi email is required');
        expect(handlers.createUkycSession).not.toHaveBeenCalled();
      });
    });

    it('requires a signer for Kalshi', async () => {
      await withController(
        { options: { vendorRequestSigners: {} } },
        async ({ controller }) => {
          await expect(
            controller.startSession({
              vendor: 'kalshi',
              aal2Token: AAL2_TOKEN,
              email: KALSHI_EMAIL,
            }),
          ).rejects.toThrow('no request signer for kalshi');
        },
      );
    });

    it('does not open the session when signing fails', async () => {
      const signer: KycVendorRequestSigner = vi
        .fn()
        .mockRejectedValue(new Error('sign failed'));
      await withController(
        { options: { vendorRequestSigners: { kalshi: signer } } },
        async ({ controller, handlers }) => {
          await expect(
            controller.startSession({
              vendor: 'kalshi',
              aal2Token: AAL2_TOKEN,
              email: KALSHI_EMAIL,
            }),
          ).rejects.toThrow('sign failed');

          expect(handlers.createUkycSession).not.toHaveBeenCalled();
          expect(handlers.getStep).not.toHaveBeenCalled();
        },
      );
    });

    it('rejects a signer that signs the wrong route', async () => {
      const signer: KycVendorRequestSigner = vi
        .fn()
        .mockResolvedValue([signedRequest('users/link', '')]);
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'kalshi_email_link',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
            vendorRequestSigners: { kalshi: signer },
          },
        },
        async ({ controller, handlers }) => {
          await expect(
            controller.verifyEmailOtp({ vendor: 'kalshi', code: '123456' }),
          ).rejects.toThrow('did not return the requested calls');
          expect(handlers.postOnboardingStep).not.toHaveBeenCalled();
        },
      );
    });

    it.each([
      [
        'too many headers',
        {
          headers: Object.fromEntries(
            Array.from(
              { length: KYC_SIGNED_REQUEST_LIMITS.headerCount + 1 },
              (_value, index) => [`Header-${index}`, 'value'],
            ),
          ),
        },
      ],
      ['a header that is not a string', { headers: { Signature: 1 as never } }],
      [
        'a body past 4 KB',
        { body: 'x'.repeat(KYC_SIGNED_REQUEST_LIMITS.bodyBytes + 1) },
      ],
      [
        'a body past 4 KB in bytes',
        { body: 'é'.repeat(KYC_SIGNED_REQUEST_LIMITS.bodyBytes / 2 + 1) },
      ],
    ])('rejects a signer that returns %s', async (_name, override) => {
      const signer: KycVendorRequestSigner = vi
        .fn()
        .mockResolvedValue([{ ...SIGNED_VERIFY, ...override }]);
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'kalshi_email_link',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
            vendorRequestSigners: { kalshi: signer },
          },
        },
        async ({ controller, handlers }) => {
          await expect(
            controller.verifyEmailOtp({ vendor: 'kalshi', code: '123456' }),
          ).rejects.toThrow('returned a request kyc-api would refuse');
          expect(handlers.postOnboardingStep).not.toHaveBeenCalled();
        },
      );
    });

    it('accepts a request at the limits', async () => {
      const atLimits: KycSignedRequest = {
        ...SIGNED_VERIFY,
        headers: Object.fromEntries(
          Array.from(
            { length: KYC_SIGNED_REQUEST_LIMITS.headerCount },
            (_value, index) => [`Header-${index}`, 'value'],
          ),
        ),
        body: 'x'.repeat(KYC_SIGNED_REQUEST_LIMITS.bodyBytes),
      };
      const signer: KycVendorRequestSigner = vi
        .fn()
        .mockResolvedValue([atLimits]);
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'kalshi_email_link',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
            vendorRequestSigners: { kalshi: signer },
          },
        },
        async ({ controller, handlers }) => {
          await controller.verifyEmailOtp({
            vendor: 'kalshi',
            code: '123456',
          });
          expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
            sessionId: 'sid-1',
            step: 'email/verify-otp',
            body: { signedRequest: atLimits },
          });
        },
      );
    });

    it('rejects a signer that skips a call', async () => {
      const signer: KycVendorRequestSigner = vi.fn().mockResolvedValue([]);
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'kalshi_email_link',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
            vendorRequestSigners: { kalshi: signer },
          },
        },
        async ({ controller, handlers }) => {
          await expect(
            controller.verifyEmailOtp({ vendor: 'kalshi', code: '123456' }),
          ).rejects.toThrow('did not return the requested calls');
          expect(handlers.postOnboardingStep).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('vendors that do not sign requests', () => {
    it('rejects Kalshi when the controller has no request signers', async () => {
      await withController(
        { options: { vendorRequestSigners: undefined } },
        async ({ controller, handlers }) => {
          await expect(
            controller.startSession({
              vendor: 'kalshi',
              aal2Token: AAL2_TOKEN,
              email: KALSHI_EMAIL,
            }),
          ).rejects.toThrow('no request signer for kalshi');
          expect(handlers.createUkycSession).not.toHaveBeenCalled();
        },
      );
    });

    it('opens an iron session without signed requests', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'sumsub',
          status: 'none',
        });

        const step = await controller.startSession({
          vendor: 'iron',
          aal2Token: AAL2_TOKEN,
        });

        expect(step).toBe('sumsub');
        const [params] = handlers.createUkycSession.mock.calls[0] as [
          CreateUkycSessionParams,
        ];
        expect(params.vendor).toBe('iron');
        expect(params).not.toHaveProperty('signedRequests');
        expect(params).not.toHaveProperty('email');
      });
    });

    it('verifies an iron email code without signed requests', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                iron: {
                  step: 'mfa',
                  status: 'none',
                  sessionId: 'sid-iron',
                },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'sumsub',
            status: 'none',
          });

          await controller.verifyEmailOtp({ vendor: 'iron', code: '123456' });

          expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
            sessionId: 'sid-iron',
            step: 'email/verify-otp',
            body: { otp: '123456' },
          });
        },
      );
    });

    it('resends an iron email code with no body', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                iron: {
                  step: 'mfa',
                  status: 'none',
                  sessionId: 'sid-iron',
                },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'mfa',
            status: 'none',
          });

          await controller.sendEmailOtp({ vendor: 'iron' });

          const [request] = handlers.postOnboardingStep.mock.calls[0] as [
            Record<string, unknown>,
          ];
          expect(request).toStrictEqual({
            sessionId: 'sid-iron',
            step: 'email/resend-otp',
          });
        },
      );
    });
  });

  describe('onboarding steps', () => {
    it.each([
      [
        'sendPhoneOtp',
        { phoneNumber: '+18888888888' },
        'phone/send-otp',
        {
          phoneNumber: '+18888888888',
        },
      ],
      [
        'verifyPhoneOtp',
        { code: '888888' },
        'phone/verify-otp',
        {
          otp: '888888',
        },
      ],
      [
        'verifyEmailOtp',
        { code: '123456' },
        'email/verify-otp',
        {
          signedRequest: SIGNED_VERIFY,
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
                    step: 'sumsub',
                    status: 'none',
                    sessionId: 'sid-1',
                  },
                },
              },
            },
          },
          async ({ controller, handlers }) => {
            handlers.getStep.mockResolvedValue({
              step: 'sumsub',
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
            expect(next).toBe('sumsub');
            expect(handlers.getSessionStatusForVendor).not.toHaveBeenCalled();
          },
        );
      },
    );

    it('resends the email code with a newly signed link', async () => {
      await withController(
        {
          options: {
            state: {
              vendors: {
                kalshi: {
                  step: 'sumsub',
                  status: 'none',
                  sessionId: 'sid-1',
                },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getStep.mockResolvedValue({
            step: 'sumsub',
            status: 'none',
          });

          await controller.sendEmailOtp({
            vendor: 'kalshi',
            email: KALSHI_EMAIL,
          });

          expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
            sessionId: 'sid-1',
            step: 'email/resend-otp',
            body: {
              signedRequest: SIGNED_LINK,
            },
          });
        },
      );
    });

    it('asks kyc-api for the session when the phone has none, and keeps it', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(SESSION_STATUS);
        handlers.getStep.mockResolvedValue({
          step: 'sumsub',
          status: 'none',
        });

        await controller.verifyEmailOtp({ vendor: 'kalshi', code: '123456' });

        expect(handlers.getSessionStatusForVendor).toHaveBeenCalledWith(
          'kalshi',
        );
        expect(handlers.postOnboardingStep).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          step: 'email/verify-otp',
          body: {
            signedRequest: SIGNED_VERIFY,
          },
        });
        expect(controller.state.vendors.kalshi?.sessionId).toBe('sid-1');
      });
    });

    it('throws when there is no session to continue', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(null);

        await expect(
          controller.sendPhoneOtp({
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
          step: 'sumsub',
          status: 'none',
        });

        const step = await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: KALSHI_EMAIL,
        });

        expect(step).toBe('sumsub');
        expect(handlers.getGeoCountry).toHaveBeenCalledOnce();
        expect(handlers.createUkycSession).toHaveBeenCalledWith({
          sessionClientPublicKey: expect.any(String),
          residenceCountry: 'USA',
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: KALSHI_EMAIL,
          signedRequests: [SIGNED_INTENT, SIGNED_LINK],
        });
        expect(handlers.setAuthorizations).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          wrappedEncryptionDataKey: { data: 'enc', nonce: 'nonce' },
          wrappedUkycCapabilityToken: { data: 'enc', nonce: 'nonce' },
        });
        expect(controller.state.vendors.kalshi).toStrictEqual({
          step: 'sumsub',
          status: 'none',
          sessionId: 'sid-1',
        });
      });
    });

    it('signs the trimmed Kalshi email into users/link and sends it with the session', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: `  ${KALSHI_EMAIL} `,
        });

        const [params] = handlers.createUkycSession.mock.calls[0] as [
          CreateUkycSessionParams,
        ];
        expect(params.email).toBe(KALSHI_EMAIL);
        expect(params.signedRequests).toStrictEqual([
          SIGNED_INTENT,
          SIGNED_LINK,
        ]);
      });
    });

    it('signs users/link alone when the intent is already open', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: KALSHI_EMAIL,
          intentOpen: true,
        });

        const [params] = handlers.createUkycSession.mock.calls[0] as [
          CreateUkycSessionParams,
        ];
        expect(params.signedRequests).toStrictEqual([SIGNED_LINK]);
      });
    });

    it('signs after every other call that comes before session creation', async () => {
      const order: string[] = [];
      const signer: KycVendorRequestSigner = async ({ requests }) => {
        order.push('sign');
        return requests.map((request) => signedRequest(request.operation, ''));
      };
      await withController(
        { options: { vendorRequestSigners: { kalshi: signer } } },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockImplementation(async () => {
            order.push('geo');
            return 'USA';
          });
          handlers.createUkycSession.mockImplementation(async () => {
            order.push('create');
            return UKYC_SESSION;
          });

          await controller.startSession({
            vendor: 'kalshi',
            aal2Token: AAL2_TOKEN,
            email: KALSHI_EMAIL,
          });

          expect(order).toStrictEqual(['geo', 'sign', 'create']);
        },
      );
    });

    it('verifies both wrapping keys before it trusts them', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: KALSHI_EMAIL,
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
          email: KALSHI_EMAIL,
        });

        expect(handlers.performGetStorage).toHaveBeenCalled();
        expect(handlers.performSetStorage).toHaveBeenCalledOnce();
      });
    });

    it('mints no identity token for Kalshi, which kyc-api ignores', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'kalshi',
          aal2Token: AAL2_TOKEN,
          email: KALSHI_EMAIL,
        });

        expect(handlers.putIdentitySharingConsent).not.toHaveBeenCalled();
        expect(handlers.getPartnerIdentityToken).not.toHaveBeenCalled();
        const [params] = handlers.createUkycSession.mock.calls[0] as [
          CreateUkycSessionParams,
        ];
        expect(params).not.toHaveProperty('partnerIdentityToken');
      });
    });

    it('records the consent before it mints the identity token', async () => {
      await withController(async ({ controller, handlers }) => {
        await controller.startSession({
          vendor: 'iron',
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
          vendor: 'iron',
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
        handlers.getStep.mockResolvedValue({
          step: 'decision',
          status: 'none',
        });

        const step = await controller.startSession({ vendor: 'kalshi' });

        expect(step).toBe('decision');
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
            email: KALSHI_EMAIL,
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
            email: KALSHI_EMAIL,
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
              step: 'sumsub',
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
          step: 'sumsub',
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
        handlers.getStep.mockResolvedValue({
          step: 'decision',
          status: 'none',
        });

        const step = await controller.acceptSessionDisclaimers({
          vendor: 'kalshi',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        });

        expect(step).toBe('decision');
        expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith({
          sessionId: 'sid-1',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        });
        expect(controller.state.vendors.kalshi?.step).toBe('decision');
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
            step: 'sumsub',
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
          handlers.getStep.mockResolvedValue({
            step: 'decision',
            status: 'none',
          });

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
          expect(controller.state.vendors.kalshi?.step).toBe('decision');
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
            step: 'sumsub',
            status: 'none',
            sessionId: 'sid-1',
          },
        },
      },
    } satisfies WithControllerOptions['options'];

    it('reads and saves the step after accepting terms', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getStep.mockResolvedValue({
          step: 'mfa',
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
        expect(step).toBe('mfa');
        expect(controller.state.vendors.kalshi?.step).toBe('mfa');
      });
    });

    it.each([
      ['sendPhoneOtp', { phoneNumber: '+18888888888' }],
      ['verifyPhoneOtp', { code: '888888' }],
      ['verifyEmailOtp', { code: '123456' }],
      ['sendEmailOtp', { email: 'a@b.co' }],
    ] as const)(
      '%s reads the step once the code step has run',
      async (method, args) => {
        await withController(
          { options: saved },
          async ({ controller, handlers }) => {
            handlers.postOnboardingStep.mockResolvedValue(SESSION_STATUS);
            handlers.getStep.mockResolvedValue({
              step: 'kalshi_phone_link',
              status: 'none',
            });

            const step = await controller[method]({
              vendor: 'kalshi',
              ...args,
            } as never);

            expect(step).toBe('kalshi_phone_link');
            expect(handlers.getStep).toHaveBeenCalledTimes(1);
            expect(
              handlers.postOnboardingStep.mock.invocationCallOrder[0],
            ).toBeLessThan(handlers.getStep.mock.invocationCallOrder[0]);
            expect(controller.state.vendors.kalshi?.step).toBe(
              'kalshi_phone_link',
            );
          },
        );
      },
    );
  });

  describe('reset', () => {
    const state = {
      vendors: {
        iron: { step: 'decision', status: 'none', sessionId: 'sid-iron' },
        kalshi: {
          step: 'decision',
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
              .mockResolvedValueOnce({
                step: 'mfa',
                status: 'none',
              });

            const pending = controller.refreshStep({ vendor: 'kalshi' });
            controller.reset(params);
            answer({ step: 'kalshi_phone_link', status: 'none' });
            await pending;

            expect(controller.state.vendors.kalshi).toBeUndefined();
            // A refresh after the reset asks again instead of joining.
            expect(await controller.refreshStep({ vendor: 'kalshi' })).toBe(
              'mfa',
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
          step: 'terms',
          status: 'none',
        });

        const step = await rootMessenger.call(
          'VendorOnboardingController:refreshStep',
          {
            vendor: 'iron',
          },
        );

        expect(step).toBe('terms');
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
    getStep: vi.fn().mockResolvedValue({ step: 'terms', status: 'none' }),
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

  const controller = new VendorOnboardingController({
    messenger,
    vendorRequestSigners: { kalshi: getSigner() },
    ...options,
  });
  return testFunction({ controller, rootMessenger, handlers });
}

/**
 * Signs each requested call with a recognizable `Signature` header and the
 * body the relay expects.
 *
 * @returns The signer.
 */
function getSigner(): KycVendorRequestSigner {
  return async ({ requests }) =>
    requests.map((request) => {
      switch (request.operation) {
        case 'users/link':
          return signedRequest(
            request.operation,
            JSON.stringify({ email: request.email }),
          );
        case 'users/link/verify':
          return signedRequest(
            request.operation,
            JSON.stringify({ code: request.code }),
          );
        default:
          return signedRequest(request.operation, '');
      }
    });
}
