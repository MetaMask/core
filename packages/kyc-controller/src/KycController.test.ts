import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

import { KycController } from './KycController.js';
import type { KycControllerMessenger } from './KycController.js';
import type { KycSumSubLauncher } from './types.js';
import { verifyJwtChain } from './ukyc/jwtChain.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';

// `verifyJwtChain` (JWKS attestation) and `wrapEncryptionKey` (X25519 sealing)
// need a real signed chain / valid keys, so they are stubbed here; the rest of
// the UKYC layer (local-user-secret storage adapter, client-material
// derivation) runs for real so the controller's messenger wiring is exercised.
// Return values are (re)configured per test in `withController` because the
// shared jest config enables `resetMocks`.
jest.mock('./ukyc/jwtChain', () => {
  const actual = jest.requireActual('./ukyc/jwtChain');
  return {
    ...actual,
    verifyJwtChain: jest.fn(),
  };
});
jest.mock('./ukyc/wrapEncryptionKey', () => {
  const actual = jest.requireActual('./ukyc/wrapEncryptionKey');
  return {
    ...actual,
    wrapEncryptionKey: jest.fn(),
  };
});

const mockVerifyJwtChain = verifyJwtChain as jest.MockedFunction<
  typeof verifyJwtChain
>;
const mockWrapEncryptionKey = wrapEncryptionKey as jest.MockedFunction<
  typeof wrapEncryptionKey
>;

/**
 * Builds an encrypted envelope for a recipient's X25519 public key.
 *
 * @param publicKey - The recipient's public key bytes.
 * @param credentials - The plaintext credentials to encrypt.
 * @returns The encrypted envelope.
 */
function makeEnvelope(
  publicKey: Uint8Array,
  credentials: Record<string, unknown>,
): { ephemeralPublicKey: string; iv: string; ciphertext: string } {
  const ephemeralPrivate = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);
  const shared = x25519.getSharedSecret(ephemeralPrivate, publicKey);
  const key = hkdf(sha256, shared, undefined, undefined, 32);
  const iv = new Uint8Array(12).fill(7);
  const ciphertext = gcm(key, iv).encrypt(
    utf8ToBytes(JSON.stringify(credentials)),
  );
  return {
    ephemeralPublicKey: bytesToHex(ephemeralPublic),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ciphertext),
  };
}

/**
 * Extracts the controller's ephemeral public key from the Check-frame URL and
 * builds a decryptable credentials envelope for it.
 *
 * @param controller - The controller under test (must have a session token).
 * @param credentials - The plaintext credentials to encrypt.
 * @returns The encrypted envelope.
 */
function envelopeFor(
  controller: KycController,
  credentials: Record<string, unknown>,
): { ephemeralPublicKey: string; iv: string; ciphertext: string } {
  const url = controller.buildCheckFrameUrl();
  const publicKeyHex = new URL(url as string).searchParams.get(
    'publicKey',
  ) as string;
  return makeEnvelope(hexToBytes(publicKeyHex), credentials);
}

describe('KycController', () => {
  describe('constructor', () => {
    it('accepts initial state merged over defaults', async () => {
      await withController(
        { options: { state: { phase: 'form' } } },
        ({ controller }) => {
          expect(controller.state.phase).toBe('form');
          expect(controller.state.sumsub.status).toBe('idle');
        },
      );
    });
  });

  describe('initialize', () => {
    it('auto-creates a session when terms and email are present', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.createSession.mockResolvedValue({ sessionToken: 'sess' });

          await controller.initialize({ email: 'a@b.co' });

          expect(controller.state.geoCountry).toBe('USA');
          expect(controller.state.sessionToken).toBe('sess');
          expect(controller.state.phase).toBe('check');
        },
      );
    });

    it('falls back to the terms phase and loads disclaimers when geo fails and no terms exist', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockRejectedValue(new Error('geo down'));

        await controller.initialize();

        expect(controller.state.phase).toBe('terms');
        expect(controller.state.disclaimersError).toMatch(/Failed to load/u);
      });
    });

    it('captures the active product for the automatic post-auth continuation', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockResolvedValue('USA');
        handlers.fetchDisclaimers.mockResolvedValue([]);

        await controller.initialize({ product: 'card' });

        expect(controller.state.activeProduct).toBe('card');
      });
    });

    it('clears a stale active product when re-initialized without one', async () => {
      await withController(
        { options: { state: { activeProduct: 'card' } } },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.initialize({ email: 'a@b.co' });

          expect(controller.state.activeProduct).toBeNull();
        },
      );
    });

    it('does not restart an in-progress session flow', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'check',
              email: 'a@b.co',
              sessionToken: 'live-session',
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['1'],
              activeProduct: 'ramps',
              activeVendor: 'moonpay',
              moonpayCustomerId: 'cust-1',
            },
          },
        },
        async ({ controller, handlers }) => {
          await controller.initialize({
            email: 'other@b.co',
            product: 'card',
            vendor: 'iron',
          });

          // A repeat initialize mid-flow must be a no-op: no new session, no
          // token/phase teardown, no vendor switch, and no clobbering of the
          // active product.
          expect(handlers.createSession).not.toHaveBeenCalled();
          expect(handlers.getGeoCountry).not.toHaveBeenCalled();
          expect(handlers.createVendorCustomer).not.toHaveBeenCalled();
          expect(controller.state.phase).toBe('check');
          expect(controller.state.sessionToken).toBe('live-session');
          expect(controller.state.activeProduct).toBe('ramps');
          expect(controller.state.email).toBe('a@b.co');
          expect(controller.state.activeVendor).toBe('moonpay');
          expect(controller.state.moonpayCustomerId).toBe('cust-1');
        },
      );
    });

    it('stays on terms when terms exist but no email is available', async () => {
      await withController(
        {
          options: {
            state: { termsAcceptedAt: 't', acceptedDisclaimerIds: ['1'] },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.initialize();

          expect(controller.state.phase).toBe('terms');
        },
      );
    });
  });

  describe('loadDisclaimers', () => {
    it('loads disclaimers for a provided country', async () => {
      await withController(async ({ controller, handlers }) => {
        const disclaimers = [{ id: '1', display_name: 'T', url: 'u' }];
        handlers.fetchDisclaimers.mockResolvedValue(disclaimers);

        await controller.loadDisclaimers({ country: 'USA' });

        expect(controller.state.disclaimers).toStrictEqual(disclaimers);
        expect(handlers.getGeoCountry).not.toHaveBeenCalled();
      });
    });

    it('caches the provided country override in geoCountry', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.fetchDisclaimers.mockResolvedValue([]);

        await controller.loadDisclaimers({ country: 'USA' });

        expect(controller.state.geoCountry).toBe('USA');
      });
    });

    it('lets a later checkKycRequired reuse the overridden country without an override', async () => {
      await withController(
        { options: { state: { accessToken: 'a' } } },
        async ({ controller, handlers }) => {
          handlers.fetchDisclaimers.mockResolvedValue([]);
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: true });

          await controller.loadDisclaimers({ country: 'USA' });
          await controller.checkKycRequired({ product: 'ramps' });

          expect(handlers.getGeoCountry).not.toHaveBeenCalled();
          expect(handlers.checkKycRequired).toHaveBeenCalledWith({
            accessToken: 'a',
            country: 'USA',
            capabilities: [{ product: 'ramps' }],
          });
          expect(controller.state.error).toBeNull();
        },
      );
    });

    it('uses the cached geoCountry when no country is provided', async () => {
      await withController(
        { options: { state: { geoCountry: 'USA' } } },
        async ({ controller, handlers }) => {
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.loadDisclaimers();

          expect(handlers.getGeoCountry).not.toHaveBeenCalled();
          expect(handlers.fetchDisclaimers).toHaveBeenCalledWith({
            vendor: 'moonpay',
            country: 'USA',
          });
        },
      );
    });

    it('resolves the country when neither param nor cache is available', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockResolvedValue('FRA');
        handlers.fetchDisclaimers.mockResolvedValue([]);

        await controller.loadDisclaimers();

        expect(controller.state.geoCountry).toBe('FRA');
        expect(handlers.fetchDisclaimers).toHaveBeenCalledWith({
          vendor: 'moonpay',
          country: 'FRA',
        });
      });
    });

    it('records an error when loading fails', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.fetchDisclaimers.mockRejectedValue(new Error('boom'));

        await controller.loadDisclaimers({ country: 'USA' });

        expect(controller.state.disclaimersError).toMatch(/boom/u);
      });
    });
  });

  describe('acceptTermsAndStartSession', () => {
    it('captures terms and creates a session', async () => {
      await withController(
        {
          options: {
            state: { disclaimers: [{ id: '1', display_name: 'T', url: 'u' }] },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockResolvedValue({ sessionToken: 'sess' });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'ramps',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.acceptedDisclaimerIds).toStrictEqual(['1']);
          expect(controller.state.termsAcceptedAt).not.toBeNull();
          expect(controller.state.activeProduct).toBe('ramps');
          expect(controller.state.phase).toBe('check');
        },
      );
    });

    it('fails when T&C2 flags are omitted', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              disclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          // @ts-expect-error T&C2 flags are required
          await controller.acceptTermsAndStartSession();

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing T&C2 acceptance/u);
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(handlers.createSession).not.toHaveBeenCalled();
        },
      );
    });

    it('persists required T&C2 flags on a MoonPay session', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              disclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockResolvedValue({ sessionToken: 'sess' });

          await controller.acceptTermsAndStartSession({
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.acceptedDisclaimerIds).toStrictEqual(['1']);
          expect(controller.state.termsAcceptedVendor).toBe('moonpay');
          expect(controller.state.sumsubTncAccepted).toBe(true);
          expect(controller.state.idosTncAccepted).toBe(true);
          expect(controller.state.phase).toBe('check');
        },
      );
    });

    it('clears stale auth tokens when a new session is created', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'check',
              email: 'a@b.co',
              sessionToken: 'old-session',
              accessToken: 'stale-access',
              disclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockResolvedValue({
            sessionToken: 'new-session',
          });

          // Establish an auth-frame client token from a prior authentication.
          const envelope = envelopeFor(controller, {
            clientToken: 'old-client',
          });
          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { status: 'connectionRequired', credentials: envelope },
            },
          });
          expect(controller.buildAuthFrameUrl()).toContain(
            'clientToken=old-client',
          );

          // Creating a new session must invalidate the carried-over auth.
          await controller.acceptTermsAndStartSession({
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.accessToken).toBeNull();
          expect(controller.buildAuthFrameUrl()).toBeNull();
          expect(controller.state.sessionToken).toBe('new-session');
        },
      );
    });

    it('clears the old session token while a new session is being created', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              sessionToken: 'old-session',
              disclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          let releaseSession: (value: {
            sessionToken: string;
          }) => void = () => {
            // no-op placeholder until the deferred promise is wired up
          };
          handlers.createSession.mockReturnValue(
            new Promise<{ sessionToken: string }>((resolve) => {
              releaseSession = resolve;
            }),
          );

          const pending = controller.acceptTermsAndStartSession({
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          // While the request is in flight (phase `session`) the stale token
          // must already be gone so no Check frame URL can be built for it.
          expect(controller.state.phase).toBe('session');
          expect(controller.state.sessionToken).toBeNull();
          expect(controller.buildCheckFrameUrl()).toBeNull();

          releaseSession({ sessionToken: 'new-session' });
          await pending;

          expect(controller.state.sessionToken).toBe('new-session');
          expect(controller.buildCheckFrameUrl()).toContain(
            'sessionToken=new-session',
          );
        },
      );
    });

    it('reverts to terms when session creation fails', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              sessionToken: 'old-session',
              disclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockRejectedValue(new Error('nope'));
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.error).toMatch(/Session creation failed/u);
          // A failed creation must not leave the old session token behind, so
          // the Check frame cannot be built against an invalid session.
          expect(controller.state.sessionToken).toBeNull();
          expect(controller.buildCheckFrameUrl()).toBeNull();
        },
      );
    });

    it('leaves the controller idle when reset() runs before session creation fails', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              sessionToken: 'old-session',
              disclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          let rejectSession: (reason: Error) => void = () => {
            // no-op placeholder until the deferred promise is wired up
          };
          handlers.createSession.mockReturnValue(
            new Promise<{ sessionToken: string }>((_resolve, reject) => {
              rejectSession = reject;
            }),
          );

          const pending = controller.acceptTermsAndStartSession({
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          // Reset while the create request is in flight, then let it fail. The
          // superseded flow must not force the now-idle controller back to
          // `terms` or re-run disclaimer loading.
          controller.reset();
          rejectSession(new Error('nope'));
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.error).toBeNull();
          expect(handlers.fetchDisclaimers).not.toHaveBeenCalled();
        },
      );
    });

    it('clears the active product when session creation fails', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              activeProduct: 'card',
              disclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockRejectedValue(new Error('nope'));
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            product: 'ramps',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          // The failed flow must not leave a lingering product behind that a
          // later product-less `acceptTermsAndStartSession` would auto-run.
          expect(controller.state.phase).toBe('terms');
          expect(controller.state.activeProduct).toBeNull();
        },
      );
    });

    it('fails when no email is available', async () => {
      await withController(
        {
          options: {
            state: { disclaimers: [{ id: '1', display_name: 'T', url: 'u' }] },
          },
        },
        async ({ controller }) => {
          await controller.acceptTermsAndStartSession({
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing email/u);
        },
      );
    });

    it('fails when no disclaimers were accepted', async () => {
      await withController(async ({ controller }) => {
        await controller.acceptTermsAndStartSession({
          email: 'a@b.co',
          sumsubTncSigned: true,
          idosTncSigned: true,
        });

        expect(controller.state.phase).toBe('error');
        expect(controller.state.error).toMatch(/Missing terms acceptance/u);
      });
    });
  });

  describe('clearSavedTerms', () => {
    it('clears persisted terms', async () => {
      await withController(
        {
          options: {
            state: { termsAcceptedAt: 't', acceptedDisclaimerIds: ['1'] },
          },
        },
        ({ controller }) => {
          controller.clearSavedTerms();
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([]);
        },
      );
    });
  });

  describe('handleFrameMessage', () => {
    it('acks a handshake', async () => {
      await withController(async ({ controller }) => {
        const result = await controller.handleFrameMessage({
          message: { kind: 'handshake', meta: { channelId: 'ch_1' } },
        });
        expect(result).toStrictEqual({
          reply: { version: 2, meta: { channelId: 'ch_1' }, kind: 'ack' },
        });
      });
    });

    it('ignores undefined and non-complete messages', async () => {
      await withController(async ({ controller }) => {
        expect(
          await controller.handleFrameMessage({ message: undefined }),
        ).toStrictEqual({});
        expect(
          await controller.handleFrameMessage({ message: { kind: 'other' } }),
        ).toStrictEqual({});
      });
    });

    it('captures the customer id and ignores a status-less complete message', async () => {
      await withController(
        { options: { state: { phase: 'check' } } },
        async ({ controller }) => {
          const result = await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { customer: { id: 'cust-1' } },
            },
          });
          expect(result).toStrictEqual({});
          expect(controller.state.moonpayCustomerId).toBe('cust-1');
        },
      );
    });

    it('ignores messages on an unknown channel', async () => {
      await withController(async ({ controller }) => {
        const result = await controller.handleFrameMessage({
          message: {
            kind: 'complete',
            meta: { channelId: 'ch_unknown' },
            payload: { status: 'active' },
          },
        });
        expect(result).toStrictEqual({});
      });
    });

    it('ignores a stale completion for a frame the flow is no longer waiting on', async () => {
      // Phase `done` (e.g. after a completed flow or a `reset()` that returns
      // to an idle phase) means the Check frame is no longer active; a late or
      // duplicate `ch_1` completion must not resurrect tokens or rewind phase.
      await withController(
        { options: { state: { phase: 'done', sessionToken: 'tok' } } },
        async ({ controller }) => {
          const envelope = envelopeFor(controller, { accessToken: 'access-1' });
          const result = await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: {
                status: 'active',
                credentials: envelope,
                customer: { id: 'cust-late' },
              },
            },
          });
          expect(result).toStrictEqual({});
          expect(controller.state.phase).toBe('done');
          expect(controller.state.accessToken).toBeNull();
          expect(controller.state.moonpayCustomerId).toBeNull();
        },
      );
    });

    it('ignores a Check complete when the active vendor is not MoonPay', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'check',
              activeVendor: 'iron',
              sessionToken: 'tok',
            },
          },
        },
        async ({ controller }) => {
          const envelope = envelopeFor(controller, { accessToken: 'access-1' });
          const result = await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: {
                status: 'active',
                credentials: envelope,
                customer: { id: 'cust-late' },
              },
            },
          });

          expect(result).toStrictEqual({});
          expect(controller.state.phase).toBe('check');
          expect(controller.state.accessToken).toBeNull();
          expect(controller.state.moonpayCustomerId).toBeNull();
          expect(controller.getCustomerIdentity()).toBeNull();
        },
      );
    });

    it('fails when credential decryption throws', async () => {
      await withController(
        { options: { state: { phase: 'check', sessionToken: 'tok' } } },
        async ({ controller }) => {
          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { status: 'active', credentials: 'not-decryptable' },
            },
          });
          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Failed to decrypt/u);
        },
      );
    });

    describe('check frame', () => {
      it('moves to form on an active status with an access token', async () => {
        await withController(
          { options: { state: { phase: 'check', sessionToken: 'tok' } } },
          async ({ controller }) => {
            const envelope = envelopeFor(controller, {
              accessToken: 'access-1',
            });
            await controller.handleFrameMessage({
              message: {
                kind: 'complete',
                meta: { channelId: 'ch_1' },
                payload: { status: 'active', credentials: envelope },
              },
            });
            expect(controller.state.phase).toBe('form');
            expect(controller.state.accessToken).toBe('access-1');
          },
        );
      });

      it('moves to auth on connectionRequired and enables the auth frame URL', async () => {
        await withController(
          { options: { state: { phase: 'check', sessionToken: 'tok' } } },
          async ({ controller }) => {
            const envelope = envelopeFor(controller, {
              clientToken: 'client-1',
            });
            await controller.handleFrameMessage({
              message: {
                kind: 'complete',
                meta: { channelId: 'ch_1' },
                payload: {
                  status: 'connectionRequired',
                  credentials: envelope,
                },
              },
            });
            expect(controller.state.phase).toBe('auth');
            expect(controller.buildAuthFrameUrl()).toContain(
              'clientToken=client-1',
            );
          },
        );
      });

      it('requires re-acceptance on termsAcceptanceRequired', async () => {
        await withController(
          {
            options: {
              state: {
                phase: 'check',
                sessionToken: 'tok',
                termsAcceptedAt: 't',
                acceptedDisclaimerIds: ['1'],
              },
            },
          },
          async ({ controller }) => {
            await controller.handleFrameMessage({
              message: {
                kind: 'complete',
                meta: { channelId: 'ch_1' },
                payload: { status: 'termsAcceptanceRequired' },
              },
            });
            expect(controller.state.phase).toBe('terms');
            expect(controller.state.termsAcceptedAt).toBeNull();
          },
        );
      });

      it('fails on an unexpected status', async () => {
        await withController(
          { options: { state: { phase: 'check', sessionToken: 'tok' } } },
          async ({ controller }) => {
            await controller.handleFrameMessage({
              message: {
                kind: 'complete',
                meta: { channelId: 'ch_1' },
                payload: { status: 'failed' },
              },
            });
            expect(controller.state.phase).toBe('error');
          },
        );
      });
    });

    describe('auth frame', () => {
      it('moves to form on an active status with an access token', async () => {
        await withController(
          { options: { state: { phase: 'auth', sessionToken: 'tok' } } },
          async ({ controller }) => {
            const envelope = envelopeFor(controller, {
              accessToken: 'access-2',
            });
            await controller.handleFrameMessage({
              message: {
                kind: 'complete',
                meta: { channelId: 'ch_2' },
                payload: { status: 'active', credentials: envelope },
              },
            });
            expect(controller.state.phase).toBe('form');
            expect(controller.state.accessToken).toBe('access-2');
          },
        );
      });

      it('requires re-acceptance on termsAcceptanceRequired', async () => {
        await withController(
          { options: { state: { phase: 'auth' } } },
          async ({ controller }) => {
            await controller.handleFrameMessage({
              message: {
                kind: 'complete',
                meta: { channelId: 'ch_2' },
                payload: { status: 'termsAcceptanceRequired' },
              },
            });
            expect(controller.state.phase).toBe('terms');
          },
        );
      });

      it('fails on an unexpected status', async () => {
        await withController(
          { options: { state: { phase: 'auth' } } },
          async ({ controller }) => {
            await controller.handleFrameMessage({
              message: {
                kind: 'complete',
                meta: { channelId: 'ch_2' },
                payload: { status: 'unavailable' },
              },
            });
            expect(controller.state.phase).toBe('error');
          },
        );
      });
    });
  });

  describe('automatic post-authentication continuation', () => {
    it('stays at form and does not run the check when no product is set', async () => {
      await withController(
        {
          options: {
            state: { phase: 'check', sessionToken: 'tok', geoCountry: 'USA' },
          },
        },
        async ({ controller, handlers }) => {
          const envelope = envelopeFor(controller, { accessToken: 'access-1' });

          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { status: 'active', credentials: envelope },
            },
          });

          expect(controller.state.phase).toBe('form');
          expect(handlers.checkKycRequired).not.toHaveBeenCalled();
        },
      );
    });

    it('auto-runs the KYC check on reaching form and stops at done when KYC is not required', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'check',
              sessionToken: 'tok',
              activeProduct: 'ramps',
              geoCountry: 'USA',
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: false });
          const envelope = envelopeFor(controller, { accessToken: 'access-1' });

          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { status: 'active', credentials: envelope },
            },
          });

          expect(handlers.checkKycRequired).toHaveBeenCalledWith({
            accessToken: 'access-1',
            country: 'USA',
            capabilities: [{ product: 'ramps' }],
          });
          expect(controller.state.kycRequiredByProduct.ramps).toBe(false);
          expect(controller.state.phase).toBe('done');
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('auto-chains into document verification when KYC is required (via the auth frame)', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'auth',
              sessionToken: 'tok',
              activeProduct: 'card',
              geoCountry: 'FRA',
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: true });
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });
          const envelope = envelopeFor(controller, { accessToken: 'access-2' });

          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_2' },
              payload: { status: 'active', credentials: envelope },
            },
          });

          expect(controller.state.kycRequiredByProduct.card).toBe(true);
          expect(launcher.launch).toHaveBeenCalledTimes(1);
          expect(controller.state.sumsub.status).toBe('complete');
        },
      );
    });

    it('records a failed sub-flow without throwing when verification is required but the SDK is unavailable', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'check',
              sessionToken: 'tok',
              activeProduct: 'ramps',
              geoCountry: 'USA',
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: true });
          launcher.isAvailable.mockReturnValue(false);
          const envelope = envelopeFor(controller, { accessToken: 'access-1' });

          const result = await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { status: 'active', credentials: envelope },
            },
          });

          expect(result).toStrictEqual({});
          expect(controller.state.sumsub.status).toBe('failed');
        },
      );
    });

    it('ignores a duplicate completion while a prior continuation is in flight', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'auth',
              sessionToken: 'tok',
              activeProduct: 'card',
              geoCountry: 'FRA',
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          // Hold the KYC-required check open so the first continuation is still
          // in flight when the second (duplicate) completion arrives. The first
          // completion moves `phase` to `form` synchronously, so the duplicate
          // is dropped by the frame-phase guard before it can re-run the check.
          let releaseCheck: (value: { kycRequired: boolean }) => void = () => {
            // no-op placeholder until the deferred promise is wired up
          };
          handlers.checkKycRequired.mockReturnValue(
            new Promise<{ kycRequired: boolean }>((resolve) => {
              releaseCheck = resolve;
            }),
          );
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });
          const envelope = envelopeFor(controller, { accessToken: 'access-1' });
          const message = {
            kind: 'complete',
            meta: { channelId: 'ch_2' },
            payload: { status: 'active', credentials: envelope },
          };

          const first = controller.handleFrameMessage({ message });
          const second = controller.handleFrameMessage({ message });

          releaseCheck({ kycRequired: true });
          await Promise.all([first, second]);

          expect(handlers.checkKycRequired).toHaveBeenCalledTimes(1);
          expect(launcher.launch).toHaveBeenCalledTimes(1);
          expect(controller.state.sumsub.status).toBe('complete');
        },
      );
    });

    it('allows a fresh flow to continue after a reset interrupts an in-flight continuation', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'check',
              email: 'a@b.co',
              sessionToken: 'tok',
              activeProduct: 'ramps',
              geoCountry: 'USA',
              // Persisted terms so a post-reset `initialize` auto-recreates the
              // session (reaching phase `check`) for the second completion.
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller, handlers }) => {
          // The keypair is stable across reset, so both envelopes can be built
          // up front while the session token (used only to derive the public
          // key here) is still present.
          const envelope1 = envelopeFor(controller, {
            accessToken: 'access-1',
          });
          const envelope2 = envelopeFor(controller, {
            accessToken: 'access-2',
          });
          const messageFor = (
            credentials: unknown,
          ): {
            kind: string;
            meta: { channelId: string };
            payload: { status: string; credentials: unknown };
          } => ({
            kind: 'complete',
            meta: { channelId: 'ch_1' },
            payload: { status: 'active', credentials },
          });

          // Hold the first continuation open so a reset can land while it is
          // still in flight.
          let releaseCheck: (value: { kycRequired: boolean }) => void = () => {
            // no-op placeholder until the deferred promise is wired up
          };
          handlers.checkKycRequired.mockReturnValueOnce(
            new Promise<{ kycRequired: boolean }>((resolve) => {
              releaseCheck = resolve;
            }),
          );

          const first = controller.handleFrameMessage({
            message: messageFor(envelope1),
          });

          // Reset while the continuation is awaiting the check. Its result is
          // discarded by the generation guard (the check belongs to the
          // superseded generation) rather than written onto the idle flow.
          controller.reset();
          releaseCheck({ kycRequired: false });
          await first;

          // Re-establish a product-scoped flow (auto-creates a session and
          // returns to phase `check`) and confirm the next completion continues
          // again rather than being blocked forever by a stuck guard.
          await controller.initialize({ product: 'ramps' });
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: false });
          await controller.handleFrameMessage({
            message: messageFor(envelope2),
          });

          expect(handlers.checkKycRequired).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('does not launch verification when the auto-run check fails', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'check',
              sessionToken: 'tok',
              activeProduct: 'ramps',
              geoCountry: 'USA',
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.checkKycRequired.mockRejectedValue(new Error('down'));
          const envelope = envelopeFor(controller, { accessToken: 'access-1' });

          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { status: 'active', credentials: envelope },
            },
          });

          expect(controller.state.phase).toBe('error');
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('frame URL builders', () => {
    it('returns null for the check frame without a session', async () => {
      await withController(({ controller }) => {
        expect(controller.buildCheckFrameUrl()).toBeNull();
      });
    });

    it('builds the check frame URL with a session', async () => {
      await withController(
        { options: { state: { sessionToken: 'tok' } } },
        ({ controller }) => {
          const url = controller.buildCheckFrameUrl() as string;
          expect(url).toContain('sessionToken=tok');
          expect(url).toContain('channelId=ch_1');
          expect(url).toContain('skipKyc=true');
        },
      );
    });

    it('returns null for the auth frame without a client token', async () => {
      await withController(({ controller }) => {
        expect(controller.buildAuthFrameUrl()).toBeNull();
      });
    });

    it('builds the reset frame URL', async () => {
      await withController(({ controller }) => {
        expect(controller.buildResetFrameUrl()).toContain('channelId=ch_reset');
      });
    });
  });

  describe('checkKycRequired', () => {
    it('fails without an access token', async () => {
      await withController(async ({ controller }) => {
        expect(await controller.checkKycRequired({ product: 'ramps' })).toBe(
          false,
        );
        expect(controller.state.error).toMatch(/Missing accessToken/u);
      });
    });

    it('fails without a country', async () => {
      await withController(
        { options: { state: { accessToken: 'a' } } },
        async ({ controller }) => {
          expect(await controller.checkKycRequired({ product: 'ramps' })).toBe(
            false,
          );
          expect(controller.state.error).toMatch(/Missing country/u);
        },
      );
    });

    it('caches the result on success (cached country)', async () => {
      await withController(
        { options: { state: { accessToken: 'a', geoCountry: 'USA' } } },
        async ({ controller, handlers }) => {
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: true });

          expect(await controller.checkKycRequired({ product: 'ramps' })).toBe(
            true,
          );
          expect(controller.state.kycRequiredByProduct.ramps).toBe(true);
          expect(controller.state.phase).toBe('done');
        },
      );
    });

    it('accepts a country override', async () => {
      await withController(
        { options: { state: { accessToken: 'a' } } },
        async ({ controller, handlers }) => {
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: false });

          await controller.checkKycRequired({
            product: 'card',
            country: 'FRA',
          });

          expect(handlers.checkKycRequired).toHaveBeenCalledWith({
            accessToken: 'a',
            country: 'FRA',
            capabilities: [{ product: 'card' }],
          });
        },
      );
    });

    it('fails when the service throws', async () => {
      await withController(
        { options: { state: { accessToken: 'a', geoCountry: 'USA' } } },
        async ({ controller, handlers }) => {
          handlers.checkKycRequired.mockRejectedValue(new Error('down'));

          expect(await controller.checkKycRequired({ product: 'ramps' })).toBe(
            false,
          );
          expect(controller.state.error).toMatch(/KYC check failed/u);
        },
      );
    });

    it('discards a successful result when reset() runs while the check is in flight', async () => {
      await withController(
        { options: { state: { accessToken: 'a', geoCountry: 'USA' } } },
        async ({ controller, handlers }) => {
          handlers.checkKycRequired.mockImplementation(async () => {
            // Simulate a reset() landing while the HTTP call is in flight.
            controller.reset();
            return { kycRequired: true };
          });

          const result = await controller.checkKycRequired({
            product: 'ramps',
          });

          expect(result).toBe(false);
          expect(controller.state.phase).toBe('idle');
          expect(controller.state.kycRequiredByProduct.ramps).toBeUndefined();
          expect(controller.state.lastCheckedAt).toBeNull();
        },
      );
    });

    it('discards an error when reset() runs while the check is in flight', async () => {
      await withController(
        { options: { state: { accessToken: 'a', geoCountry: 'USA' } } },
        async ({ controller, handlers }) => {
          handlers.checkKycRequired.mockImplementation(async () => {
            controller.reset();
            throw new Error('down');
          });

          const result = await controller.checkKycRequired({
            product: 'ramps',
          });

          expect(result).toBe(false);
          expect(controller.state.phase).toBe('idle');
          expect(controller.state.error).toBeNull();
        },
      );
    });
  });

  describe('getKycStatus', () => {
    it('returns the cached value or undefined', async () => {
      await withController(
        { options: { state: { kycRequiredByProduct: { ramps: true } } } },
        ({ controller }) => {
          expect(controller.getKycStatus({ product: 'ramps' })).toBe(true);
          expect(controller.getKycStatus({ product: 'card' })).toBeUndefined();
        },
      );
    });
  });

  describe('getCustomerIdentity', () => {
    it('returns null before a vendor customer id is captured', async () => {
      await withController(({ controller }) => {
        expect(controller.getCustomerIdentity()).toBeNull();
      });
    });

    it('returns the vendor-scoped identity once captured', async () => {
      await withController(
        {
          options: {
            state: { moonpayCustomerId: 'cust-1', activeVendor: 'moonpay' },
          },
        },
        ({ controller }) => {
          expect(controller.getCustomerIdentity()).toStrictEqual({
            vendor: 'moonpay',
            id: 'cust-1',
          });
        },
      );
    });

    it('returns null after reset clears the captured id', async () => {
      await withController(
        {
          options: {
            state: { moonpayCustomerId: 'cust-1', activeVendor: 'moonpay' },
          },
        },
        ({ controller }) => {
          controller.reset();
          expect(controller.getCustomerIdentity()).toBeNull();
        },
      );
    });

    it('drops a MoonPay id when initialize switches to another vendor', async () => {
      await withController(
        {
          options: {
            state: { moonpayCustomerId: 'cust-1', activeVendor: 'moonpay' },
          },
        },
        async ({ controller }) => {
          await controller.initialize({ vendor: 'iron' });

          expect(controller.state.moonpayCustomerId).toBeNull();
          expect(controller.getCustomerIdentity()).toBeNull();
        },
      );
    });

    it('keeps a MoonPay id when initialize stays on MoonPay', async () => {
      await withController(
        {
          options: {
            state: { moonpayCustomerId: 'cust-1', activeVendor: 'moonpay' },
          },
        },
        async ({ controller }) => {
          await controller.initialize({ vendor: 'moonpay' });

          expect(controller.state.moonpayCustomerId).toBe('cust-1');
        },
      );
    });

    it('drops a MoonPay id when a non-MoonPay customer is created', async () => {
      await withController(
        {
          options: {
            state: { moonpayCustomerId: 'cust-1', activeVendor: 'moonpay' },
          },
        },
        async ({ controller }) => {
          await controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });

          expect(controller.state.moonpayCustomerId).toBeNull();
          expect(controller.getCustomerIdentity()).toBeNull();
        },
      );
    });

    it('returns null when a MoonPay id is present under another vendor', async () => {
      await withController(
        {
          options: {
            state: { moonpayCustomerId: 'cust-1', activeVendor: 'iron' },
          },
        },
        ({ controller }) => {
          expect(controller.getCustomerIdentity()).toBeNull();
        },
      );
    });

    it('keeps a MoonPay id when createVendorCustomer stays on MoonPay', async () => {
      await withController(
        {
          options: {
            state: { moonpayCustomerId: 'cust-1', activeVendor: 'moonpay' },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createVendorCustomer.mockResolvedValue({
            id: 'mp-1',
            email: 'a@b.co',
            status: 'active',
          });

          await controller.createVendorCustomer({
            vendor: 'moonpay',
            email: 'a@b.co',
          });

          expect(controller.state.moonpayCustomerId).toBe('cust-1');
        },
      );
    });
  });

  describe('startSumSub', () => {
    it('throws and marks failed when the SDK is unavailable', async () => {
      await withController(async ({ controller, launcher }) => {
        launcher.isAvailable.mockReturnValue(false);

        await expect(controller.startSumSub()).rejects.toThrow(
          /not available/u,
        );
        expect(controller.state.sumsub.status).toBe('failed');
      });
    });

    it('runs the full sub-flow and completes', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        launcher.launch.mockImplementation(
          async ({ onStatusChange, onTokenExpiration }) => {
            onStatusChange?.('idle', 'InProgress');
            onStatusChange?.('InProgress', 'Completed');
            await onTokenExpiration();
            return { ok: true };
          },
        );

        const result = await controller.startSumSub({
          locale: 'fr',
          debug: true,
        });

        expect(result).toStrictEqual({ ok: true });
        expect(controller.state.sumsub.status).toBe('complete');
        expect(controller.state.sumsub.applicantAccessToken).toBe('aat');
        // The wrapped key and a read-only capability token are handed over
        // once at session creation.
        expect(handlers.createUkycSession).toHaveBeenCalledWith(
          expect.objectContaining({
            wrappedEncryptionKey: expect.objectContaining({
              sessionId: 'wk',
              encryptedKey: 'enc',
            }),
            ukycCapabilityToken: expect.objectContaining({
              payload: expect.objectContaining({
                operations: ['read'],
                presenter: 'client',
              }),
              signature: expect.any(String),
            }),
          }),
        );
        // onTokenExpiration re-fetches the applicant access token.
        expect(handlers.createJourney).toHaveBeenCalledTimes(2);
      });
    });

    it('stops with a vendorProcessing status when the relay approved but the vendor is still pending', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        // The applicant already finished the journey: the relay reports
        // `approved` while the vendor is still finalizing (`pending`).
        handlers.createUkycSession.mockResolvedValue({
          sessionId: 'sid',
          kycStatus: 'approved',
          finalStatus: 'pending',
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({
          kycStatus: 'approved',
          finalStatus: 'pending',
        });
        expect(controller.state.sumsub.status).toBe('vendorProcessing');
        expect(controller.state.sumsub.sessionId).toBe('sid');
        expect(controller.state.statusMessage).toMatch(
          /being processed by the vendor/u,
        );
        // The SDK is never launched and no journey is created for an
        // already-approved applicant.
        expect(handlers.createJourney).not.toHaveBeenCalled();
        expect(launcher.launch).not.toHaveBeenCalled();
      });
    });

    it('continues the flow when approved and the vendor is not pending', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        // A terminal vendor status (not `pending`) must not short-circuit.
        handlers.createUkycSession.mockResolvedValue({
          sessionId: 'sid',
          kycStatus: 'approved',
          finalStatus: 'approved',
        });
        launcher.launch.mockImplementation(async ({ onStatusChange }) => {
          onStatusChange?.('InProgress', 'Completed');
          return { ok: true };
        });
        handlers.getSessionStatus.mockResolvedValue(sessionStatus('approved'));

        await controller.startSumSub();

        expect(handlers.createJourney).toHaveBeenCalled();
        expect(launcher.launch).toHaveBeenCalled();
      });
    });

    it('does not write vendorProcessing state when reset() runs while creating the session', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.createUkycSession.mockImplementation(async () => {
          controller.reset();
          return {
            sessionId: 'sid',
            kycStatus: 'approved',
            finalStatus: 'pending',
          };
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({});
        expect(controller.state.sumsub.status).toBe('idle');
        expect(controller.state.sumsub.sessionId).toBeNull();
        expect(launcher.launch).not.toHaveBeenCalled();
      });
    });

    it('aborts when the attested session server public key does not match', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.getWrappingKey.mockResolvedValue({
          id: 'wk',
          jwtChain: 'jwt.chain.sig',
          sessionServerPublicKey: { kty: 'OKP', crv: 'X25519', x: 'tampered' },
        });

        const result = await controller.startSumSub();

        expect(result).toMatchObject({
          error: expect.stringContaining(
            'sessionServerPublicKey does not match',
          ),
        });
        expect(controller.state.sumsub.status).toBe('failed');
        expect(launcher.launch).not.toHaveBeenCalled();
      });
    });

    it('defaults locale and debug when no params are given', async () => {
      await withController(async ({ controller, launcher }) => {
        launcher.launch.mockImplementation(async ({ onStatusChange }) => {
          onStatusChange?.('InProgress', 'Completed');
          return { ok: true };
        });

        await controller.startSumSub();

        expect(launcher.launch).toHaveBeenCalledWith(
          expect.objectContaining({ locale: 'en', debug: false }),
        );
        expect(controller.state.sumsub.status).toBe('complete');
      });
    });

    it('marks failed when launch resolves without a Completed status', async () => {
      await withController(async ({ controller, launcher }) => {
        launcher.launch.mockImplementation(async ({ onStatusChange }) => {
          // The applicant abandons the flow: the SDK reports progress but never
          // a Completed status, yet `launch` still resolves.
          onStatusChange?.('idle', 'InProgress');
          return { ok: false };
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({ ok: false });
        expect(controller.state.sumsub.status).toBe('failed');
        expect(controller.state.sumsub.result).toStrictEqual({ ok: false });
      });
    });

    it('marks failed and returns the error when a step throws', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.createUkycSession.mockRejectedValue(new Error('ukyc down'));

        const result = await controller.startSumSub();

        expect(result).toMatchObject({
          error: expect.stringContaining('ukyc down'),
        });
        expect(controller.state.sumsub.status).toBe('failed');
      });
    });

    it('aborts without launching the SDK when reset() runs while in flight', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        // Simulate a reset() landing while the UKYC session is being created.
        handlers.createUkycSession.mockImplementation(async () => {
          controller.reset();
          return {
            sessionId: 'sid',
          };
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({});
        expect(launcher.launch).not.toHaveBeenCalled();
        // The interrupted step must not write stale sub-flow state.
        expect(controller.state.sumsub.status).toBe('idle');
        expect(controller.state.sumsub.sessionId).toBeNull();
        expect(controller.state.phase).toBe('idle');
      });
    });

    it('aborts without launching the SDK when reset() runs just before launch', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        // A reset() lands during the final token exchange, i.e. after the
        // session is prepared but before the SDK is presented.
        handlers.createJourney.mockImplementation(async () => {
          controller.reset();
          return { status: 'ok', applicantAccessToken: 'aat' };
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({});
        // The SDK must not be opened on a flow that was reset to idle, and the
        // `launching` status must not be written.
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(controller.state.sumsub.status).toBe('idle');
        expect(controller.state.sumsub.applicantAccessToken).toBeNull();
        expect(controller.state.phase).toBe('idle');
      });
    });

    it('refuses to refresh the token via onTokenExpiration after a reset', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        let refreshError: unknown;
        launcher.launch.mockImplementation(async ({ onTokenExpiration }) => {
          // The SDK stays open across a reset, then asks for a fresh token.
          controller.reset();
          // Only the initial createJourney (session setup) should
          // have run.
          const callsBeforeRefresh = handlers.createJourney.mock.calls.length;
          try {
            await onTokenExpiration();
          } catch (error) {
            refreshError = error;
          }
          // The refresh must not hit the stale UKYC session.
          expect(handlers.createJourney.mock.calls).toHaveLength(
            callsBeforeRefresh,
          );
          return { ok: true };
        });

        await controller.startSumSub();

        expect(refreshError).toBeInstanceOf(Error);
        expect((refreshError as Error).message).toMatch(/flow was reset/u);
      });
    });

    it('suppresses status and terminal writes when reset() runs during the SDK launch', async () => {
      await withController(async ({ controller, launcher }) => {
        launcher.launch.mockImplementation(async ({ onStatusChange }) => {
          // First status arrives on the active flow, then a reset() lands and
          // a later status + the resolved result must not resurrect state.
          onStatusChange?.('idle', 'InProgress');
          controller.reset();
          onStatusChange?.('InProgress', 'Completed');
          return { ok: true };
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({ ok: true });
        expect(controller.state.sumsub.status).toBe('idle');
        expect(controller.state.sumsub.result).toBeNull();
        expect(controller.state.phase).toBe('idle');
      });
    });
  });

  describe('session status polling', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Makes the launcher report a successful SDK completion so the sub-flow
     * proceeds into session-status polling.
     *
     * @param launcher - The mocked launcher.
     */
    function completeSdk(launcher: Launcher): void {
      launcher.launch.mockImplementation(async ({ onStatusChange }) => {
        onStatusChange?.('InProgress', 'Completed');
        return { ok: true };
      });
    }

    it('polls the session status after completion and completes on an approved status', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        completeSdk(launcher);
        handlers.getSessionStatus.mockResolvedValue(sessionStatus('approved'));

        await controller.startSumSub();

        expect(handlers.getSessionStatus).toHaveBeenCalledWith({
          sessionId: 'sid',
        });
        expect(controller.state.sumsub.status).toBe('complete');
        expect(controller.state.sumsub.sessionStatus).toStrictEqual(
          sessionStatus('approved'),
        );
      });
    });

    it('maps a rejected terminal status to a failed sub-flow', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        completeSdk(launcher);
        handlers.getSessionStatus.mockResolvedValue(sessionStatus('rejected'));

        await controller.startSumSub();

        expect(controller.state.sumsub.status).toBe('failed');
        expect(controller.state.sumsub.sessionStatus).toStrictEqual(
          sessionStatus('rejected'),
        );
      });
    });

    it('treats SDK completion as final when the UKYC session has no id to poll', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        // A session created without an id leaves nothing to poll against.
        handlers.createUkycSession.mockResolvedValue({ sessionId: '' });
        completeSdk(launcher);

        await controller.startSumSub();

        expect(handlers.getSessionStatus).not.toHaveBeenCalled();
        expect(controller.state.sumsub.status).toBe('complete');
      });
    });

    it('does not poll when the SDK did not report completion', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        // The applicant abandons the flow: `launch` resolves without ever
        // reporting a Completed status.
        launcher.launch.mockResolvedValue({ ok: false });

        await controller.startSumSub();

        expect(controller.state.sumsub.status).toBe('failed');
        expect(handlers.getSessionStatus).not.toHaveBeenCalled();
      });
    });

    it('keeps polling on a transient error, preserving the last good status', async () => {
      jest.useFakeTimers();
      await withController(
        { options: { sessionStatusPollIntervalMs: 1000 } },
        async ({ controller, handlers, launcher }) => {
          completeSdk(launcher);
          handlers.getSessionStatus
            .mockResolvedValueOnce(sessionStatus('pending'))
            .mockRejectedValueOnce(new Error('network blip'))
            .mockResolvedValueOnce(sessionStatus('approved'));

          await controller.startSumSub();

          // First poll: non-terminal, keeps polling.
          expect(controller.state.sumsub.status).toBe('polling');
          expect(controller.state.sumsub.sessionStatus).toStrictEqual(
            sessionStatus('pending'),
          );

          // Second poll fails transiently: the last good status is preserved
          // and the loop keeps going.
          await jest.advanceTimersByTimeAsync(1000);
          expect(controller.state.sumsub.status).toBe('polling');
          expect(controller.state.sumsub.sessionStatus).toStrictEqual(
            sessionStatus('pending'),
          );

          // Third poll reaches a terminal status.
          await jest.advanceTimersByTimeAsync(1000);
          expect(controller.state.sumsub.status).toBe('complete');
          expect(controller.state.sumsub.sessionStatus).toStrictEqual(
            sessionStatus('approved'),
          );
          expect(handlers.getSessionStatus).toHaveBeenCalledTimes(3);
        },
      );
    });

    it('stops polling once a terminal status is reached', async () => {
      jest.useFakeTimers();
      await withController(
        { options: { sessionStatusPollIntervalMs: 1000 } },
        async ({ controller, handlers, launcher }) => {
          completeSdk(launcher);
          handlers.getSessionStatus.mockResolvedValue(
            sessionStatus('approved'),
          );

          await controller.startSumSub();
          expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);

          // No further polls after a terminal status.
          await jest.advanceTimersByTimeAsync(5000);
          expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('stops polling when reset() is called', async () => {
      jest.useFakeTimers();
      await withController(
        { options: { sessionStatusPollIntervalMs: 1000 } },
        async ({ controller, handlers, launcher }) => {
          completeSdk(launcher);
          handlers.getSessionStatus.mockResolvedValue(sessionStatus('pending'));

          await controller.startSumSub();
          expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);

          controller.reset();
          await jest.advanceTimersByTimeAsync(5000);

          // The scheduled poll was cancelled by reset().
          expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);
          expect(controller.state.sumsub.status).toBe('idle');
        },
      );
    });

    it('discards a poll result when reset() runs while the request is in flight', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        completeSdk(launcher);
        // Simulate a reset() landing while the status request is in flight.
        handlers.getSessionStatus.mockImplementation(async () => {
          controller.reset();
          return sessionStatus('approved');
        });

        await controller.startSumSub();

        expect(controller.state.sumsub.status).toBe('idle');
        expect(controller.state.sumsub.sessionStatus).toBeNull();
      });
    });

    it('supersedes a prior polling loop when a new sub-flow starts', async () => {
      jest.useFakeTimers();
      await withController(
        { options: { sessionStatusPollIntervalMs: 1000 } },
        async ({ controller, handlers, launcher }) => {
          completeSdk(launcher);
          // First sub-flow polls a never-terminal status.
          handlers.getSessionStatus.mockResolvedValue(sessionStatus('pending'));

          await controller.startSumSub();
          expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);

          // A second sub-flow reaches a terminal status on its first poll and
          // must cancel the first loop's scheduled poll.
          handlers.getSessionStatus.mockResolvedValue(
            sessionStatus('approved'),
          );
          await controller.startSumSub();
          expect(controller.state.sumsub.status).toBe('complete');

          const callsAfterSecondFlow =
            handlers.getSessionStatus.mock.calls.length;
          await jest.advanceTimersByTimeAsync(5000);

          // No stray polls from the superseded first loop.
          expect(handlers.getSessionStatus).toHaveBeenCalledTimes(
            callsAfterSecondFlow,
          );
        },
      );
    });
  });

  describe('getSessionStatus', () => {
    it('fetches and records the session status on demand', async () => {
      await withController(
        {
          options: {
            state: {
              sumsub: {
                status: 'complete',
                result: null,
                sessionId: 'sid',
                applicantAccessToken: null,
                sessionStatus: null,
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getSessionStatus.mockResolvedValue(
            sessionStatus('approved'),
          );

          const result = await controller.getSessionStatus();

          expect(handlers.getSessionStatus).toHaveBeenCalledWith({
            sessionId: 'sid',
          });
          expect(result).toStrictEqual(sessionStatus('approved'));
          expect(controller.state.sumsub.sessionStatus).toStrictEqual(
            sessionStatus('approved'),
          );
        },
      );
    });

    it('throws when there is no active SumSub session', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.getSessionStatus()).rejects.toThrow(
          /no active SumSub session/u,
        );
      });
    });
  });

  describe('reset', () => {
    it('clears session state but preserves persisted terms', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'form',
              sessionToken: 'tok',
              accessToken: 'a',
              activeProduct: 'ramps',
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['1'],
              kycRequiredByProduct: { ramps: true },
            },
          },
        },
        ({ controller }) => {
          controller.reset();
          expect(controller.state.phase).toBe('idle');
          expect(controller.state.sessionToken).toBeNull();
          expect(controller.state.accessToken).toBeNull();
          expect(controller.state.activeProduct).toBeNull();
          expect(controller.state.termsAcceptedAt).toBe('t');
          expect(controller.state.kycRequiredByProduct.ramps).toBe(true);
        },
      );
    });
  });

  describe('iron vendor flow', () => {
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('creates an Iron customer and loads Iron disclaimers on initialize', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockResolvedValue('USA');
        handlers.fetchDisclaimers.mockResolvedValue([
          { id: 'd1', display_name: 'Iron T&C', url: 'https://t' },
        ]);

        await controller.initialize({
          email: 'a@b.co',
          vendor: 'iron',
          product: 'money',
        });

        expect(handlers.createVendorCustomer).toHaveBeenCalledWith({
          vendor: 'iron',
          email: 'a@b.co',
        });
        expect(handlers.fetchDisclaimers).toHaveBeenCalledWith({
          vendor: 'iron',
          country: 'USA',
        });
        expect(handlers.createSession).not.toHaveBeenCalled();
        expect(controller.state.activeVendor).toBe('iron');
        expect(controller.state.activeProduct).toBe('money');
        expect(controller.state.phase).toBe('terms');
        expect(controller.state.disclaimers).toHaveLength(1);
      });
    });

    it('fails initialize when Iron customer creation fails', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.createVendorCustomer.mockRejectedValue(new Error('iron down'));

        await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

        expect(controller.state.phase).toBe('error');
        expect(controller.state.error).toMatch(
          /Vendor customer creation failed/u,
        );
      });
    });

    it('preserves MoonPay terms when Iron customer creation fails on initialize', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['moonpay-d1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createVendorCustomer.mockRejectedValue(
            new Error('iron down'),
          );

          await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.termsAcceptedAt).toBe('t');
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([
            'moonpay-d1',
          ]);
          expect(controller.state.termsAcceptedVendor).toBe('moonpay');
        },
      );
    });

    it('preserves MoonPay terms when reset lands during Iron customer creation', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['moonpay-d1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller, handlers }) => {
          let release: (error: Error) => void = () => {
            // placeholder
          };
          handlers.createVendorCustomer.mockReturnValue(
            new Promise((_resolve, reject) => {
              release = reject;
            }),
          );

          const pending = controller.initialize({
            email: 'a@b.co',
            vendor: 'iron',
          });
          controller.reset();
          release(new Error('late'));
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.termsAcceptedAt).toBe('t');
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([
            'moonpay-d1',
          ]);
          expect(controller.state.termsAcceptedVendor).toBe('moonpay');
        },
      );
    });

    it('does not fail initialize when reset lands during Iron customer creation', async () => {
      await withController(async ({ controller, handlers }) => {
        let release: (value: {
          id: string;
          email: string;
          status: string;
        }) => void = () => {
          // placeholder
        };
        handlers.createVendorCustomer.mockReturnValue(
          new Promise((resolve) => {
            release = resolve;
          }),
        );

        const pending = controller.initialize({
          email: 'a@b.co',
          vendor: 'iron',
        });
        controller.reset();
        release({ id: '1', email: 'a@b.co', status: 'SigningsRequired' });
        await pending;

        expect(controller.state.phase).toBe('idle');
        expect(controller.state.error).toBeNull();
      });
    });

    it('does not fail initialize when Iron customer creation rejects after reset', async () => {
      await withController(async ({ controller, handlers }) => {
        let release: (error: Error) => void = () => {
          // placeholder
        };
        handlers.createVendorCustomer.mockReturnValue(
          new Promise((_resolve, reject) => {
            release = reject;
          }),
        );

        const pending = controller.initialize({
          email: 'a@b.co',
          vendor: 'iron',
        });
        controller.reset();
        release(new Error('late'));
        await pending;

        expect(controller.state.phase).toBe('idle');
        expect(controller.state.error).toBeNull();
      });
    });

    it('resumes an Iron session when terms and email are already present', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['d1'],
              termsAcceptedVendor: 'iron',
              sumsubTncAccepted: true,
              idosTncAccepted: true,
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });
          handlers.fetchKycStatus.mockResolvedValue({ status: 'completed' });

          await controller.initialize({
            email: 'a@b.co',
            vendor: 'iron',
            product: 'money',
          });

          expect(handlers.submitConsents).toHaveBeenCalled();
          expect(handlers.createSession).not.toHaveBeenCalled();
          expect(controller.state.phase).toBe('done');
          controller.reset();
        },
      );
    });

    it('does not reuse MoonPay terms acceptance for a consents-path vendor', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['moonpay-d1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.fetchDisclaimers.mockResolvedValue([
            { id: 'iron-d1', display_name: 'T', url: 'u' },
          ]);

          await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

          expect(handlers.submitConsents).not.toHaveBeenCalled();
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([]);
          expect(controller.state.termsAcceptedVendor).toBeNull();
          expect(handlers.fetchDisclaimers).toHaveBeenCalledWith({
            vendor: 'iron',
            country: 'USA',
          });
          expect(controller.state.phase).toBe('terms');
        },
      );
    });

    it('requires reacceptance when T&C2 flags are null (pre-migration state)', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['d1'],
              termsAcceptedVendor: 'iron',
              // T&C2 flags are null, simulating pre-migration state
              sumsubTncAccepted: null,
              idosTncAccepted: null,
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.fetchDisclaimers.mockResolvedValue([
            { id: 'd1', display_name: 'T', url: 'u' },
          ]);

          await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

          // T&C2 flags were null; reacceptance required.
          expect(controller.state.phase).toBe('terms');
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.sumsubTncAccepted).toBeNull();
          expect(controller.state.idosTncAccepted).toBeNull();
        },
      );
    });

    it('does not reuse consents-path terms acceptance for MoonPay', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['iron-d1'],
              termsAcceptedVendor: 'iron',
            },
          },
        },
        async ({ controller, handlers }) => {
          await controller.initialize({ email: 'a@b.co', vendor: 'moonpay' });

          expect(handlers.createSession).not.toHaveBeenCalled();
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([]);
          expect(controller.state.phase).toBe('terms');
        },
      );
    });

    it('drops another vendor terms acceptance when createVendorCustomer switches vendor', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['moonpay-d1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller }) => {
          await controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });

          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([]);
          expect(controller.state.termsAcceptedVendor).toBeNull();
        },
      );
    });

    it('keeps terms acceptance when createVendorCustomer stays on the same vendor', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['iron-d1'],
              termsAcceptedVendor: 'iron',
            },
          },
        },
        async ({ controller }) => {
          await controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });

          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([
            'iron-d1',
          ]);
          expect(controller.state.termsAcceptedVendor).toBe('iron');
        },
      );
    });

    it.each(['session', 'check', 'auth', 'form', 'submit'] as const)(
      'does not switch vendor or drop the MoonPay id while phase is %s',
      async (phase) => {
        await withController(
          {
            options: {
              state: {
                phase,
                activeVendor: 'moonpay',
                moonpayCustomerId: 'cust-1',
                sessionToken: 'tok',
              },
            },
          },
          async ({ controller, handlers }) => {
            await controller.createVendorCustomer({
              vendor: 'iron',
              email: 'a@b.co',
            });

            expect(handlers.createVendorCustomer).not.toHaveBeenCalled();
            expect(controller.state.activeVendor).toBe('moonpay');
            expect(controller.state.moonpayCustomerId).toBe('cust-1');
            expect(controller.state.phase).toBe(phase);
            expect(controller.getCustomerIdentity()).toStrictEqual({
              vendor: 'moonpay',
              id: 'cust-1',
            });
          },
        );
      },
    );

    it('stamps the active vendor onto the terms acceptance', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, launcher }) => {
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.termsAcceptedVendor).toBe('iron');
          expect(controller.state.sumsubTncAccepted).toBe(true);
          expect(controller.state.idosTncAccepted).toBe(true);
          controller.reset();
        },
      );
    });

    it('createVendorCustomer sets the vendor and fails on API errors', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.createVendorCustomer.mockRejectedValue(new Error('nope'));

        await controller.createVendorCustomer({
          vendor: 'iron',
          email: 'a@b.co',
        });

        expect(controller.state.activeVendor).toBe('iron');
        expect(controller.state.email).toBe('a@b.co');
        expect(controller.state.phase).toBe('error');
      });
    });

    it('preserves MoonPay terms when createVendorCustomer fails after a vendor switch', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['moonpay-d1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createVendorCustomer.mockRejectedValue(new Error('nope'));

          await controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.termsAcceptedAt).toBe('t');
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([
            'moonpay-d1',
          ]);
          expect(controller.state.termsAcceptedVendor).toBe('moonpay');
        },
      );
    });

    it('preserves MoonPay terms when reset lands during createVendorCustomer', async () => {
      await withController(
        {
          options: {
            state: {
              termsAcceptedAt: 't',
              acceptedDisclaimerIds: ['moonpay-d1'],
              termsAcceptedVendor: 'moonpay',
            },
          },
        },
        async ({ controller, handlers }) => {
          let release: (value: {
            id: string;
            email: string;
            status: string;
          }) => void = () => {
            // placeholder
          };
          handlers.createVendorCustomer.mockReturnValue(
            new Promise((resolve) => {
              release = resolve;
            }),
          );

          const pending = controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });
          controller.reset();
          release({ id: '1', email: 'a@b.co', status: 'SigningsRequired' });
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.termsAcceptedAt).toBe('t');
          expect(controller.state.acceptedDisclaimerIds).toStrictEqual([
            'moonpay-d1',
          ]);
          expect(controller.state.termsAcceptedVendor).toBe('moonpay');
        },
      );
    });

    it('createVendorCustomer ignores API errors after reset', async () => {
      await withController(async ({ controller, handlers }) => {
        let release: (error: Error) => void = () => {
          // placeholder
        };
        handlers.createVendorCustomer.mockReturnValue(
          new Promise((_resolve, reject) => {
            release = reject;
          }),
        );

        const pending = controller.createVendorCustomer({
          vendor: 'iron',
          email: 'a@b.co',
        });
        controller.reset();
        release(new Error('late'));
        await pending;

        expect(controller.state.phase).toBe('idle');
        expect(controller.state.error).toBeNull();
      });
    });

    it('posts consents and starts SumSub without MoonPay frames', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.submitConsents.mockResolvedValue(undefined);
          handlers.fetchKycStatus.mockResolvedValue({ status: 'pending' });
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(handlers.createSession).not.toHaveBeenCalled();
          expect(handlers.submitConsents).toHaveBeenCalledWith({
            disclaimerIds: ['d1'],
            sumsubTncSigned: true,
            idosTncSigned: true,
          });
          expect(handlers.createUkycSession).toHaveBeenCalledWith(
            expect.objectContaining({ vendor: 'iron' }),
          );
          expect(launcher.launch).toHaveBeenCalled();
          expect(controller.buildCheckFrameUrl()).toBeNull();
          expect(controller.buildAuthFrameUrl()).toBeNull();
          expect(controller.state.userStatus).toBe('pending');
          expect(controller.state.phase).toBe('done');
          expect(controller.state.sumsub.status).toBe('complete');
          controller.reset();
        },
      );
    });

    it('fails the consents path when T&C2 flags are omitted', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          // @ts-expect-error T&C2 flags are required
          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing T&C2 acceptance/u);
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(handlers.submitConsents).not.toHaveBeenCalled();
        },
      );
    });

    it('fails the consents path when only one T&C2 flag is provided', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          // @ts-expect-error both T&C2 flags are required
          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing T&C2 acceptance/u);
          expect(handlers.submitConsents).not.toHaveBeenCalled();
        },
      );
    });

    it('submits explicit T&C2 false flags on the consents path', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            sumsubTncSigned: false,
            idosTncSigned: false,
          });

          expect(handlers.submitConsents).toHaveBeenCalledWith({
            disclaimerIds: ['d1'],
            sumsubTncSigned: false,
            idosTncSigned: false,
          });
          expect(controller.state.sumsubTncAccepted).toBe(false);
          expect(controller.state.idosTncAccepted).toBe(false);
          controller.reset();
        },
      );
    });

    it('fails the Iron session when email is missing', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller }) => {
          await controller.acceptTermsAndStartSession({
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing email/u);
        },
      );
    });

    it('fails the Iron session when disclaimer acceptance is missing', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              email: 'a@b.co',
              disclaimers: [],
            },
          },
        },
        async ({ controller }) => {
          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(
            /Missing disclaimer acceptance/u,
          );
        },
      );
    });

    it('returns to terms when SumSub fails during the Iron session', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createUkycSession.mockRejectedValue(
            new Error('sumsub down'),
          );
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.error).toMatch(/Consents session failed/u);
        },
      );
    });

    it('returns to terms when SumSub closes without completion during the Iron session', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            // Applicant abandons: launch resolves without a Completed status.
            onStatusChange?.('idle', 'InProgress');
            return { ok: false };
          });
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.sumsub.status).toBe('failed');
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.error).toMatch(/Consents session failed/u);
          expect(handlers.fetchKycStatus).not.toHaveBeenCalled();
        },
      );
    });

    it('keeps done when status refresh fails after a successful SumSub', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });
          handlers.fetchKycStatus.mockRejectedValue(new Error('status down'));

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('done');
          expect(controller.state.sumsub.status).toBe('complete');
          controller.reset();
        },
      );
    });

    it('ignores in-flight Iron consents after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          let release: () => void = () => {
            // placeholder
          };
          handlers.submitConsents.mockReturnValue(
            new Promise<void>((resolve) => {
              release = resolve;
            }),
          );

          const pending = controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });
          controller.reset();
          release();
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(handlers.createUkycSession).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores SumSub completion after reset during the Iron session', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          let releaseLaunch: (value: { ok: boolean }) => void = () => {
            // placeholder
          };
          launcher.launch.mockReturnValue(
            new Promise((resolve) => {
              releaseLaunch = resolve;
            }),
          );

          const pending = controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });
          // Consents + UKYC session run first; wait until launch is pending.
          await Promise.resolve();
          await Promise.resolve();
          controller.reset();
          releaseLaunch({ ok: true });
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(handlers.fetchKycStatus).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores Iron session failures after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          let release: (error: Error) => void = () => {
            // placeholder
          };
          handlers.submitConsents.mockReturnValue(
            new Promise<void>((_resolve, reject) => {
              release = reject;
            }),
          );

          const pending = controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });
          controller.reset();
          release(new Error('late consent failure'));
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.error).toBeNull();
        },
      );
    });

    it('refreshKycStatus stores status and emits statusChanged', async () => {
      await withController(
        { options: { userStatusPollIntervalMs: 60_000 } },
        async ({ controller, handlers, rootMessenger }) => {
          const listener = jest.fn();
          rootMessenger.subscribe('KycController:statusChanged', listener);
          handlers.fetchKycStatus.mockResolvedValue({
            status: 'completed',
            sumsubSessionId: 'ss-1',
          });

          const result = await controller.refreshKycStatus();

          expect(result).toStrictEqual({
            status: 'completed',
            sumsubSessionId: 'ss-1',
            errorCode: null,
          });
          expect(controller.state.userStatus).toBe('completed');
          expect(listener).toHaveBeenCalledWith({
            status: 'completed',
            sumsubSessionId: 'ss-1',
            errorCode: null,
          });
        },
      );
    });

    it('polls user status while pending and stops on a terminal status', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          { options: { userStatusPollIntervalMs: 1000 } },
          async ({ controller, handlers }) => {
            handlers.fetchKycStatus
              .mockResolvedValueOnce({ status: 'pending' })
              .mockResolvedValueOnce({ status: 'pending' })
              .mockResolvedValueOnce({ status: 'completed' });

            await controller.refreshKycStatus();
            expect(controller.state.userStatus).toBe('pending');

            // First tick stays pending and reschedules; second tick completes.
            await jest.advanceTimersByTimeAsync(1000);
            expect(controller.state.userStatus).toBe('pending');
            await jest.advanceTimersByTimeAsync(1000);
            expect(controller.state.userStatus).toBe('completed');

            // A second refresh while pending would no-op the timer start; then
            // reset clears any leftover handles.
            handlers.fetchKycStatus.mockResolvedValue({ status: 'pending' });
            await controller.refreshKycStatus();
            await controller.refreshKycStatus();
            controller.reset();
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not start a second poll loop when refreshed during an in-flight tick', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          { options: { userStatusPollIntervalMs: 1000 } },
          async ({ controller, handlers }) => {
            let releaseTick: (value: { status: string }) => void = () => {
              // placeholder
            };
            handlers.fetchKycStatus
              // Initial refresh starts the loop.
              .mockResolvedValueOnce({ status: 'pending' })
              // The first scheduled tick hangs, so the timer handle is null
              // while the request is in flight.
              .mockImplementationOnce(
                async () =>
                  new Promise((resolve) => {
                    releaseTick = resolve;
                  }),
              )
              // Any later poll stays pending so the loop keeps scheduling.
              .mockResolvedValue({ status: 'pending' });

            await controller.refreshKycStatus();
            expect(handlers.fetchKycStatus).toHaveBeenCalledTimes(1);

            // Fire the scheduled tick; it clears the timer handle then awaits.
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            expect(handlers.fetchKycStatus).toHaveBeenCalledTimes(2);

            // A concurrent refresh while the tick is in flight (timer handle
            // null) must not spin up a second loop on the same token.
            await controller.refreshKycStatus();
            expect(handlers.fetchKycStatus).toHaveBeenCalledTimes(3);

            // Let the in-flight tick resolve and reschedule.
            releaseTick({ status: 'pending' });
            await Promise.resolve();
            await Promise.resolve();

            // A single loop means exactly one fetch per interval; a duplicated
            // loop would fire twice here.
            await jest.advanceTimersByTimeAsync(1000);
            expect(handlers.fetchKycStatus).toHaveBeenCalledTimes(4);

            controller.reset();
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('drops superseded user-status poll ticks after reset', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          { options: { userStatusPollIntervalMs: 1000 } },
          async ({ controller, handlers }) => {
            let release: (value: { status: string }) => void = () => {
              // placeholder
            };
            handlers.fetchKycStatus
              .mockResolvedValueOnce({ status: 'pending' })
              .mockImplementationOnce(
                async () =>
                  new Promise((resolve) => {
                    release = resolve;
                  }),
              );

            await controller.refreshKycStatus();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            await Promise.resolve();
            controller.reset();
            release({ status: 'completed' });
            await Promise.resolve();
            await Promise.resolve();

            expect(controller.state.userStatus).toBe('pending');
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps polling when a user-status tick fails transiently', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          { options: { userStatusPollIntervalMs: 1000 } },
          async ({ controller, handlers }) => {
            handlers.fetchKycStatus
              .mockResolvedValueOnce({ status: 'pending' })
              .mockRejectedValueOnce(new Error('transient'))
              .mockResolvedValueOnce({ status: 'completed' });

            await controller.refreshKycStatus();
            await jest.advanceTimersByTimeAsync(1000);
            await jest.advanceTimersByTimeAsync(1000);

            expect(controller.state.userStatus).toBe('completed');
            controller.reset();
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('drops superseded user-status ticks that fail after reset', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          { options: { userStatusPollIntervalMs: 1000 } },
          async ({ controller, handlers }) => {
            let release: (error: Error) => void = () => {
              // placeholder
            };
            handlers.fetchKycStatus
              .mockResolvedValueOnce({ status: 'pending' })
              .mockImplementationOnce(
                async () =>
                  new Promise((_resolve, reject) => {
                    release = reject;
                  }),
              );

            await controller.refreshKycStatus();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            await Promise.resolve();
            controller.reset();
            release(new Error('late'));
            await Promise.resolve();
            await Promise.resolve();

            expect(controller.state.userStatus).toBe('pending');
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns cached user status when reset lands during refresh', async () => {
      await withController(
        {
          options: {
            state: { userStatus: 'pending' },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers }) => {
          let release: (value: { status: string }) => void = () => {
            // placeholder
          };
          handlers.fetchKycStatus.mockReturnValue(
            new Promise((resolve) => {
              release = resolve;
            }),
          );

          const pending = controller.refreshKycStatus();
          controller.reset();
          release({ status: 'completed' });
          const result = await pending;

          expect(result.status).toBe('pending');
        },
      );
    });

    it('does not restart polling when reset lands during refresh', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          {
            options: {
              state: { userStatus: 'pending' },
              userStatusPollIntervalMs: 1000,
            },
          },
          async ({ controller, handlers, rootMessenger }) => {
            const listener = jest.fn();
            rootMessenger.subscribe('KycController:statusChanged', listener);
            let release: (value: { status: string }) => void = () => {
              // placeholder
            };
            handlers.fetchKycStatus.mockReturnValue(
              new Promise((resolve) => {
                release = resolve;
              }),
            );

            const pending = controller.refreshKycStatus();
            controller.reset();
            release({ status: 'pending' });
            await pending;
            handlers.fetchKycStatus.mockClear();
            await jest.advanceTimersByTimeAsync(3000);

            expect(handlers.fetchKycStatus).not.toHaveBeenCalled();
            expect(listener).not.toHaveBeenCalled();
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('defaults superseded refresh status to not-started when unset', async () => {
      await withController(
        { options: { userStatusPollIntervalMs: 60_000 } },
        async ({ controller, handlers }) => {
          let release: (value: { status: string }) => void = () => {
            // placeholder
          };
          handlers.fetchKycStatus.mockReturnValue(
            new Promise((resolve) => {
              release = resolve;
            }),
          );

          const pending = controller.refreshKycStatus();
          controller.reset();
          release({ status: 'completed' });
          const result = await pending;

          expect(result.status).toBe('not-started');
        },
      );
    });

    it('maps session_not_in_valid_state to completed during SumSub', async () => {
      await withController(
        {
          options: {
            state: { activeVendor: 'iron', phase: 'submit' },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createUkycSession.mockRejectedValue(
            new Error(
              "Fetching 'https://x' failed with status '409': session_not_in_valid_state",
            ),
          );

          const result = await controller.startSumSub();

          expect(result).toStrictEqual({ alreadyCompleted: true });
          expect(controller.state.userStatus).toBe('completed');
          expect(controller.state.phase).toBe('done');
          expect(controller.state.sumsub.status).toBe('complete');
        },
      );
    });

    it('leaves an already-reset controller idle when SumSub reports a stale session', async () => {
      await withController(
        {
          options: {
            state: { activeVendor: 'iron', phase: 'submit' },
          },
        },
        async ({ controller, handlers }) => {
          let rejectSession: (error: Error) => void = () => undefined;
          handlers.createUkycSession.mockReturnValue(
            new Promise((_resolve, reject) => {
              rejectSession = reject;
            }),
          );

          const pending = controller.startSumSub();
          controller.reset();
          rejectSession(new Error('session_not_in_valid_state'));

          expect(await pending).toStrictEqual({ alreadyCompleted: true });
          expect(controller.state.userStatus).toBeNull();
          expect(controller.state.phase).toBe('idle');
          expect(controller.state.sumsub.status).toBe('idle');
        },
      );
    });

    it('keeps phase done when Iron SumSub reports already completed', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              disclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers }) => {
          handlers.createUkycSession.mockRejectedValue(
            new Error('session_not_in_valid_state'),
          );
          handlers.fetchKycStatus.mockResolvedValue({ status: 'completed' });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            sumsubTncSigned: true,
            idosTncSigned: true,
          });

          expect(controller.state.phase).toBe('done');
          expect(controller.state.userStatus).toBe('completed');
          controller.reset();
        },
      );
    });
  });

  describe('messenger actions', () => {
    it('exposes methods as messenger actions', async () => {
      await withController(({ rootMessenger }) => {
        expect(
          rootMessenger.call('KycController:buildResetFrameUrl'),
        ).toContain('ch_reset');
      });
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<KycControllerMessenger>,
  MessengerEvents<KycControllerMessenger>
>;

type ServiceHandlers = {
  getGeoCountry: jest.Mock;
  fetchDisclaimers: jest.Mock;
  createSession: jest.Mock;
  checkKycRequired: jest.Mock;
  createVendorCustomer: jest.Mock;
  submitConsents: jest.Mock;
  fetchKycStatus: jest.Mock;
  getWrappingKey: jest.Mock;
  fetchJwks: jest.Mock;
  createUkycSession: jest.Mock;
  createJourney: jest.Mock;
  getSessionStatus: jest.Mock;
  performGetStorage: jest.Mock;
  performSetStorage: jest.Mock;
};

type Launcher = {
  isAvailable: jest.Mock;
  launch: jest.Mock;
};

type WithControllerCallback<ReturnValue> = (payload: {
  controller: KycController;
  rootMessenger: RootMessenger;
  handlers: ServiceHandlers;
  launcher: Launcher;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof KycController>[0]>;
};

const SERVICE_ACTIONS = [
  'KycService:getGeoCountry',
  'KycService:fetchDisclaimers',
  'KycService:createSession',
  'KycService:checkKycRequired',
  'KycService:createVendorCustomer',
  'KycService:submitConsents',
  'KycService:fetchKycStatus',
  'KycService:getWrappingKey',
  'KycService:fetchJwks',
  'KycService:createUkycSession',
  'KycService:createJourney',
  'KycService:getSessionStatus',
  'UserStorageController:performGetStorage',
  'UserStorageController:performSetStorage',
] as const;

/**
 * Builds a UKYC session status payload with a given `finalStatus`.
 *
 * @param finalStatus - The overall session status.
 * @returns A complete session status object.
 */
function sessionStatus(finalStatus: string): {
  finalStatus: string;
  externalUserId: string;
  kycStatus: string;
  vendor: string;
  vendorStatus: string;
} {
  return {
    finalStatus,
    externalUserId: 'ext-1',
    kycStatus: finalStatus,
    vendor: 'sumsub',
    vendorStatus: finalStatus,
  };
}

/**
 * Wraps a test with a fully-wired controller, mocked service handlers, and a
 * mocked SumSub launcher.
 *
 * @param args - Either a callback, or an options bag and a callback.
 * @returns The callback's return value.
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
    captureException: jest.fn(),
  });
  const messenger: KycControllerMessenger = new Messenger({
    namespace: 'KycController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: SERVICE_ACTIONS,
    events: [],
    messenger,
  });

  const handlers: ServiceHandlers = {
    getGeoCountry: jest.fn().mockResolvedValue('USA'),
    fetchDisclaimers: jest.fn().mockResolvedValue([]),
    createSession: jest.fn().mockResolvedValue({ sessionToken: 'sess' }),
    checkKycRequired: jest.fn().mockResolvedValue({ kycRequired: false }),
    createVendorCustomer: jest.fn().mockResolvedValue({
      id: 'iron-1',
      email: 'a@b.co',
      status: 'SigningsRequired',
    }),
    submitConsents: jest.fn().mockResolvedValue(undefined),
    fetchKycStatus: jest.fn().mockResolvedValue({ status: 'pending' }),
    getWrappingKey: jest.fn().mockResolvedValue({
      id: 'wk',
      jwtChain: 'jwt.chain.sig',
      // Matches the `sessionServerPublicKeyX` returned by the mocked
      // `verifyJwtChain`, so the attestation check passes.
      sessionServerPublicKey: { kty: 'OKP', crv: 'X25519', x: 'spk-x' },
    }),
    fetchJwks: jest.fn().mockResolvedValue({ keys: [] }),
    createUkycSession: jest.fn().mockResolvedValue({
      sessionId: 'sid',
    }),
    createJourney: jest
      .fn()
      .mockResolvedValue({ status: 'ok', applicantAccessToken: 'aat' }),
    getSessionStatus: jest.fn().mockResolvedValue(sessionStatus('approved')),
    performGetStorage: jest.fn().mockResolvedValue(null),
    performSetStorage: jest.fn().mockResolvedValue(undefined),
  };
  rootMessenger.registerActionHandler(
    'KycService:getGeoCountry',
    handlers.getGeoCountry,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchDisclaimers',
    handlers.fetchDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:createSession',
    handlers.createSession,
  );
  rootMessenger.registerActionHandler(
    'KycService:checkKycRequired',
    handlers.checkKycRequired,
  );
  rootMessenger.registerActionHandler(
    'KycService:createVendorCustomer',
    handlers.createVendorCustomer,
  );
  rootMessenger.registerActionHandler(
    'KycService:submitConsents',
    handlers.submitConsents,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchKycStatus',
    handlers.fetchKycStatus,
  );
  rootMessenger.registerActionHandler(
    'KycService:getWrappingKey',
    handlers.getWrappingKey,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchJwks',
    handlers.fetchJwks,
  );
  rootMessenger.registerActionHandler(
    'KycService:createUkycSession',
    handlers.createUkycSession,
  );
  rootMessenger.registerActionHandler(
    'KycService:createJourney',
    handlers.createJourney,
  );
  rootMessenger.registerActionHandler(
    'KycService:getSessionStatus',
    handlers.getSessionStatus,
  );
  rootMessenger.registerActionHandler(
    'UserStorageController:performGetStorage',
    handlers.performGetStorage,
  );
  rootMessenger.registerActionHandler(
    'UserStorageController:performSetStorage',
    handlers.performSetStorage,
  );

  // Configure the mocked UKYC crypto for this test (reset before each test by
  // the shared jest config).
  mockVerifyJwtChain.mockReturnValue({
    sessionServerPublicKeyX: 'spk-x',
    nonce: 'n',
  });
  mockWrapEncryptionKey.mockReturnValue({
    encryptedKey: 'enc',
    nonce: 'nonce',
  });

  const launcher: Launcher = {
    isAvailable: jest.fn().mockReturnValue(true),
    launch: jest.fn().mockResolvedValue({ ok: true }),
  };

  const controller = new KycController({
    messenger,
    sumsubLauncher: launcher as unknown as KycSumSubLauncher,
    ...options,
  });

  return testFunction({ controller, rootMessenger, handlers, launcher });
}
