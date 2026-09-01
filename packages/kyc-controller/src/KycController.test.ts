import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { areUint8ArraysEqual, bytesToString } from '@metamask/utils';
import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

import { base64UrlToBytes, toBase64Url } from './encoding.js';
import {
  getDefaultKycControllerState,
  KycController,
} from './KycController.js';
import type { KycControllerMessenger } from './KycController.js';
import type {
  KycConsentRecord,
  KycDisclaimer,
  KycSessionDisclaimers,
  KycSumSubLauncher,
} from './types.js';
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

const MOCK_SESSION_DISCLAIMERS: KycSessionDisclaimers = {
  idOS: [
    {
      key: 'idos-tos',
      version: '1',
      title: 'idOS ToS',
      url: 'https://idos.example/tos',
      consented: false,
    },
  ],
  kycProvider: [
    {
      key: 'sumsub-tos',
      version: '1',
      title: 'SumSub ToS',
      url: 'https://sumsub.example/tos',
      consented: false,
    },
  ],
  credentialReusabilityConsentGiven: false,
};

const MOCK_IDOS_DISCLAIMERS_ACCEPTED: KycConsentRecord[] =
  MOCK_SESSION_DISCLAIMERS.idOS.map(({ key, version }) => ({ key, version }));

const MOCK_SUMSUB_DISCLAIMERS_ACCEPTED: KycConsentRecord[] =
  MOCK_SESSION_DISCLAIMERS.kycProvider.map(({ key, version }) => ({
    key,
    version,
  }));

const DEFAULT_VENDOR_DISCLAIMERS_ACCEPTED = {
  moonpay: null,
  iron: null,
};

const VENDOR_TERMS_MOONPAY = {
  vendorDisclaimersAccepted: {
    moonpay: { termsAcceptedAt: 't' },
    iron: null,
  },
};

const VENDOR_TERMS_MOONPAY_D1 = {
  vendorDisclaimersAccepted: {
    moonpay: { termsAcceptedAt: 't' },
    iron: null,
  },
};

const VENDOR_TERMS_IRON = {
  vendorDisclaimersAccepted: {
    moonpay: null,
    iron: { disclaimerIds: ['d1'] },
  },
};

const VENDOR_TERMS_IRON_D1 = {
  vendorDisclaimersAccepted: {
    moonpay: null,
    iron: { disclaimerIds: ['iron-d1'] },
  },
};

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
              ...VENDOR_TERMS_MOONPAY,
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.fetchVendorDisclaimers.mockResolvedValue([
            { id: '1', display_name: 'T', url: 'u' },
          ]);
          handlers.createSession.mockResolvedValue({ sessionToken: 'sess' });

          await controller.initialize({ email: 'a@b.co' });

          expect(controller.state.geoCountry).toBe('USA');
          expect(controller.state.moonpaySessionToken).toBe('sess');
          expect(controller.state.phase).toBe('check');
        },
      );
    });

    it('auto-creates a session without reloading disclaimers when they are already present', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_MOONPAY,
              email: 'a@b.co',
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.createSession.mockResolvedValue({ sessionToken: 'sess' });

          await controller.initialize();

          expect(handlers.fetchVendorDisclaimers).not.toHaveBeenCalled();
          expect(controller.state.moonpaySessionToken).toBe('sess');
          expect(controller.state.phase).toBe('check');
        },
      );
    });

    it('falls back to the terms phase and loads disclaimers when geo fails and no terms exist', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockRejectedValue(new Error('geo down'));

        await controller.initialize();

        expect(controller.state.phase).toBe('terms');
        expect(controller.state.vendorError).toMatch(/Failed to load/u);
      });
    });

    it('captures the active product for the automatic post-auth continuation', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockResolvedValue('USA');
        handlers.fetchVendorDisclaimers.mockResolvedValue([]);

        await controller.initialize({ product: 'card' });

        expect(controller.state.activeProduct).toBe('card');
      });
    });

    it('clears a stale active product when re-initialized without one', async () => {
      await withController(
        { options: { state: { activeProduct: 'card' } } },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

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
              moonpaySessionToken: 'live-session',
              ...VENDOR_TERMS_MOONPAY,
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
          expect(controller.state.moonpaySessionToken).toBe('live-session');
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
            state: { ...VENDOR_TERMS_MOONPAY },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.initialize();

          expect(controller.state.phase).toBe('terms');
        },
      );
    });

    it('does not auto-create a session when reset() lands during disclaimer loading', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_MOONPAY,
              email: 'a@b.co',
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          let release: (disclaimers: KycDisclaimer[]) => void = () => {
            // placeholder
          };
          handlers.fetchVendorDisclaimers.mockReturnValue(
            new Promise<KycDisclaimer[]>((resolve) => {
              release = resolve;
            }),
          );

          const pending = controller.initialize();
          while (handlers.fetchVendorDisclaimers.mock.calls.length === 0) {
            await Promise.resolve();
          }
          controller.reset();
          release([{ id: '1', display_name: 'T', url: 'u' }]);
          await pending;

          expect(handlers.createSession).not.toHaveBeenCalled();
          expect(controller.state.phase).toBe('idle');
        },
      );
    });

    it('requires reacceptance when Iron T&C2 flags were not persisted', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_IRON,
              email: 'a@b.co',
              providerDisclaimersAccepted: { sumsub: null },
              idosDisclaimersAccepted: null,
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');
          handlers.createVendorCustomer.mockResolvedValue({
            id: '1',
            email: 'a@b.co',
            status: 'SigningsRequired',
          });
          handlers.fetchVendorDisclaimers.mockResolvedValue([
            { id: 'd1', display_name: 'T', url: 'u' },
          ]);

          await controller.initialize({ vendor: 'iron' });

          expect(controller.state.vendorDisclaimersAccepted.iron).toBeNull();
          expect(controller.state.phase).toBe('terms');
        },
      );
    });
  });

  describe('loadDisclaimers', () => {
    it('loads disclaimers for a provided country', async () => {
      await withController(async ({ controller, handlers }) => {
        const disclaimers = [{ id: '1', display_name: 'T', url: 'u' }];
        handlers.fetchVendorDisclaimers.mockResolvedValue(disclaimers);

        await controller.loadDisclaimers({ country: 'USA' });

        expect(controller.state.vendorDisclaimers).toStrictEqual(disclaimers);
        expect(handlers.getGeoCountry).not.toHaveBeenCalled();
      });
    });

    it('caches the provided country override in geoCountry', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.fetchVendorDisclaimers.mockResolvedValue([]);

        await controller.loadDisclaimers({ country: 'USA' });

        expect(controller.state.geoCountry).toBe('USA');
      });
    });

    it('lets a later checkKycRequired reuse the overridden country without an override', async () => {
      await withController(
        { options: { state: { moonpayAccessToken: 'a' } } },
        async ({ controller, handlers }) => {
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);
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
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.loadDisclaimers();

          expect(handlers.getGeoCountry).not.toHaveBeenCalled();
          expect(handlers.fetchVendorDisclaimers).toHaveBeenCalledWith({
            vendor: 'moonpay',
            country: 'USA',
          });
        },
      );
    });

    it('resolves the country when neither param nor cache is available', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockResolvedValue('FRA');
        handlers.fetchVendorDisclaimers.mockResolvedValue([]);

        await controller.loadDisclaimers();

        expect(controller.state.geoCountry).toBe('FRA');
        expect(handlers.fetchVendorDisclaimers).toHaveBeenCalledWith({
          vendor: 'moonpay',
          country: 'FRA',
        });
      });
    });

    it('records an error when loading fails', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.fetchVendorDisclaimers.mockRejectedValue(new Error('boom'));

        await controller.loadDisclaimers({ country: 'USA' });

        expect(controller.state.vendorError).toMatch(/boom/u);
      });
    });
  });

  describe('acceptTermsAndStartSession', () => {
    it('captures terms and creates a session', async () => {
      await withController(
        {
          options: {
            state: {
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockResolvedValue({ sessionToken: 'sess' });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'ramps',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(
            controller.state.vendorDisclaimersAccepted.moonpay?.termsAcceptedAt,
          ).toBeDefined();
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toBeDefined();
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
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          // @ts-expect-error T&C2 flags are required
          await controller.acceptTermsAndStartSession();

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing T&C2 acceptance/u);
          expect(controller.state.vendorDisclaimersAccepted.moonpay).toBeNull();
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
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockResolvedValue({ sessionToken: 'sess' });

          await controller.acceptTermsAndStartSession({
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(
            controller.state.vendorDisclaimersAccepted.moonpay?.termsAcceptedAt,
          ).toBeDefined();
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toBeDefined();
          expect(
            controller.state.providerDisclaimersAccepted.sumsub,
          ).toStrictEqual(MOCK_SUMSUB_DISCLAIMERS_ACCEPTED);
          expect(controller.state.idosDisclaimersAccepted).toStrictEqual(
            MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          );
          expect(controller.state.phase).toBe('check');
          expect(handlers.submitVendorDisclaimers).not.toHaveBeenCalled();
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
              moonpaySessionToken: 'old-session',
              moonpayAccessToken: 'stale-access',
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.moonpayAccessToken).toBeNull();
          expect(controller.buildAuthFrameUrl()).toBeNull();
          expect(controller.state.moonpaySessionToken).toBe('new-session');
        },
      );
    });

    it('clears the old session token while a new session is being created', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              moonpaySessionToken: 'old-session',
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          // While the request is in flight (phase `session`) the stale token
          // must already be gone so no Check frame URL can be built for it.
          expect(controller.state.phase).toBe('session');
          expect(controller.state.moonpaySessionToken).toBeNull();
          expect(controller.buildCheckFrameUrl()).toBeNull();

          releaseSession({ sessionToken: 'new-session' });
          await pending;

          expect(controller.state.moonpaySessionToken).toBe('new-session');
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
              moonpaySessionToken: 'old-session',
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockRejectedValue(new Error('nope'));
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.vendorDisclaimersAccepted.moonpay).toBeNull();
          expect(controller.state.error).toMatch(/Session creation failed/u);
          // A failed creation must not leave the old session token behind, so
          // the Check frame cannot be built against an invalid session.
          expect(controller.state.moonpaySessionToken).toBeNull();
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
              moonpaySessionToken: 'old-session',
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          // Reset while the create request is in flight, then let it fail. The
          // superseded flow must not force the now-idle controller back to
          // `terms` or re-run disclaimer loading.
          controller.reset();
          rejectSession(new Error('nope'));
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.error).toBeNull();
          expect(handlers.fetchVendorDisclaimers).not.toHaveBeenCalled();
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
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createSession.mockRejectedValue(new Error('nope'));
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            product: 'ramps',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
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
            state: {
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller }) => {
          await controller.acceptTermsAndStartSession({
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
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
          providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
          idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
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
            state: { ...VENDOR_TERMS_MOONPAY },
          },
        },
        ({ controller }) => {
          controller.clearSavedTerms();
          expect(controller.state.vendorDisclaimersAccepted.moonpay).toBeNull();
          expect(controller.state.vendorDisclaimersAccepted).toStrictEqual(
            DEFAULT_VENDOR_DISCLAIMERS_ACCEPTED,
          );
        },
      );
    });
  });

  describe('acceptTermsAndStartSession (iron)', () => {
    it('persists Iron disclaimer ids for vendor disclaimer submission', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.submitVendorDisclaimers.mockRejectedValue(new Error('stop'));

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(handlers.submitVendorDisclaimers).toHaveBeenCalledWith({
            vendor: 'iron',
            disclaimerIds: ['d1'],
          });
        },
      );
    });

    it('clears Iron acceptance when session creation fails', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.submitVendorDisclaimers.mockRejectedValue(new Error('down'));

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.vendorDisclaimersAccepted.iron).toBeNull();
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
        { options: { state: { phase: 'done', moonpaySessionToken: 'tok' } } },
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
          expect(controller.state.moonpayAccessToken).toBeNull();
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
              moonpaySessionToken: 'tok',
            },
          },
        },
        async ({ controller }) => {
          const result = await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: {
                status: 'active',
                credentials: 'not-decryptable',
                customer: { id: 'cust-late' },
              },
            },
          });

          expect(result).toStrictEqual({});
          expect(controller.state.phase).toBe('check');
          expect(controller.state.moonpayAccessToken).toBeNull();
          expect(controller.state.moonpayCustomerId).toBeNull();
          expect(controller.getCustomerIdentity()).toBeNull();
        },
      );
    });

    it('fails when credential decryption throws', async () => {
      await withController(
        { options: { state: { phase: 'check', moonpaySessionToken: 'tok' } } },
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
          {
            options: { state: { phase: 'check', moonpaySessionToken: 'tok' } },
          },
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
            expect(controller.state.moonpayAccessToken).toBe('access-1');
          },
        );
      });

      it('moves to auth on connectionRequired and enables the auth frame URL', async () => {
        await withController(
          {
            options: { state: { phase: 'check', moonpaySessionToken: 'tok' } },
          },
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
                moonpaySessionToken: 'tok',
                ...VENDOR_TERMS_MOONPAY,
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
            expect(
              controller.state.vendorDisclaimersAccepted.moonpay,
            ).toBeNull();
          },
        );
      });

      it('fails on an unexpected status', async () => {
        await withController(
          {
            options: { state: { phase: 'check', moonpaySessionToken: 'tok' } },
          },
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
          { options: { state: { phase: 'auth', moonpaySessionToken: 'tok' } } },
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
            expect(controller.state.moonpayAccessToken).toBe('access-2');
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
            state: {
              phase: 'check',
              moonpaySessionToken: 'tok',
              geoCountry: 'USA',
            },
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
              moonpaySessionToken: 'tok',
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
              moonpaySessionToken: 'tok',
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
              moonpaySessionToken: 'tok',
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
              moonpaySessionToken: 'tok',
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
              moonpaySessionToken: 'tok',
              activeProduct: 'ramps',
              geoCountry: 'USA',
              // Persisted terms so a post-reset `initialize` auto-recreates the
              // session (reaching phase `check`) for the second completion.
              ...VENDOR_TERMS_MOONPAY,
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
          handlers.fetchVendorDisclaimers.mockResolvedValue([
            { id: '1', display_name: 'T', url: 'u' },
          ]);
          handlers.createSession.mockResolvedValue({ sessionToken: 'tok-2' });
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
              moonpaySessionToken: 'tok',
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
        { options: { state: { moonpaySessionToken: 'tok' } } },
        ({ controller }) => {
          const url = controller.buildCheckFrameUrl() as string;
          expect(url).toContain('sessionToken=tok');
          expect(url).toContain('channelId=ch_1');
          expect(url).toContain('skipKyc=true');
        },
      );
    });

    it('returns null for the check frame when the active vendor is not MoonPay', async () => {
      await withController(
        {
          options: {
            state: { moonpaySessionToken: 'tok', activeVendor: 'iron' },
          },
        },
        ({ controller }) => {
          expect(controller.buildCheckFrameUrl()).toBeNull();
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
        expect(controller.state.error).toMatch(/Missing moonpayAccessToken/u);
      });
    });

    it('fails without a country', async () => {
      await withController(
        { options: { state: { moonpayAccessToken: 'a' } } },
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
        { options: { state: { moonpayAccessToken: 'a', geoCountry: 'USA' } } },
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
        { options: { state: { moonpayAccessToken: 'a' } } },
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
        { options: { state: { moonpayAccessToken: 'a', geoCountry: 'USA' } } },
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
        { options: { state: { moonpayAccessToken: 'a', geoCountry: 'USA' } } },
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
        { options: { state: { moonpayAccessToken: 'a', geoCountry: 'USA' } } },
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
            state: {
              moonpayCustomerId: 'cust-1',
              activeVendor: 'moonpay',
              moonpaySessionToken: 'tok',
              moonpayAccessToken: 'access-1',
            },
          },
        },
        async ({ controller }) => {
          await controller.initialize({ vendor: 'iron' });

          expect(controller.state.moonpayCustomerId).toBeNull();
          expect(controller.state.moonpaySessionToken).toBeNull();
          expect(controller.state.moonpayAccessToken).toBeNull();
          expect(controller.buildCheckFrameUrl()).toBeNull();
          expect(controller.getCustomerIdentity()).toBeNull();
        },
      );
    });

    it('keeps a MoonPay id when initialize stays on MoonPay', async () => {
      await withController(
        {
          options: {
            state: {
              moonpayCustomerId: 'cust-1',
              activeVendor: 'moonpay',
              moonpaySessionToken: 'tok',
              moonpayAccessToken: 'access-1',
            },
          },
        },
        async ({ controller }) => {
          await controller.initialize({ vendor: 'moonpay' });

          expect(controller.state.moonpayCustomerId).toBe('cust-1');
          expect(controller.state.moonpaySessionToken).toBe('tok');
          expect(controller.state.moonpayAccessToken).toBe('access-1');
          expect(controller.buildCheckFrameUrl()).toContain('sessionToken=tok');
        },
      );
    });

    it('drops a MoonPay id when a non-MoonPay customer is created', async () => {
      await withController(
        {
          options: {
            state: {
              moonpayCustomerId: 'cust-1',
              activeVendor: 'moonpay',
              moonpaySessionToken: 'tok',
              moonpayAccessToken: 'access-1',
            },
          },
        },
        async ({ controller }) => {
          await controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });

          expect(controller.state.moonpayCustomerId).toBeNull();
          expect(controller.state.moonpaySessionToken).toBeNull();
          expect(controller.state.moonpayAccessToken).toBeNull();
          expect(controller.buildCheckFrameUrl()).toBeNull();
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
            state: {
              moonpayCustomerId: 'cust-1',
              activeVendor: 'moonpay',
              moonpaySessionToken: 'tok',
              moonpayAccessToken: 'access-1',
            },
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
          expect(controller.state.moonpaySessionToken).toBe('tok');
          expect(controller.state.moonpayAccessToken).toBe('access-1');
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
      await withController(
        { options: { state: { geoCountry: 'USA' } } },
        async ({ controller, handlers, launcher }) => {
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
          // Session creation returns encryption schemas; wrapping happens on
          // the client and both secrets are posted via authorizations.
          expect(handlers.createUkycSession).toHaveBeenCalledWith(
            expect.objectContaining({
              jwtToken: 'mock-jwt-token',
              sessionClientPublicKey:
                expect.stringMatching(/^[A-Za-z0-9_-]+$/u),
              residenceCountry: 'USA',
              vendorMetadata: expect.objectContaining({
                moonPayAccessToken: null,
                moonPayUserId: null,
              }),
            }),
          );
          expect(handlers.fetchIdosEnclaveJwks).toHaveBeenCalledTimes(1);
          expect(handlers.fetchIdosRelayJwks).toHaveBeenCalledTimes(1);
          expect(mockVerifyJwtChain).toHaveBeenCalledTimes(2);
          expect(mockVerifyJwtChain).toHaveBeenNthCalledWith(
            1,
            [],
            'jwt.chain.sig',
          );
          expect(mockVerifyJwtChain).toHaveBeenNthCalledWith(
            2,
            [],
            'jwt.chain.sig',
          );
          const { sessionClientPublicKey } = handlers.createUkycSession.mock
            .calls[0][0] as {
            sessionClientPublicKey: string;
          };
          const sessionClientPublicKeyBytes = base64UrlToBytes(
            sessionClientPublicKey,
          );
          expect(sessionClientPublicKeyBytes).toHaveLength(32);
          expect(
            areUint8ArraysEqual(
              x25519.getPublicKey(mockWrapEncryptionKey.mock.calls[0][0]),
              sessionClientPublicKeyBytes,
            ),
          ).toBe(true);
          expect(
            toBase64Url(
              x25519.getPublicKey(mockWrapEncryptionKey.mock.calls[1][0]),
            ),
          ).toBe(sessionClientPublicKey);
          expect(
            handlers.createUkycSession.mock.calls[0][0],
          ).not.toHaveProperty('wrappedEncryptionKey');
          expect(
            handlers.createUkycSession.mock.calls[0][0],
          ).not.toHaveProperty('ukycCapabilityToken');
          expect(mockWrapEncryptionKey).toHaveBeenCalledTimes(2);
          // First wrap is the 32-byte data_encryption_key; second is the
          // encoded capability token (longer than a raw key).
          expect(mockWrapEncryptionKey.mock.calls[0][1]).toBe('spk-x');
          expect(mockWrapEncryptionKey.mock.calls[0][2]).toHaveLength(32);
          expect(mockWrapEncryptionKey.mock.calls[1][1]).toBe('spk-x');
          expect(mockWrapEncryptionKey.mock.calls[1][2].length).toBeGreaterThan(
            32,
          );
          // The capability token is wrapped as the UTF-8 bytes of the same
          // compact header encoding previously sent as a plaintext field.
          expect(bytesToString(mockWrapEncryptionKey.mock.calls[1][2])).toMatch(
            /^[A-Za-z0-9\-_]+$/u,
          );
          expect(handlers.setAuthorizations).toHaveBeenCalledWith({
            sessionId: 'sid',
            wrappedEncryptionDataKey: { data: 'enc', nonce: 'nonce' },
            wrappedUkycCapabilityToken: { data: 'enc', nonce: 'nonce' },
          });
          // onTokenExpiration re-fetches the applicant access token.
          expect(handlers.createJourney).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('forwards the resolved geo country as residenceCountry', async () => {
      await withController(
        { options: { state: { geoCountry: 'FRA' } } },
        async ({ controller, handlers }) => {
          await controller.startSumSub();

          expect(handlers.createUkycSession).toHaveBeenCalledWith(
            expect.objectContaining({ residenceCountry: 'FRA' }),
          );
          expect(handlers.getGeoCountry).not.toHaveBeenCalled();
        },
      );
    });

    it('does not create a UKYC session when reset() runs while resolving residence country', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        let release: (country: string) => void = () => {
          // Replaced synchronously by the promise executor below.
        };
        handlers.getGeoCountry.mockReturnValue(
          new Promise((resolve) => {
            release = resolve;
          }),
        );

        const pending = controller.startSumSub();
        while (handlers.getGeoCountry.mock.calls.length === 0) {
          await Promise.resolve();
        }
        controller.reset();
        release('USA');
        const result = await pending;

        expect(result).toStrictEqual({});
        expect(handlers.createUkycSession).not.toHaveBeenCalled();
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(controller.state.sumsub.status).toBe('idle');
      });
    });

    it('stops with a vendorProcessing status when the relay approved but the vendor is still pending', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        // The applicant already finished the journey: the relay reports
        // `approved` while the vendor is still finalizing (`pending`).
        handlers.setAuthorizations.mockResolvedValue({
          ...sessionStatus('pending'),
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
        handlers.setAuthorizations.mockResolvedValue({
          ...sessionStatus('approved'),
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
          return ukycSessionResponse();
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({});
        expect(controller.state.sumsub.status).toBe('idle');
        expect(controller.state.sumsub.sessionId).toBeNull();
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(handlers.setAuthorizations).not.toHaveBeenCalled();
      });
    });

    it('does not submit authorizations when reset() runs while preparing wrapped secrets', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.fetchIdosEnclaveJwks.mockImplementation(async () => {
          controller.reset();
          return { keys: [] };
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({});
        expect(handlers.setAuthorizations).not.toHaveBeenCalled();
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(controller.state.sumsub.status).toBe('idle');
      });
    });

    it('does not submit authorizations when reset() runs while fetching idOS relay JWKS', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.fetchIdosRelayJwks.mockImplementation(async () => {
          controller.reset();
          return { keys: [] };
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({});
        expect(handlers.setAuthorizations).not.toHaveBeenCalled();
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(controller.state.sumsub.status).toBe('idle');
      });
    });

    it('does not write vendorProcessing state when reset() runs while setting authorizations', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.setAuthorizations.mockImplementation(async () => {
          controller.reset();
          return {
            ...sessionStatus('pending'),
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

    it('does not create a journey when reset() runs during a non-pending authorizations response', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.setAuthorizations.mockImplementation(async () => {
          controller.reset();
          return sessionStatus('approved');
        });

        const result = await controller.startSumSub();

        expect(result).toStrictEqual({});
        expect(handlers.createJourney).not.toHaveBeenCalled();
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(controller.state.sumsub.status).toBe('idle');
      });
    });

    it('verifies encryptionDataKey against idOS enclave JWKS and capability token against idOS relay JWKS', async () => {
      await withController(async ({ controller, handlers }) => {
        const idosEnclaveKeys = [
          { kty: 'OKP', crv: 'Ed25519', x: 'enclave', kid: 'f1' },
        ];
        const idosRelayKeys = [
          { kty: 'OKP', crv: 'Ed25519', x: 'relay', kid: 'r1' },
        ];
        handlers.fetchIdosEnclaveJwks.mockResolvedValue({
          keys: idosEnclaveKeys,
        });
        handlers.fetchIdosRelayJwks.mockResolvedValue({ keys: idosRelayKeys });
        handlers.createUkycSession.mockResolvedValue(
          ukycSessionResponse({
            encryptionDataKey: {
              serverPublicKey: {
                kty: 'OKP',
                crv: 'X25519',
                x: 'spk-x',
              },
              jwtChain: 'encryption.jwt.chain',
            },
            ukycCapabilityToken: {
              serverPublicKey: {
                kty: 'OKP',
                crv: 'X25519',
                x: 'spk-x',
              },
              jwtChain: 'capability.jwt.chain',
            },
          }),
        );

        await controller.startSumSub();

        expect(mockVerifyJwtChain).toHaveBeenNthCalledWith(
          1,
          idosEnclaveKeys,
          'encryption.jwt.chain',
        );
        expect(mockVerifyJwtChain).toHaveBeenNthCalledWith(
          2,
          idosRelayKeys,
          'capability.jwt.chain',
        );
      });
    });

    it('aborts when the attested session server public key does not match', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.createUkycSession.mockResolvedValue(
          ukycSessionResponse({
            encryptionDataKey: {
              serverPublicKey: {
                kty: 'OKP',
                crv: 'X25519',
                x: 'tampered',
              },
              jwtChain: 'jwt.chain.sig',
            },
          }),
        );

        const result = await controller.startSumSub();

        expect(result).toMatchObject({
          error: expect.stringContaining(
            'sessionServerPublicKey does not match',
          ),
        });
        expect(controller.state.sumsub.status).toBe('failed');
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(handlers.setAuthorizations).not.toHaveBeenCalled();
      });
    });

    it('aborts when the capability-token schema public key does not match', async () => {
      await withController(async ({ controller, handlers, launcher }) => {
        handlers.createUkycSession.mockResolvedValue(
          ukycSessionResponse({
            ukycCapabilityToken: {
              serverPublicKey: {
                kty: 'OKP',
                crv: 'X25519',
                x: 'tampered-token-key',
              },
              jwtChain: 'jwt.chain.sig',
            },
          }),
        );

        const result = await controller.startSumSub();

        expect(result).toMatchObject({
          error: expect.stringContaining(
            'sessionServerPublicKey does not match',
          ),
        });
        expect(controller.state.sumsub.status).toBe('failed');
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(handlers.setAuthorizations).not.toHaveBeenCalled();
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
          return ukycSessionResponse();
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
        handlers.createUkycSession.mockResolvedValue(
          ukycSessionResponse({ sessionId: '' }),
        );
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
              moonpaySessionToken: 'tok',
              moonpayAccessToken: 'a',
              activeProduct: 'ramps',
              ...VENDOR_TERMS_MOONPAY,
              kycRequiredByProduct: { ramps: true },
            },
          },
        },
        ({ controller }) => {
          controller.reset();
          expect(controller.state.phase).toBe('idle');
          expect(controller.state.moonpaySessionToken).toBeNull();
          expect(controller.state.moonpayAccessToken).toBeNull();
          expect(controller.state.activeProduct).toBeNull();
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay?.termsAcceptedAt,
          ).toBe('t');
          expect(controller.state.kycRequiredByProduct.ramps).toBe(true);
        },
      );
    });

    it('does not let a superseded flow drive the controller back out of idle', async () => {
      await withController(async ({ controller, handlers }) => {
        let release: (country: string) => void = () => {
          // Replaced synchronously by the promise executor below.
        };
        handlers.getGeoCountry.mockReturnValue(
          new Promise((resolve) => {
            release = resolve;
          }),
        );

        const pending = controller.initialize({ email: 'a@b.co' });
        controller.reset();
        release('USA');
        await pending;

        expect(controller.state.phase).toBe('idle');
        expect(handlers.fetchVendorDisclaimers).not.toHaveBeenCalled();
      });
    });
  });

  describe('clearState', () => {
    it('restores the default state from a fully populated state', async () => {
      await withController(
        {
          options: {
            state: {
              phase: 'form',
              statusMessage: 'Review to submit.',
              error: 'stale error',
              email: 'a@b.co',
              vendorDisclaimersAccepted: {
                moonpay: null,
                iron: { disclaimerIds: ['1'] },
              },
              providerDisclaimersAccepted: {
                sumsub: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
              },
              idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
              vendorDisclaimers: [{ id: '1', display_name: 'T', url: 'u' }],
              vendorError: 'stale disclaimers error',
              geoCountry: 'USA',
              moonpaySessionToken: 'tok',
              moonpayAccessToken: 'a',
              moonpayCustomerId: 'cus-1',
              activeVendor: 'iron',
              activeProduct: 'ramps',
              kycRequiredByProduct: { ramps: true },
              lastCheckedAt: 't',
              userStatus: 'completed',
              userStatusSumsubSessionId: 's1',
              userStatusErrorCode: 'code',
              sumsub: {
                status: 'complete',
                result: { ok: true },
                sessionId: 'sess-1',
                applicantAccessToken: 'aat',
                sessionStatus: sessionStatus('approved'),
              },
            },
          },
        },
        ({ controller }) => {
          controller.clearState();

          expect(controller.state).toStrictEqual(
            getDefaultKycControllerState(),
          );
        },
      );
    });

    it('leaves the state at its defaults when a flow was in flight', async () => {
      await withController(async ({ controller, handlers }) => {
        let release: (country: string) => void = () => {
          // Replaced synchronously by the promise executor below.
        };
        handlers.getGeoCountry.mockReturnValue(
          new Promise((resolve) => {
            release = resolve;
          }),
        );

        const pending = controller.initialize({ email: 'a@b.co' });
        controller.clearState();
        release('USA');
        await pending;

        expect(controller.state).toStrictEqual(getDefaultKycControllerState());
        // The superseded flow must not resume the terms step either.
        expect(handlers.fetchVendorDisclaimers).not.toHaveBeenCalled();
      });
    });

    it('drops the auth-frame client token', async () => {
      await withController(
        { options: { state: { phase: 'check', moonpaySessionToken: 'tok' } } },
        async ({ controller }) => {
          const envelope = envelopeFor(controller, {
            clientToken: 'client-1',
          });
          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_1' },
              payload: { status: 'connectionRequired', credentials: envelope },
            },
          });
          expect(controller.buildAuthFrameUrl()).toContain(
            'clientToken=client-1',
          );

          controller.clearState();

          expect(controller.buildAuthFrameUrl()).toBeNull();
        },
      );
    });

    it('stops session-status polling', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          { options: { sessionStatusPollIntervalMs: 1000 } },
          async ({ controller, handlers, launcher }) => {
            launcher.launch.mockImplementation(async ({ onStatusChange }) => {
              onStatusChange?.('InProgress', 'Completed');
              return { ok: true };
            });
            handlers.getSessionStatus.mockResolvedValue(
              sessionStatus('pending'),
            );

            await controller.startSumSub();
            expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);

            controller.clearState();
            await jest.advanceTimersByTimeAsync(5000);

            expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);
            expect(controller.state).toStrictEqual(
              getDefaultKycControllerState(),
            );
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('stops user-status polling', async () => {
      jest.useFakeTimers();
      try {
        await withController(
          { options: { userStatusPollIntervalMs: 1000 } },
          async ({ controller, handlers }) => {
            handlers.fetchKycStatus.mockResolvedValue({ status: 'pending' });

            await controller.refreshKycStatus();
            expect(handlers.fetchKycStatus).toHaveBeenCalledTimes(1);

            controller.clearState();
            await jest.advanceTimersByTimeAsync(5000);

            expect(handlers.fetchKycStatus).toHaveBeenCalledTimes(1);
            expect(controller.state).toStrictEqual(
              getDefaultKycControllerState(),
            );
          },
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('is callable via the messenger', async () => {
      await withController(
        { options: { state: { email: 'a@b.co' } } },
        ({ controller, rootMessenger }) => {
          rootMessenger.call('KycController:clearState');

          expect(controller.state.email).toBeNull();
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
        handlers.fetchVendorDisclaimers.mockResolvedValue([
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
        expect(handlers.fetchVendorDisclaimers).toHaveBeenCalledWith({
          vendor: 'iron',
          country: 'USA',
        });
        expect(handlers.createSession).not.toHaveBeenCalled();
        expect(controller.state.activeVendor).toBe('iron');
        expect(controller.state.activeProduct).toBe('money');
        expect(controller.state.phase).toBe('terms');
        expect(controller.state.vendorDisclaimers).toHaveLength(1);
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
              ...VENDOR_TERMS_MOONPAY_D1,
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createVendorCustomer.mockRejectedValue(
            new Error('iron down'),
          );

          await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

          expect(controller.state.phase).toBe('error');
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay?.termsAcceptedAt,
          ).toBe('t');
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toBeDefined();
        },
      );
    });

    it('preserves MoonPay terms when reset lands during Iron customer creation', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_MOONPAY_D1,
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createVendorCustomer.mockImplementation(async () => {
            controller.reset();
            throw new Error('late');
          });

          await controller.initialize({
            email: 'a@b.co',
            vendor: 'iron',
          });

          expect(controller.state.phase).toBe('idle');
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay?.termsAcceptedAt,
          ).toBe('t');
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toBeDefined();
        },
      );
    });

    it('does not fail initialize when reset lands during Iron customer creation', async () => {
      await withController(async ({ controller, handlers }) => {
        // Simulate a reset() landing while customer creation is in flight.
        handlers.createVendorCustomer.mockImplementation(async () => {
          controller.reset();
          return { id: '1', email: 'a@b.co', status: 'SigningsRequired' };
        });

        await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

        expect(controller.state.phase).toBe('idle');
        expect(controller.state.error).toBeNull();
      });
    });

    it('does not fail initialize when Iron customer creation rejects after reset', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.createVendorCustomer.mockImplementation(async () => {
          controller.reset();
          throw new Error('late');
        });

        await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

        expect(controller.state.phase).toBe('idle');
        expect(controller.state.error).toBeNull();
      });
    });

    it('resumes an Iron session when terms and email are already present', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_IRON,
              providerDisclaimersAccepted: {
                sumsub: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
              },
              idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
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

          expect(handlers.fetchSessionDisclaimers).toHaveBeenCalled();
          expect(handlers.submitVendorDisclaimers).toHaveBeenCalledWith({
            vendor: 'iron',
            disclaimerIds: ['d1'],
          });
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
              ...VENDOR_TERMS_MOONPAY_D1,
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.fetchVendorDisclaimers.mockResolvedValue([
            { id: 'iron-d1', display_name: 'T', url: 'u' },
          ]);

          await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toStrictEqual(
            VENDOR_TERMS_MOONPAY_D1.vendorDisclaimersAccepted.moonpay,
          );
          expect(controller.state.vendorDisclaimersAccepted.iron).toBeNull();
          expect(handlers.fetchVendorDisclaimers).toHaveBeenCalledWith({
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
              ...VENDOR_TERMS_IRON,
              // T&C2 flags are null, simulating pre-migration state
              providerDisclaimersAccepted: { sumsub: null },
              idosDisclaimersAccepted: null,
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.fetchVendorDisclaimers.mockResolvedValue([
            { id: 'd1', display_name: 'T', url: 'u' },
          ]);

          await controller.initialize({ email: 'a@b.co', vendor: 'iron' });

          // T&C2 flags were null; reacceptance required.
          expect(controller.state.phase).toBe('terms');
          expect(controller.state.vendorDisclaimersAccepted.iron).toBeNull();
          expect(
            controller.state.providerDisclaimersAccepted.sumsub,
          ).toBeNull();
          expect(controller.state.idosDisclaimersAccepted).toBeNull();
        },
      );
    });

    it('does not reuse consents-path terms acceptance for MoonPay', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_IRON_D1,
            },
          },
        },
        async ({ controller, handlers }) => {
          await controller.initialize({ email: 'a@b.co', vendor: 'moonpay' });

          expect(handlers.createSession).not.toHaveBeenCalled();
          expect(controller.state.vendorDisclaimersAccepted.iron).toStrictEqual(
            VENDOR_TERMS_IRON_D1.vendorDisclaimersAccepted.iron,
          );
          expect(controller.state.vendorDisclaimersAccepted.moonpay).toBeNull();
          expect(controller.state.phase).toBe('terms');
        },
      );
    });

    it('preserves another vendor disclaimer acceptance when createVendorCustomer switches vendor', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_MOONPAY_D1,
            },
          },
        },
        async ({ controller }) => {
          await controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });

          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toStrictEqual(
            VENDOR_TERMS_MOONPAY_D1.vendorDisclaimersAccepted.moonpay,
          );
          expect(controller.state.vendorDisclaimersAccepted.iron).toBeNull();
        },
      );
    });

    it('keeps terms acceptance when createVendorCustomer stays on the same vendor', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              ...VENDOR_TERMS_IRON_D1,
            },
          },
        },
        async ({ controller }) => {
          await controller.createVendorCustomer({
            vendor: 'iron',
            email: 'a@b.co',
          });

          expect(
            controller.state.vendorDisclaimersAccepted.iron?.disclaimerIds,
          ).toStrictEqual(['iron-d1']);
          expect(controller.state.vendorDisclaimersAccepted.iron).toBeDefined();
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
                moonpaySessionToken: 'tok',
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.vendorDisclaimersAccepted.iron).toBeDefined();
          expect(
            controller.state.providerDisclaimersAccepted.sumsub,
          ).toStrictEqual(MOCK_SUMSUB_DISCLAIMERS_ACCEPTED);
          expect(controller.state.idosDisclaimersAccepted).toStrictEqual(
            MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          );
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
              ...VENDOR_TERMS_MOONPAY_D1,
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
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay?.termsAcceptedAt,
          ).toBe('t');
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toBeDefined();
        },
      );
    });

    it('preserves MoonPay terms when reset lands during createVendorCustomer', async () => {
      await withController(
        {
          options: {
            state: {
              ...VENDOR_TERMS_MOONPAY_D1,
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
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay?.termsAcceptedAt,
          ).toBe('t');
          expect(
            controller.state.vendorDisclaimersAccepted.moonpay,
          ).toBeDefined();
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.fetchSessionDisclaimers.mockResolvedValue(
            MOCK_SESSION_DISCLAIMERS,
          );
          handlers.submitSessionDisclaimers.mockResolvedValue({
            ...MOCK_SESSION_DISCLAIMERS,
            credentialReusabilityConsentGiven: true,
            idOS: MOCK_SESSION_DISCLAIMERS.idOS.map((doc) => ({
              ...doc,
              consented: true,
            })),
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map((doc) => ({
              ...doc,
              consented: true,
            })),
          });
          handlers.fetchKycStatus.mockResolvedValue({ status: 'pending' });
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(handlers.createSession).not.toHaveBeenCalled();
          expect(handlers.submitVendorDisclaimers).toHaveBeenCalledWith({
            vendor: 'iron',
            disclaimerIds: ['d1'],
          });
          expect(handlers.fetchSessionDisclaimers).toHaveBeenCalledWith({
            sessionId: 'sid',
          });
          expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith({
            sessionId: 'sid',
            idOS: [{ key: 'idos-tos', version: '1' }],
            kycProvider: [{ key: 'sumsub-tos', version: '1' }],
            credentialReusabilityConsentGiven: false,
          });
          expect(handlers.createUkycSession).toHaveBeenCalledTimes(1);
          expect(
            handlers.submitVendorDisclaimers.mock.invocationCallOrder[0],
          ).toBeLessThan(
            handlers.createUkycSession.mock.invocationCallOrder[0],
          );
          expect(
            handlers.createUkycSession.mock.invocationCallOrder[0],
          ).toBeLessThan(
            handlers.fetchSessionDisclaimers.mock.invocationCallOrder[0],
          );
          expect(handlers.createUkycSession).toHaveBeenCalledWith(
            expect.objectContaining({
              vendor: 'iron',
              residenceCountry: 'USA',
            }),
          );
          expect(launcher.launch).toHaveBeenCalled();
          expect(controller.buildCheckFrameUrl()).toBeNull();
          expect(controller.buildAuthFrameUrl()).toBeNull();
          expect(controller.state.userStatus).toBe('pending');
          expect(controller.state.phase).toBe('done');
          expect(controller.state.sumsub.status).toBe('complete');
          expect(controller.state.sessionDisclaimers?.idOS[0]?.consented).toBe(
            true,
          );
          controller.reset();
        },
      );
    });

    it('forwards credential reusability consent onto session disclaimers', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
            credentialReusabilityConsentGiven: true,
          });

          expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith({
            sessionId: 'sid',
            idOS: [{ key: 'idos-tos', version: '1' }],
            kycProvider: [{ key: 'sumsub-tos', version: '1' }],
            credentialReusabilityConsentGiven: true,
          });
          expect(controller.state.credentialReusabilityConsentGiven).toBe(true);
          controller.reset();
        },
      );
    });

    it('treats a 409 conflict as already-recorded consents', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          const consentedCatalog = {
            ...MOCK_SESSION_DISCLAIMERS,
            credentialReusabilityConsentGiven: false,
            idOS: MOCK_SESSION_DISCLAIMERS.idOS.map((doc) => ({
              ...doc,
              consented: true,
            })),
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map((doc) => ({
              ...doc,
              consented: true,
            })),
          };
          handlers.fetchSessionDisclaimers
            .mockResolvedValueOnce(MOCK_SESSION_DISCLAIMERS)
            .mockResolvedValueOnce(consentedCatalog);
          handlers.submitSessionDisclaimers.mockRejectedValue(
            new HttpError(
              409,
              "Fetching 'disclaimers' failed with status '409'",
            ),
          );
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(handlers.fetchSessionDisclaimers).toHaveBeenCalledTimes(2);
          expect(controller.state.phase).toBe('done');
          expect(launcher.launch).toHaveBeenCalled();
          controller.reset();
        },
      );
    });

    it('treats a 409 as recorded when declined idOS documents stay unconsented', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          const afterConflict = {
            ...MOCK_SESSION_DISCLAIMERS,
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map((doc) => ({
              ...doc,
              consented: true,
            })),
          };
          handlers.fetchSessionDisclaimers
            .mockResolvedValueOnce(MOCK_SESSION_DISCLAIMERS)
            .mockResolvedValueOnce(afterConflict);
          handlers.submitSessionDisclaimers.mockRejectedValue(
            new HttpError(
              409,
              "Fetching 'disclaimers' failed with status '409'",
            ),
          );
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: [],
          });

          expect(controller.state.phase).toBe('done');
          expect(launcher.launch).toHaveBeenCalled();
          controller.reset();
        },
      );
    });

    it('fails closed when a 409 leaves credential reuse unconsented', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          const consentedDocs = {
            idOS: MOCK_SESSION_DISCLAIMERS.idOS.map((doc) => ({
              ...doc,
              consented: true,
            })),
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map((doc) => ({
              ...doc,
              consented: true,
            })),
            credentialReusabilityConsentGiven: false,
          };
          handlers.fetchSessionDisclaimers.mockResolvedValue(consentedDocs);
          handlers.submitSessionDisclaimers.mockRejectedValue(
            new HttpError(
              409,
              "Fetching 'disclaimers' failed with status '409'",
            ),
          );
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
            credentialReusabilityConsentGiven: true,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(/Consents session failed/u);
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('fails closed when a 409 leaves accepted documents unconsented', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.fetchSessionDisclaimers.mockResolvedValue(
            MOCK_SESSION_DISCLAIMERS,
          );
          handlers.submitSessionDisclaimers.mockRejectedValue(
            new HttpError(
              409,
              "Fetching 'disclaimers' failed with status '409'",
            ),
          );
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(/Consents session failed/u);
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('omits already-consented catalog documents from the POST body', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.fetchSessionDisclaimers.mockResolvedValue({
            idOS: [
              {
                key: 'idos-tos',
                version: '1',
                title: 'idOS ToS',
                url: 'https://idos.example/tos',
                consented: true,
              },
              {
                key: 'idos-privacy',
                version: '2',
                title: 'idOS Privacy',
                url: 'https://idos.example/privacy',
                consented: false,
              },
            ],
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider,
            credentialReusabilityConsentGiven: false,
          });
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: [
              { key: 'idos-tos', version: '1' },
              { key: 'idos-privacy', version: '2' },
            ],
          });

          expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith({
            sessionId: 'sid',
            idOS: [{ key: 'idos-privacy', version: '2' }],
            kycProvider: [{ key: 'sumsub-tos', version: '1' }],
            credentialReusabilityConsentGiven: false,
          });
          controller.reset();
        },
      );
    });

    it('skips posting session disclaimers when the catalog is already consented', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.fetchSessionDisclaimers.mockResolvedValue({
            ...MOCK_SESSION_DISCLAIMERS,
            idOS: MOCK_SESSION_DISCLAIMERS.idOS.map((doc) => ({
              ...doc,
              consented: true,
            })),
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map((doc) => ({
              ...doc,
              consented: true,
            })),
          });
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
          expect(launcher.launch).toHaveBeenCalled();
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller }) => {
          // @ts-expect-error T&C2 flags are required
          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing T&C2 acceptance/u);
          expect(controller.state.vendorDisclaimersAccepted).toStrictEqual(
            DEFAULT_VENDOR_DISCLAIMERS_ACCEPTED,
          );
        },
      );
    });

    it('fails the consents path when only one T&C2 flag is provided', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          // @ts-expect-error both T&C2 flags are required
          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing T&C2 acceptance/u);
          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
        },
      );
    });

    it('does not post session disclaimers when T&C2 is declined', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: [],
            idosDisclaimersAccepted: [],
          });

          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
          expect(
            controller.state.providerDisclaimersAccepted.sumsub,
          ).toStrictEqual([]);
          expect(controller.state.idosDisclaimersAccepted).toStrictEqual([]);
          expect(handlers.submitVendorDisclaimers).toHaveBeenCalledWith({
            vendor: 'iron',
            disclaimerIds: ['d1'],
          });
          expect(launcher.launch).toHaveBeenCalled();
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller }) => {
          await controller.acceptTermsAndStartSession({
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
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
              vendorDisclaimers: [],
            },
          },
        },
        async ({ controller }) => {
          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createUkycSession.mockRejectedValue(
            new Error('sumsub down'),
          );
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.vendorDisclaimersAccepted.iron).toBeNull();
          expect(controller.state.error).toMatch(/Consents session failed/u);
        },
      );
    });

    it('returns to terms when the SumSub journey fails after consents', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createJourney.mockRejectedValue(new Error('journey down'));
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(/journey down/u);
        },
      );
    });

    it('returns to terms when SumSub closes without completion during the Iron session', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            // Applicant abandons: launch resolves without a Completed status.
            onStatusChange?.('idle', 'InProgress');
            return { ok: false };
          });
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.sumsub.status).toBe('idle');
          expect(controller.state.sumsub.sessionId).toBeNull();
          expect(controller.state.vendorDisclaimersAccepted.iron).toBeNull();
          expect(controller.state.error).toMatch(/Consents session failed/u);
          expect(handlers.fetchKycStatus).not.toHaveBeenCalled();
        },
      );
    });

    it('finishes as done when UKYC rejects after SumSub completed', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          launcher.launch.mockImplementation(async ({ onStatusChange }) => {
            onStatusChange?.('InProgress', 'Completed');
            return { ok: true };
          });
          handlers.getSessionStatus.mockResolvedValue(
            sessionStatus('rejected'),
          );
          handlers.fetchKycStatus.mockResolvedValue({
            status: 'terminal-failure',
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('done');
          expect(controller.state.sumsub.status).toBe('failed');
          expect(controller.state.sumsub.sessionStatus).toStrictEqual(
            sessionStatus('rejected'),
          );
          expect(
            controller.state.vendorDisclaimersAccepted.iron?.disclaimerIds,
          ).toStrictEqual(['d1']);
          expect(controller.state.error).toBeNull();
          expect(handlers.fetchKycStatus).toHaveBeenCalled();
          expect(controller.state.userStatus).toBe('terminal-failure');
          controller.reset();
        },
      );
    });

    it('keeps done when status refresh fails after a successful SumSub', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          let release: () => void = () => {
            // placeholder
          };
          handlers.fetchSessionDisclaimers.mockReturnValue(
            new Promise<KycSessionDisclaimers>((resolve) => {
              release = (): void => {
                resolve(MOCK_SESSION_DISCLAIMERS);
              };
            }),
          );

          const pending = controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });
          controller.reset();
          release();
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores SumSub completion after reset during the Iron session', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });
          // Session create + session disclaimers run first; wait until launch
          // is pending so reset races with an in-flight SDK presentation.
          while (launcher.launch.mock.calls.length === 0) {
            await Promise.resolve();
          }
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          let release: (error: Error) => void = () => {
            // placeholder
          };
          handlers.createUkycSession.mockReturnValue(
            new Promise((_resolve, reject) => {
              release = reject;
            }),
          );

          const pending = controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });
          while (handlers.createUkycSession.mock.calls.length === 0) {
            await Promise.resolve();
          }
          controller.reset();
          release(new Error('late consent failure'));
          await pending;

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.error).toBeNull();
        },
      );
    });

    it('skips SumSub when the consents-path session is already vendor-processing', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.setAuthorizations.mockResolvedValue({
            ...sessionStatus('pending'),
            kycStatus: 'approved',
            finalStatus: 'pending',
          });
          handlers.fetchKycStatus.mockRejectedValue(new Error('status down'));

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            product: 'money',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(handlers.fetchSessionDisclaimers).toHaveBeenCalledWith({
            sessionId: 'sid',
          });
          expect(launcher.launch).not.toHaveBeenCalled();
          expect(controller.state.sumsub.status).toBe('vendorProcessing');
          expect(controller.state.phase).toBe('done');
          controller.reset();
        },
      );
    });

    it('ignores a 409 re-fetch that settles after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.fetchSessionDisclaimers
            .mockResolvedValueOnce(MOCK_SESSION_DISCLAIMERS)
            .mockImplementationOnce(async () => {
              controller.reset();
              return MOCK_SESSION_DISCLAIMERS;
            });
          handlers.submitSessionDisclaimers.mockRejectedValue(
            new HttpError(
              409,
              "Fetching 'disclaimers' failed with status '409'",
            ),
          );

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.sessionDisclaimers).toBeNull();
        },
      );
    });

    it('ignores a session-disclaimer fetch that settles after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.fetchSessionDisclaimers.mockImplementation(async () => {
            controller.reset();
            return MOCK_SESSION_DISCLAIMERS;
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('idle');
          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
        },
      );
    });

    it('returns to terms when recording vendor disclaimers fails', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.submitVendorDisclaimers.mockRejectedValue(
            new Error('iron signings down'),
          );
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(/iron signings down/u);
          expect(handlers.createUkycSession).not.toHaveBeenCalled();
          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
          expect(controller.state.sumsub.sessionId).toBeNull();
        },
      );
    });

    it('ignores vendor disclaimer recording that settles after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.submitVendorDisclaimers.mockImplementation(async () => {
            controller.reset();
            return [{ id: 'sign-1', customer_id: 'cust-1', content_id: 'd1' }];
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('idle');
          expect(handlers.createUkycSession).not.toHaveBeenCalled();
        },
      );
    });

    it('returns to terms when recording session disclaimers fails', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.submitSessionDisclaimers.mockRejectedValue(
            new HttpError(
              500,
              "Fetching 'disclaimers' failed with status '500'",
            ),
          );
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(/Consents session failed/u);
          expect(controller.state.sessionDisclaimers).toBeNull();
          expect(controller.state.sumsub.sessionId).toBeNull();
          expect(controller.state.sumsub.status).toBe('idle');
        },
      );
    });

    it('fails closed when an accepted catalog category is empty', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.fetchSessionDisclaimers.mockResolvedValue({
            idOS: [],
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider,
            credentialReusabilityConsentGiven: false,
          });
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(
            /missing documents for an accepted category/u,
          );
          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
          expect(controller.state.sumsub.sessionId).toBeNull();
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('fails closed when an accepted KYC-provider catalog is empty', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.fetchSessionDisclaimers.mockResolvedValue({
            idOS: MOCK_SESSION_DISCLAIMERS.idOS,
            kycProvider: [],
            credentialReusabilityConsentGiven: false,
          });
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(
            /missing documents for an accepted category/u,
          );
          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('fails closed when a 409 re-GET returns an empty accepted category', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.fetchSessionDisclaimers
            .mockResolvedValueOnce(MOCK_SESSION_DISCLAIMERS)
            .mockResolvedValueOnce({
              idOS: [],
              kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map((doc) => ({
                ...doc,
                consented: true,
              })),
              credentialReusabilityConsentGiven: false,
            });
          handlers.submitSessionDisclaimers.mockRejectedValue(
            new HttpError(
              409,
              "Fetching 'disclaimers' failed with status '409'",
            ),
          );
          handlers.fetchVendorDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.error).toMatch(/Consents session failed/u);
          expect(controller.state.sumsub.sessionId).toBeNull();
          expect(launcher.launch).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores recorded session disclaimers that settle after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.submitSessionDisclaimers.mockImplementation(async () => {
            controller.reset();
            return MOCK_SESSION_DISCLAIMERS;
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('idle');
          expect(handlers.createJourney).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores UKYC session creation that settles after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createUkycSession.mockImplementation(async () => {
            controller.reset();
            return { sessionId: 'sid' };
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('idle');
          expect(handlers.submitSessionDisclaimers).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores already-completed session creation after reset', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.createUkycSession.mockImplementation(async () => {
            controller.reset();
            throw new Error('session_not_in_valid_state');
          });

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('idle');
          expect(controller.state.userStatus).toBeNull();
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
            state: { activeVendor: 'iron', phase: 'submit', geoCountry: 'USA' },
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
            state: { activeVendor: 'iron', phase: 'submit', geoCountry: 'USA' },
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
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
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
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('done');
          expect(controller.state.userStatus).toBe('completed');
          controller.reset();
        },
      );
    });

    it('keeps phase done when the journey reports already completed after consents', async () => {
      await withController(
        {
          options: {
            state: {
              activeVendor: 'iron',
              vendorDisclaimers: [{ id: 'd1', display_name: 'T', url: 'u' }],
            },
            userStatusPollIntervalMs: 60_000,
          },
        },
        async ({ controller, handlers }) => {
          handlers.createJourney.mockRejectedValue(
            new Error('session_not_in_valid_state'),
          );

          await controller.acceptTermsAndStartSession({
            email: 'a@b.co',
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          });

          expect(controller.state.phase).toBe('done');
          expect(controller.state.sumsub.result).toStrictEqual({
            alreadyCompleted: true,
          });
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
  fetchVendorDisclaimers: jest.Mock;
  createSession: jest.Mock;
  checkKycRequired: jest.Mock;
  createVendorCustomer: jest.Mock;
  submitVendorDisclaimers: jest.Mock;
  fetchSessionDisclaimers: jest.Mock;
  submitSessionDisclaimers: jest.Mock;
  fetchKycStatus: jest.Mock;
  fetchIdosEnclaveJwks: jest.Mock;
  fetchIdosRelayJwks: jest.Mock;
  createUkycSession: jest.Mock;
  setAuthorizations: jest.Mock;
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
  'KycService:fetchVendorDisclaimers',
  'KycService:createSession',
  'KycService:checkKycRequired',
  'KycService:createVendorCustomer',
  'KycService:submitVendorDisclaimers',
  'KycService:fetchSessionDisclaimers',
  'KycService:submitSessionDisclaimers',
  'KycService:fetchKycStatus',
  'KycService:fetchIdosEnclaveJwks',
  'KycService:fetchIdosRelayJwks',
  'KycService:createUkycSession',
  'KycService:setAuthorizations',
  'KycService:createJourney',
  'KycService:getSessionStatus',
  'UserStorageController:performGetStorage',
  'UserStorageController:performSetStorage',
] as const;

const ENCRYPTION_SCHEMA = {
  serverPublicKey: { kty: 'OKP', crv: 'X25519', x: 'spk-x' },
  jwtChain: 'jwt.chain.sig',
};

/**
 * Builds a UKYC session-creation payload with encryption schemas.
 *
 * @param overrides - Fields to overlay on the default session response.
 * @returns A complete session-creation response.
 */
function ukycSessionResponse(
  overrides: Partial<{
    sessionId: string;
    encryptionDataKey: typeof ENCRYPTION_SCHEMA;
    ukycCapabilityToken: typeof ENCRYPTION_SCHEMA;
  }> = {},
): {
  sessionId: string;
  encryptionDataKey: typeof ENCRYPTION_SCHEMA;
  ukycCapabilityToken: typeof ENCRYPTION_SCHEMA;
} {
  return {
    sessionId: 'sid',
    encryptionDataKey: ENCRYPTION_SCHEMA,
    ukycCapabilityToken: ENCRYPTION_SCHEMA,
    ...overrides,
  };
}

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
    fetchVendorDisclaimers: jest.fn().mockResolvedValue([]),
    createSession: jest.fn().mockResolvedValue({ sessionToken: 'sess' }),
    checkKycRequired: jest.fn().mockResolvedValue({ kycRequired: false }),
    createVendorCustomer: jest.fn().mockResolvedValue({
      id: 'iron-1',
      email: 'a@b.co',
      status: 'SigningsRequired',
    }),
    submitVendorDisclaimers: jest
      .fn()
      .mockResolvedValue([
        { id: 'sign-1', customer_id: 'cust-1', content_id: 'd1' },
      ]),
    fetchSessionDisclaimers: jest
      .fn()
      .mockResolvedValue(MOCK_SESSION_DISCLAIMERS),
    submitSessionDisclaimers: jest.fn().mockResolvedValue({
      ...MOCK_SESSION_DISCLAIMERS,
      credentialReusabilityConsentGiven: true,
      idOS: MOCK_SESSION_DISCLAIMERS.idOS.map((doc) => ({
        ...doc,
        consented: true,
      })),
      kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map((doc) => ({
        ...doc,
        consented: true,
      })),
    }),
    fetchKycStatus: jest.fn().mockResolvedValue({ status: 'pending' }),
    fetchIdosEnclaveJwks: jest.fn().mockResolvedValue({ keys: [] }),
    fetchIdosRelayJwks: jest.fn().mockResolvedValue({ keys: [] }),
    createUkycSession: jest.fn().mockResolvedValue(ukycSessionResponse()),
    setAuthorizations: jest.fn().mockResolvedValue(sessionStatus('approved')),
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
    'KycService:fetchVendorDisclaimers',
    handlers.fetchVendorDisclaimers,
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
    'KycService:submitVendorDisclaimers',
    handlers.submitVendorDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchSessionDisclaimers',
    handlers.fetchSessionDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:submitSessionDisclaimers',
    handlers.submitSessionDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchKycStatus',
    handlers.fetchKycStatus,
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
    'KycService:createUkycSession',
    handlers.createUkycSession,
  );
  rootMessenger.registerActionHandler(
    'KycService:setAuthorizations',
    handlers.setAuthorizations,
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
    data: 'enc',
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
