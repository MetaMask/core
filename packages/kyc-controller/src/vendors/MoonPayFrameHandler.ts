import { decryptCredentials, generateKeyPair } from '../crypto.js';
import type { EncryptedCredentialsEnvelope, X25519KeyPair } from '../crypto.js';
import type { KycPhase, KycVendor } from '../types.js';

const FRAMES_BASE_URL = 'https://blocks.moonpay.com/platform/v1';
const CHANNEL_CHECK = 'ch_1';
const CHANNEL_AUTH = 'ch_2';
const CHANNEL_RESET = 'ch_reset';

type MoonPayFrameState = {
  activeVendor: KycVendor;
  moonpayAccessToken: string | null;
  moonpayCustomerId: string | null;
  moonpaySessionToken: string | null;
  phase: KycPhase;
  statusMessage: string;
};

type FrameMessage = {
  meta?: { channelId?: string };
  kind?: string;
  payload?: {
    status?:
      | 'active'
      | 'connectionRequired'
      | 'termsAcceptanceRequired'
      | 'pending'
      | 'unavailable'
      | 'failed';
    credentials?: EncryptedCredentialsEnvelope | string;
    customer?: { id?: string };
  };
};

type FrameStatus = NonNullable<FrameMessage['payload']>['status'];

export type MoonPayFrameHandlerOptions = {
  getState: () => MoonPayFrameState;
  update: (updater: (state: MoonPayFrameState) => void) => void;
  fail: (message: string) => void;
  onAuthenticated: () => Promise<void>;
  requireTermsReacceptance: () => void;
};

/**
 * Owns MoonPay Check/Auth frame state and protocol handling.
 */
export class MoonPayFrameHandler {
  readonly #getState: MoonPayFrameHandlerOptions['getState'];

  readonly #update: MoonPayFrameHandlerOptions['update'];

  readonly #fail: MoonPayFrameHandlerOptions['fail'];

  readonly #onAuthenticated: MoonPayFrameHandlerOptions['onAuthenticated'];

  readonly #requireTermsReacceptance: MoonPayFrameHandlerOptions['requireTermsReacceptance'];

  /** MoonPay Check/Auth frame X25519 keypair (never persisted). */
  #frameKeypair: X25519KeyPair | null = null;

  /** Auth-frame client token, kept out of controller state. */
  #authClientToken: string | null = null;

  constructor({
    getState,
    update,
    fail,
    onAuthenticated,
    requireTermsReacceptance,
  }: MoonPayFrameHandlerOptions) {
    this.#getState = getState;
    this.#update = update;
    this.#fail = fail;
    this.#onAuthenticated = onAuthenticated;
    this.#requireTermsReacceptance = requireTermsReacceptance;
  }

  /**
   * Creates a fresh keypair for a new MoonPay flow.
   */
  startFlow(): void {
    this.#frameKeypair = generateKeyPair();
  }

  /**
   * Ensures an in-progress MoonPay flow has a frame keypair.
   */
  ensureKeypair(): void {
    this.#frameKeypair ??= generateKeyPair();
  }

  /**
   * Clears all non-persisted MoonPay frame artifacts.
   */
  clear(): void {
    this.#frameKeypair = null;
    this.#authClientToken = null;
  }

  /**
   * Clears authentication associated with an earlier MoonPay session.
   */
  clearAuthentication(): void {
    this.#authClientToken = null;
  }

  /**
   * Handles a message posted by a MoonPay Check/Auth frame.
   *
   * @param message - The raw message posted by the frame.
   * @returns An object whose optional `reply` should be posted back.
   */
  async handleMessage(message: unknown): Promise<{ reply?: unknown }> {
    const payload = message as FrameMessage | undefined;

    if (!payload) {
      return {};
    }

    if (payload.kind === 'handshake') {
      const channelId = payload.meta?.channelId;
      return { reply: { version: 2, meta: { channelId }, kind: 'ack' } };
    }

    if (payload.kind !== 'complete') {
      return {};
    }

    const channelId = payload.meta?.channelId;
    const state = this.#getState();

    // Only honor a completion for the MoonPay frame the flow is currently
    // waiting on. This drops stale or duplicate messages after reset, phase
    // advancement, or a vendor switch so they cannot restore tokens or rewind
    // the flow. Unlike awaited controller work, external frame messages are
    // not protected by the controller's generation guard.
    let expectedPhase: KycPhase | null = null;
    if (channelId === CHANNEL_CHECK) {
      expectedPhase = 'check';
    } else if (channelId === CHANNEL_AUTH) {
      expectedPhase = 'auth';
    }

    if (
      !expectedPhase ||
      state.phase !== expectedPhase ||
      state.activeVendor !== 'moonpay'
    ) {
      return {};
    }

    const status = payload.payload?.status;
    const credentialsEnvelope = payload.payload?.credentials;
    const customerId = payload.payload?.customer?.id ?? null;

    if (customerId) {
      this.#update((draft) => {
        draft.moonpayCustomerId = customerId;
      });
    }

    if (!status) {
      return {};
    }

    let accessToken: string | undefined;
    let clientToken: string | undefined;
    if (credentialsEnvelope && this.#frameKeypair) {
      try {
        const { credentials } = decryptCredentials(
          credentialsEnvelope,
          this.#frameKeypair.privateKey,
        );
        accessToken = credentials.accessToken;
        clientToken = credentials.clientToken;
      } catch (error) {
        this.#fail(`Failed to decrypt frame credentials: ${String(error)}`);
        return {};
      }
    }

    if (channelId === CHANNEL_CHECK) {
      await this.#handleCheckOutcome(status, accessToken, clientToken);
    } else {
      await this.#handleAuthOutcome(status, accessToken);
    }
    return {};
  }

  /**
   * Builds the Check-frame URL, or `null` when no session exists yet.
   *
   * @returns The Check-frame URL or `null`.
   */
  buildCheckFrameUrl(): string | null {
    const state = this.#getState();
    if (
      state.activeVendor !== 'moonpay' ||
      !state.moonpaySessionToken ||
      !this.#frameKeypair
    ) {
      return null;
    }
    const url = new URL(`${FRAMES_BASE_URL}/check-connection`);
    url.searchParams.set('sessionToken', state.moonpaySessionToken);
    url.searchParams.set('publicKey', this.#frameKeypair.publicKeyHex);
    url.searchParams.set('channelId', CHANNEL_CHECK);
    url.searchParams.set('skipKyc', 'true');
    return url.toString();
  }

  /**
   * Builds the Auth-frame URL, or `null` when no client token is available.
   *
   * @returns The Auth-frame URL or `null`.
   */
  buildAuthFrameUrl(): string | null {
    const state = this.#getState();
    if (
      state.activeVendor !== 'moonpay' ||
      !this.#authClientToken ||
      !this.#frameKeypair
    ) {
      return null;
    }
    const url = new URL(`${FRAMES_BASE_URL}/auth`);
    url.searchParams.set('clientToken', this.#authClientToken);
    url.searchParams.set('publicKey', this.#frameKeypair.publicKeyHex);
    url.searchParams.set('channelId', CHANNEL_AUTH);
    return url.toString();
  }

  /**
   * Builds the Reset-frame URL.
   *
   * @returns The Reset-frame URL.
   */
  buildResetFrameUrl(): string {
    const url = new URL(`${FRAMES_BASE_URL}/reset`);
    url.searchParams.set('channelId', CHANNEL_RESET);
    return url.toString();
  }

  async #handleCheckOutcome(
    status: FrameStatus,
    accessToken?: string,
    clientToken?: string,
  ): Promise<void> {
    if (status === 'active' && accessToken) {
      this.#update((state) => {
        state.moonpayAccessToken = accessToken;
        state.phase = 'form';
        state.statusMessage = 'Already authenticated. Review to submit.';
      });
      await this.#onAuthenticated();
      return;
    }
    if (status === 'connectionRequired' && clientToken) {
      this.#authClientToken = clientToken;
      this.#update((state) => {
        state.phase = 'auth';
        state.statusMessage = 'Verify your email via OTP in the Auth frame.';
      });
      return;
    }
    if (status === 'termsAcceptanceRequired') {
      this.#requireTermsReacceptance();
      return;
    }
    this.#fail(`Check frame returned status: ${status}`);
  }

  async #handleAuthOutcome(
    status: FrameStatus,
    accessToken?: string,
  ): Promise<void> {
    if (status === 'active' && accessToken) {
      this.#update((state) => {
        state.moonpayAccessToken = accessToken;
        state.phase = 'form';
        state.statusMessage = 'Authenticated. Review to submit.';
      });
      await this.#onAuthenticated();
      return;
    }
    if (status === 'termsAcceptanceRequired') {
      this.#requireTermsReacceptance();
      return;
    }
    this.#fail(`Auth frame returned status: ${status}`);
  }
}

/**
 * Drops persisted-in-memory MoonPay session artifacts from controller state.
 *
 * @param state - The state to mutate.
 */
export function clearMoonPaySession(state: MoonPayFrameState): void {
  state.moonpayCustomerId = null;
  state.moonpaySessionToken = null;
  state.moonpayAccessToken = null;
}
