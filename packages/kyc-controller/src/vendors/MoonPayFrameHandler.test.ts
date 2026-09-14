import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

import type { KycPhase, KycVendor } from '../types.js';
import {
  clearMoonPaySession,
  MoonPayFrameHandler,
} from './MoonPayFrameHandler.js';
import type { MoonPayFrameHandlerOptions } from './MoonPayFrameHandler.js';

type FrameState = {
  activeVendor: KycVendor;
  moonpayAccessToken: string | null;
  moonpayCustomerId: string | null;
  moonpaySessionToken: string | null;
  phase: KycPhase;
  statusMessage: string;
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
 * Builds a decryptable credentials envelope for the handler's Check-frame key.
 *
 * @param handler - Handler that already has a frame keypair and session.
 * @param credentials - The plaintext credentials to encrypt.
 * @returns The encrypted envelope.
 */
function envelopeFor(
  handler: MoonPayFrameHandler,
  credentials: Record<string, unknown>,
): { ephemeralPublicKey: string; iv: string; ciphertext: string } {
  const url = handler.buildCheckFrameUrl();
  if (!url) {
    throw new Error('Could not build Check frame URL for envelope');
  }
  const publicKeyHex = new URL(url).searchParams.get('publicKey') as string;
  return makeEnvelope(hexToBytes(publicKeyHex), credentials);
}

function createHandler(stateOverrides: Partial<FrameState> = {}): {
  handler: MoonPayFrameHandler;
  state: FrameState;
  fail: jest.MockedFunction<MoonPayFrameHandlerOptions['fail']>;
  onAuthenticated: jest.MockedFunction<
    MoonPayFrameHandlerOptions['onAuthenticated']
  >;
  requireTermsReacceptance: jest.MockedFunction<
    MoonPayFrameHandlerOptions['requireTermsReacceptance']
  >;
} {
  const state: FrameState = {
    activeVendor: 'moonpay',
    moonpayAccessToken: null,
    moonpayCustomerId: null,
    moonpaySessionToken: 'tok',
    phase: 'check',
    statusMessage: '',
    ...stateOverrides,
  };
  const fail = jest.fn();
  const onAuthenticated = jest.fn().mockResolvedValue(undefined);
  const requireTermsReacceptance = jest.fn();
  const handler = new MoonPayFrameHandler({
    getState: (): FrameState => state,
    update: (updater): void => {
      updater(state);
    },
    fail,
    onAuthenticated,
    requireTermsReacceptance,
  });
  return { handler, state, fail, onAuthenticated, requireTermsReacceptance };
}

describe('MoonPayFrameHandler', () => {
  describe('startFlow / ensureKeypair / clear', () => {
    it('creates a keypair that enables the Check-frame URL', () => {
      const { handler } = createHandler();

      expect(handler.buildCheckFrameUrl()).toBeNull();
      handler.startFlow();

      const url = handler.buildCheckFrameUrl() as string;
      expect(url).toContain('sessionToken=tok');
      expect(url).toContain('channelId=ch_1');
      expect(url).toContain('skipKyc=true');
    });

    it('does not replace an existing keypair on ensureKeypair', () => {
      const { handler } = createHandler();
      handler.startFlow();
      const first = handler.buildCheckFrameUrl() as string;

      handler.ensureKeypair();

      expect(handler.buildCheckFrameUrl()).toBe(first);
    });

    it('creates a keypair on ensureKeypair when none exists', () => {
      const { handler } = createHandler();

      handler.ensureKeypair();

      expect(handler.buildCheckFrameUrl()).toContain('sessionToken=tok');
    });

    it('drops the keypair and auth client token on clear', () => {
      const { handler } = createHandler();
      handler.startFlow();
      expect(handler.buildCheckFrameUrl()).not.toBeNull();

      handler.clear();

      expect(handler.buildCheckFrameUrl()).toBeNull();
      expect(handler.buildAuthFrameUrl()).toBeNull();
    });

    it('drops only the auth client token on clearAuthentication', async () => {
      const { handler } = createHandler();
      handler.startFlow();
      await handler.handleMessage({
        kind: 'complete',
        meta: { channelId: 'ch_1' },
        payload: {
          status: 'connectionRequired',
          credentials: envelopeFor(handler, { clientToken: 'client-1' }),
        },
      });
      expect(handler.buildAuthFrameUrl()).toContain('clientToken=client-1');

      handler.clearAuthentication();

      expect(handler.buildAuthFrameUrl()).toBeNull();
      expect(handler.buildCheckFrameUrl()).toContain('sessionToken=tok');
    });
  });

  describe('handleMessage', () => {
    it('acks a handshake', async () => {
      const { handler } = createHandler();

      const result = await handler.handleMessage({
        kind: 'handshake',
        meta: { channelId: 'ch_1' },
      });

      expect(result).toStrictEqual({
        reply: { version: 2, meta: { channelId: 'ch_1' }, kind: 'ack' },
      });
    });

    it('ignores undefined and non-complete messages', async () => {
      const { handler } = createHandler();

      expect(await handler.handleMessage(undefined)).toStrictEqual({});
      expect(await handler.handleMessage({ kind: 'other' })).toStrictEqual({});
    });

    it('captures the customer id and ignores a status-less complete message', async () => {
      const { handler, state } = createHandler({ phase: 'check' });

      const result = await handler.handleMessage({
        kind: 'complete',
        meta: { channelId: 'ch_1' },
        payload: { customer: { id: 'cust-1' } },
      });

      expect(result).toStrictEqual({});
      expect(state.moonpayCustomerId).toBe('cust-1');
    });

    it('ignores messages on an unknown channel', async () => {
      const { handler, state } = createHandler();

      const result = await handler.handleMessage({
        kind: 'complete',
        meta: { channelId: 'ch_unknown' },
        payload: { status: 'active' },
      });

      expect(result).toStrictEqual({});
      expect(state.phase).toBe('check');
    });

    it('ignores a stale completion for a frame the flow is no longer waiting on', async () => {
      const { handler, state, onAuthenticated } = createHandler({
        phase: 'done',
      });

      const result = await handler.handleMessage({
        kind: 'complete',
        meta: { channelId: 'ch_1' },
        payload: {
          status: 'active',
          credentials: 'not-used',
          customer: { id: 'cust-late' },
        },
      });

      expect(result).toStrictEqual({});
      expect(state.phase).toBe('done');
      expect(state.moonpayAccessToken).toBeNull();
      expect(state.moonpayCustomerId).toBeNull();
      expect(onAuthenticated).not.toHaveBeenCalled();
    });

    it('ignores a Check complete when the active vendor is not MoonPay', async () => {
      const { handler, state, onAuthenticated } = createHandler({
        phase: 'check',
        activeVendor: 'iron',
      });

      const result = await handler.handleMessage({
        kind: 'complete',
        meta: { channelId: 'ch_1' },
        payload: {
          status: 'active',
          credentials: 'not-decryptable',
          customer: { id: 'cust-late' },
        },
      });

      expect(result).toStrictEqual({});
      expect(state.phase).toBe('check');
      expect(state.moonpayAccessToken).toBeNull();
      expect(state.moonpayCustomerId).toBeNull();
      expect(onAuthenticated).not.toHaveBeenCalled();
    });

    it('fails when credential decryption throws', async () => {
      const { handler, fail } = createHandler();
      handler.startFlow();

      await handler.handleMessage({
        kind: 'complete',
        meta: { channelId: 'ch_1' },
        payload: { status: 'active', credentials: 'not-decryptable' },
      });

      expect(fail).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to decrypt/u),
      );
    });

    it('ignores a duplicate completion while a prior continuation is in flight', async () => {
      const { handler, onAuthenticated } = createHandler({ phase: 'auth' });
      handler.startFlow();
      let releaseAuthenticated: () => void = () => {
        // no-op placeholder until the deferred promise is wired up
      };
      onAuthenticated.mockReturnValue(
        new Promise<void>((resolve) => {
          releaseAuthenticated = resolve;
        }),
      );
      const envelope = envelopeFor(handler, { accessToken: 'access-1' });
      const message = {
        kind: 'complete',
        meta: { channelId: 'ch_2' },
        payload: { status: 'active', credentials: envelope },
      };

      const first = handler.handleMessage(message);
      const second = handler.handleMessage(message);

      releaseAuthenticated();
      await Promise.all([first, second]);

      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });

    describe('check frame', () => {
      it('moves to form on an active status with an access token', async () => {
        const { handler, state, onAuthenticated } = createHandler();
        handler.startFlow();

        await handler.handleMessage({
          kind: 'complete',
          meta: { channelId: 'ch_1' },
          payload: {
            status: 'active',
            credentials: envelopeFor(handler, { accessToken: 'access-1' }),
          },
        });

        expect(state.phase).toBe('form');
        expect(state.moonpayAccessToken).toBe('access-1');
        expect(onAuthenticated).toHaveBeenCalledTimes(1);
      });

      it('moves to auth on connectionRequired and enables the auth frame URL', async () => {
        const { handler, state, onAuthenticated } = createHandler();
        handler.startFlow();

        await handler.handleMessage({
          kind: 'complete',
          meta: { channelId: 'ch_1' },
          payload: {
            status: 'connectionRequired',
            credentials: envelopeFor(handler, { clientToken: 'client-1' }),
          },
        });

        expect(state.phase).toBe('auth');
        expect(handler.buildAuthFrameUrl()).toContain('clientToken=client-1');
        expect(onAuthenticated).not.toHaveBeenCalled();
      });

      it('requires re-acceptance on termsAcceptanceRequired', async () => {
        const { handler, requireTermsReacceptance } = createHandler();

        await handler.handleMessage({
          kind: 'complete',
          meta: { channelId: 'ch_1' },
          payload: { status: 'termsAcceptanceRequired' },
        });

        expect(requireTermsReacceptance).toHaveBeenCalledTimes(1);
      });

      it('fails on an unexpected status', async () => {
        const { handler, fail } = createHandler();

        await handler.handleMessage({
          kind: 'complete',
          meta: { channelId: 'ch_1' },
          payload: { status: 'failed' },
        });

        expect(fail).toHaveBeenCalledWith(
          'Check frame returned status: failed',
        );
      });
    });

    describe('auth frame', () => {
      it('moves to form on an active status with an access token', async () => {
        const { handler, state, onAuthenticated } = createHandler({
          phase: 'auth',
        });
        handler.startFlow();

        await handler.handleMessage({
          kind: 'complete',
          meta: { channelId: 'ch_2' },
          payload: {
            status: 'active',
            credentials: envelopeFor(handler, { accessToken: 'access-2' }),
          },
        });

        expect(state.phase).toBe('form');
        expect(state.moonpayAccessToken).toBe('access-2');
        expect(onAuthenticated).toHaveBeenCalledTimes(1);
      });

      it('requires re-acceptance on termsAcceptanceRequired', async () => {
        const { handler, requireTermsReacceptance } = createHandler({
          phase: 'auth',
        });

        await handler.handleMessage({
          kind: 'complete',
          meta: { channelId: 'ch_2' },
          payload: { status: 'termsAcceptanceRequired' },
        });

        expect(requireTermsReacceptance).toHaveBeenCalledTimes(1);
      });

      it('fails on an unexpected status', async () => {
        const { handler, fail } = createHandler({ phase: 'auth' });

        await handler.handleMessage({
          kind: 'complete',
          meta: { channelId: 'ch_2' },
          payload: { status: 'unavailable' },
        });

        expect(fail).toHaveBeenCalledWith(
          'Auth frame returned status: unavailable',
        );
      });
    });
  });

  describe('frame URL builders', () => {
    it('returns null for the check frame without a session', () => {
      const { handler } = createHandler({ moonpaySessionToken: null });
      handler.startFlow();

      expect(handler.buildCheckFrameUrl()).toBeNull();
    });

    it('returns null for the check frame when the active vendor is not MoonPay', () => {
      const { handler } = createHandler({ activeVendor: 'iron' });
      handler.startFlow();

      expect(handler.buildCheckFrameUrl()).toBeNull();
    });

    it('returns null for the auth frame without a client token', () => {
      const { handler } = createHandler();
      handler.startFlow();

      expect(handler.buildAuthFrameUrl()).toBeNull();
    });

    it('builds the reset frame URL', () => {
      const { handler } = createHandler();

      expect(handler.buildResetFrameUrl()).toContain('channelId=ch_reset');
    });
  });

  describe('clearMoonPaySession', () => {
    it('clears MoonPay session artifacts from a state draft', () => {
      const state: FrameState = {
        activeVendor: 'moonpay',
        moonpayAccessToken: 'access',
        moonpayCustomerId: 'cust-1',
        moonpaySessionToken: 'tok',
        phase: 'form',
        statusMessage: '',
      };

      clearMoonPaySession(state);

      expect(state.moonpayAccessToken).toBeNull();
      expect(state.moonpayCustomerId).toBeNull();
      expect(state.moonpaySessionToken).toBeNull();
    });
  });
});
