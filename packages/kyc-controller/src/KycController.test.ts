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

import { KycController } from './KycController';
import type { KycControllerMessenger } from './KycController';
import type { KycSumSubLauncher } from './types';

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
            state: { termsAcceptedAt: 't', acceptedDisclaimerIds: ['1'] },
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
          });

          expect(controller.state.acceptedDisclaimerIds).toStrictEqual(['1']);
          expect(controller.state.termsAcceptedAt).not.toBeNull();
          expect(controller.state.activeProduct).toBe('ramps');
          expect(controller.state.phase).toBe('check');
        },
      );
    });

    it('reverts to terms when session creation fails', async () => {
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
          handlers.createSession.mockRejectedValue(new Error('nope'));
          handlers.fetchDisclaimers.mockResolvedValue([]);

          await controller.acceptTermsAndStartSession();

          expect(controller.state.phase).toBe('terms');
          expect(controller.state.termsAcceptedAt).toBeNull();
          expect(controller.state.error).toMatch(/Session creation failed/u);
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
          await controller.acceptTermsAndStartSession();

          expect(controller.state.phase).toBe('error');
          expect(controller.state.error).toMatch(/Missing email/u);
        },
      );
    });

    it('fails when no disclaimers were accepted', async () => {
      await withController(async ({ controller }) => {
        await controller.acceptTermsAndStartSession({ email: 'a@b.co' });

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
      await withController(async ({ controller }) => {
        const result = await controller.handleFrameMessage({
          message: {
            kind: 'complete',
            meta: { channelId: 'ch_1' },
            payload: { customer: { id: 'cust-1' } },
          },
        });
        expect(result).toStrictEqual({});
        expect(controller.state.moonpayCustomerId).toBe('cust-1');
      });
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

    it('fails when credential decryption throws', async () => {
      await withController(
        { options: { state: { sessionToken: 'tok' } } },
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
          { options: { state: { sessionToken: 'tok' } } },
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
          { options: { state: { sessionToken: 'tok' } } },
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
          { options: { state: { sessionToken: 'tok' } } },
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
          { options: { state: { sessionToken: 'tok' } } },
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
        await withController(async ({ controller }) => {
          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_2' },
              payload: { status: 'termsAcceptanceRequired' },
            },
          });
          expect(controller.state.phase).toBe('terms');
        });
      });

      it('fails on an unexpected status', async () => {
        await withController(async ({ controller }) => {
          await controller.handleFrameMessage({
            message: {
              kind: 'complete',
              meta: { channelId: 'ch_2' },
              payload: { status: 'unavailable' },
            },
          });
          expect(controller.state.phase).toBe('error');
        });
      });
    });
  });

  describe('automatic post-authentication continuation', () => {
    it('stays at form and does not run the check when no product is set', async () => {
      await withController(
        { options: { state: { sessionToken: 'tok', geoCountry: 'USA' } } },
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
              sessionToken: 'tok',
              activeProduct: 'card',
              geoCountry: 'FRA',
            },
          },
        },
        async ({ controller, handlers, launcher }) => {
          handlers.checkKycRequired.mockResolvedValue({ kycRequired: true });
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

    it('does not launch verification when the auto-run check fails', async () => {
      await withController(
        {
          options: {
            state: {
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
        handlers.createUkycSession.mockResolvedValue({
          sessionId: 'sid',
          wrappingPublicKey: 'wpk',
          idosSessionId: 'idos',
        });
        handlers.submitWrappedKey.mockResolvedValue({
          status: 'ok',
          applicantAccessToken: 'aat',
        });
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
        // onTokenExpiration re-invokes the exchange.
        expect(handlers.submitWrappedKey).toHaveBeenCalledTimes(2);
      });
    });

    it('defaults locale and debug when no params are given', async () => {
      await withController(async ({ controller, launcher }) => {
        await controller.startSumSub();

        expect(launcher.launch).toHaveBeenCalledWith(
          expect.objectContaining({ locale: 'en', debug: false }),
        );
        expect(controller.state.sumsub.status).toBe('complete');
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
  createUkycSession: jest.Mock;
  submitWrappedKey: jest.Mock;
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
  'KycService:createUkycSession',
  'KycService:submitWrappedKey',
] as const;

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
    createUkycSession: jest.fn().mockResolvedValue({
      sessionId: 'sid',
      wrappingPublicKey: 'wpk',
      idosSessionId: 'idos',
    }),
    submitWrappedKey: jest
      .fn()
      .mockResolvedValue({ status: 'ok', applicantAccessToken: 'aat' }),
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
    'KycService:createUkycSession',
    handlers.createUkycSession,
  );
  rootMessenger.registerActionHandler(
    'KycService:submitWrappedKey',
    handlers.submitWrappedKey,
  );

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
