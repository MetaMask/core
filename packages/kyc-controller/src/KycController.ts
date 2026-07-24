import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import { decryptCredentials, generateKeyPair } from './crypto';
import type { EncryptedCredentialsEnvelope, X25519KeyPair } from './crypto';
import type { KycControllerMethodActions } from './KycController-method-action-types';
import type { KycServiceMethodActions } from './KycService-method-action-types';
import type {
  KycDisclaimer,
  KycPhase,
  KycProduct,
  KycSumSubLauncher,
  KycSumSubStatus,
} from './types';

// === GENERAL ===

export const controllerName = 'KycController';

const FRAMES_BASE_URL = 'https://blocks.moonpay.com/platform/v1';
const CHANNEL_CHECK = 'ch_1';
const CHANNEL_AUTH = 'ch_2';
const CHANNEL_RESET = 'ch_reset';

// Placeholder credentials for the SumSub sub-flow. These are demo values that
// must be replaced with real UKYC-issued material before production use.
const MOCK_JWT_TOKEN = 'mock-jwt-token';

// The SumSub SDK status that signals the applicant finished the flow
// successfully. Any other resolution (abandonment, failure, or a non-success
// outcome) must not be recorded as `complete`.
const SUMSUB_COMPLETED_STATUS = 'Completed';

// === STATE ===

/**
 * Describes the shape of the state object for {@link KycController}.
 */
export type KycControllerState = {
  /** Current phase of the identity flow. */
  phase: KycPhase;
  /** Human-readable status message for the current phase. */
  statusMessage: string;
  /** The current error message, or `null`. */
  error: string | null;

  /** Email associated with the session (sourced from the account). */
  email: string | null;

  /** ISO-8601 timestamp of the customer's terms acceptance (persisted). */
  termsAcceptedAt: string | null;
  /** IDs of the disclaimers the customer accepted (persisted). */
  acceptedDisclaimerIds: string[];

  /** Disclaimers fetched for the current country. */
  disclaimers: KycDisclaimer[];
  /** Error encountered while loading disclaimers, or `null`. */
  disclaimersError: string | null;

  /** Resolved ISO 3166-1 alpha-3 country code. */
  geoCountry: string | null;

  /** Vendor session token (not persisted, not logged). */
  sessionToken: string | null;
  /** Vendor access token (not persisted, not logged). */
  accessToken: string | null;
  /** Vendor customer id, used for the SumSub hand-off. */
  moonpayCustomerId: string | null;

  /**
   * The product the current flow is running for. Captured at `initialize`
   * (or `acceptTermsAndStartSession`) and used to automatically run the
   * KYC-required check once authentication completes. `null` outside a
   * product-scoped flow (in which case the flow stops at `form` and the
   * consumer drives the check manually).
   */
  activeProduct: KycProduct | null;

  /** Cached "is KYC required" result per product (persisted). */
  kycRequiredByProduct: Partial<Record<KycProduct, boolean>>;
  /** ISO-8601 timestamp of the last KYC-required check (persisted). */
  lastCheckedAt: string | null;

  /** SumSub document-verification sub-flow state. */
  sumsub: {
    status: KycSumSubStatus;
    result: Json | null;
    sessionId: string | null;
    applicantAccessToken: string | null;
  };
};

const kycControllerMetadata = {
  phase: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  statusMessage: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  error: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  email: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  termsAcceptedAt: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  acceptedDisclaimerIds: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  disclaimers: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: true,
  },
  disclaimersError: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  geoCountry: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  sessionToken: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  accessToken: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  moonpayCustomerId: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  activeProduct: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  kycRequiredByProduct: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  lastCheckedAt: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  sumsub: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: true,
  },
} satisfies StateMetadata<KycControllerState>;

/**
 * Constructs the default {@link KycController} state.
 *
 * @returns The default state.
 */
export function getDefaultKycControllerState(): KycControllerState {
  return {
    phase: 'idle',
    statusMessage: '',
    error: null,
    email: null,
    termsAcceptedAt: null,
    acceptedDisclaimerIds: [],
    disclaimers: [],
    disclaimersError: null,
    geoCountry: null,
    sessionToken: null,
    accessToken: null,
    moonpayCustomerId: null,
    activeProduct: null,
    kycRequiredByProduct: {},
    lastCheckedAt: null,
    sumsub: {
      status: 'idle',
      result: null,
      sessionId: null,
      applicantAccessToken: null,
    },
  };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'initialize',
  'loadDisclaimers',
  'acceptTermsAndStartSession',
  'clearSavedTerms',
  'handleFrameMessage',
  'buildCheckFrameUrl',
  'buildAuthFrameUrl',
  'buildResetFrameUrl',
  'checkKycRequired',
  'getKycStatus',
  'startSumSub',
  'reset',
] as const;

export type KycControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  KycControllerState
>;

export type KycControllerActions =
  | KycControllerGetStateAction
  | KycControllerMethodActions;

type AllowedActions = KycServiceMethodActions;

export type KycControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  KycControllerState
>;

export type KycControllerEvents = KycControllerStateChangeEvent;

type AllowedEvents = never;

export type KycControllerMessenger = Messenger<
  typeof controllerName,
  KycControllerActions | AllowedActions,
  KycControllerEvents | AllowedEvents
>;

/**
 * Options for constructing a {@link KycController}.
 */
export type KycControllerOptions = {
  messenger: KycControllerMessenger;
  state?: Partial<KycControllerState>;
  /**
   * Platform adapter that presents the SumSub SDK. Injected by each client so
   * the controller stays platform-agnostic.
   */
  sumsubLauncher: KycSumSubLauncher;
};

/**
 * The shape of a message posted by a Check/Auth frame.
 */
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

// === CONTROLLER DEFINITION ===

/**
 * `KycController` orchestrates the vendor-backed KYC / identity-verification
 * flow (MoonPay identity + SumSub documents) behind a vendor-neutral, per
 * product surface used by ramps and card. It owns all state, HTTP
 * orchestration (via `KycService`), crypto, and the frame message protocol;
 * platform-specific presentation (WebView/iframe, SumSub SDK) is injected.
 */
export class KycController extends BaseController<
  typeof controllerName,
  KycControllerState,
  KycControllerMessenger
> {
  readonly #sumsubLauncher: KycSumSubLauncher;

  /** Ephemeral X25519 keypair for the frame key exchange (never persisted). */
  readonly #keypair: X25519KeyPair;

  /** Auth-frame client token, kept out of state. */
  #authClientToken: string | null = null;

  /**
   * Monotonic flow generation. Incremented by {@link reset} so in-flight async
   * work (e.g. the KYC-required check) can detect that it was superseded and
   * avoid writing stale results onto a reset controller.
   */
  #generation = 0;

  /**
   * Guards the automatic post-authentication continuation. The Check/Auth
   * frames can post more than one `complete` message (duplicate or late), each
   * of which resolves to an `active` outcome with an access token. Without this
   * flag, every such message would re-enter {@link #continueAfterAuthentication}
   * and run the KYC-required check / SumSub sub-flow again while a prior run is
   * still in flight. Set for the duration of a continuation and cleared by
   * {@link reset} so a fresh flow can continue again.
   */
  #continuationInFlight = false;

  /**
   * Constructs a new {@link KycController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - Partial initial state; merged over defaults.
   * @param options.sumsubLauncher - The platform SumSub launcher adapter.
   */
  constructor({ messenger, state, sumsubLauncher }: KycControllerOptions) {
    super({
      messenger,
      metadata: kycControllerMetadata,
      name: controllerName,
      state: { ...getDefaultKycControllerState(), ...state },
    });

    this.#sumsubLauncher = sumsubLauncher;
    this.#keypair = generateKeyPair();

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Resolves persisted terms + geolocation, and auto-creates a session when
   * terms are already accepted and an email is available.
   *
   * @param params - Optional parameters.
   * @param params.email - The account email to associate with the session.
   * @param params.product - The consuming feature the flow runs for. When
   * provided, the controller automatically runs the KYC-required check once
   * authentication completes (and chains into document verification when KYC
   * is required). When omitted, the flow stops at `form` and the consumer must
   * call `checkKycRequired` manually.
   */
  async initialize(params?: {
    email?: string;
    product?: KycProduct;
  }): Promise<void> {
    // `initialize` starts a fresh flow, so `activeProduct` is always reset to
    // this call's product (or `null`). Otherwise a prior run's product could
    // linger and cause `#continueAfterAuthentication` to auto-run the check /
    // sub-flow when the caller intended the manual (product-less) flow.
    this.#applyUpdate((state) => {
      if (params?.email) {
        state.email = params.email;
      }
      state.activeProduct = params?.product ?? null;
    });

    // Resolve country for display; non-blocking.
    try {
      const country = await this.messenger.call('KycService:getGeoCountry');
      this.#applyUpdate((state) => {
        state.geoCountry = country;
      });
    } catch {
      // Ignore; disclaimers loading will surface a country error if needed.
    }

    const hasTerms =
      Boolean(this.state.termsAcceptedAt) &&
      this.state.acceptedDisclaimerIds.length > 0;

    if (hasTerms && this.state.email) {
      await this.#createSession();
      return;
    }

    this.#applyUpdate((state) => {
      state.phase = 'terms';
    });
    await this.loadDisclaimers();
  }

  /**
   * Loads the disclaimers for the resolved (or provided) country.
   *
   * @param params - Optional parameters.
   * @param params.country - ISO 3166-1 alpha-3 country code override.
   */
  async loadDisclaimers(params?: { country?: string }): Promise<void> {
    try {
      const country =
        params?.country ??
        this.state.geoCountry ??
        (await this.messenger.call('KycService:getGeoCountry'));
      if (country !== this.state.geoCountry) {
        this.#applyUpdate((state) => {
          state.geoCountry = country;
        });
      }
      const disclaimers = await this.messenger.call(
        'KycService:fetchDisclaimers',
        { country },
      );
      this.#applyUpdate((state) => {
        state.disclaimers = disclaimers;
        state.disclaimersError = null;
      });
    } catch (error) {
      this.#applyUpdate((state) => {
        state.disclaimersError = `Failed to load disclaimers: ${String(error)}`;
      });
    }
  }

  /**
   * Captures terms acceptance for the currently loaded disclaimers and creates
   * a session.
   *
   * @param params - Optional parameters.
   * @param params.email - The account email to associate with the session.
   * @param params.product - The consuming feature the flow runs for. See
   * {@link initialize} for how the product drives the automatic post
   * authentication continuation.
   */
  async acceptTermsAndStartSession(params?: {
    email?: string;
    product?: KycProduct;
  }): Promise<void> {
    const termsAcceptedAt = new Date().toISOString();
    const disclaimerIds = this.state.disclaimers.map(
      (disclaimer) => disclaimer.id,
    );
    this.#applyUpdate((state) => {
      if (params?.email) {
        state.email = params.email;
      }
      if (params?.product) {
        state.activeProduct = params.product;
      }
      state.termsAcceptedAt = termsAcceptedAt;
      state.acceptedDisclaimerIds = disclaimerIds;
    });
    await this.#createSession();
  }

  /**
   * Creates a vendor session from the currently stored terms + email.
   */
  async #createSession(): Promise<void> {
    const { email, termsAcceptedAt, acceptedDisclaimerIds } = this.state;
    if (!email) {
      this.#fail('Missing email for session creation.');
      return;
    }
    if (!termsAcceptedAt || acceptedDisclaimerIds.length === 0) {
      this.#fail('Missing terms acceptance for session creation.');
      return;
    }

    // A new session invalidates any authentication carried over from a prior
    // session. Clear the stale session token, access token, and auth-frame
    // client token so `buildCheckFrameUrl` cannot return a URL bound to an old
    // (or, on failure, invalid) session token, `buildAuthFrameUrl` cannot
    // return a URL tied to an old client token, and `checkKycRequired` cannot
    // run with an access token from an earlier authentication. The Check/Auth
    // frames re-populate these for the new session. Because `sessionToken` is
    // cleared here and only re-set on success, a failed creation leaves it
    // `null` rather than resurrecting the previous session.
    this.#authClientToken = null;
    this.#applyUpdate((state) => {
      state.error = null;
      state.phase = 'session';
      state.statusMessage = 'Creating session...';
      state.sessionToken = null;
      state.accessToken = null;
    });

    try {
      const { sessionToken } = await this.messenger.call(
        'KycService:createSession',
        { email, termsAcceptedAt, disclaimerIds: acceptedDisclaimerIds },
      );
      this.#applyUpdate((state) => {
        state.sessionToken = sessionToken;
        state.phase = 'check';
        state.statusMessage = 'Authenticating via Check frame...';
      });
    } catch (error) {
      // Invalidate the stored acceptance so the customer can retry. Also clear
      // `activeProduct` so a later `acceptTermsAndStartSession` that omits a
      // product cannot auto-run the KYC check / SumSub chain for this failed
      // flow's product — matching how `initialize` starts from a clean product.
      this.#applyUpdate((state) => {
        this.#clearAcceptedTerms(state);
        state.activeProduct = null;
        state.error = `Session creation failed: ${String(error)}`;
        state.statusMessage =
          'Session creation failed — accept the terms to try again.';
        state.phase = 'terms';
      });
      await this.loadDisclaimers();
    }
  }

  /**
   * Clears the persisted terms acceptance.
   */
  clearSavedTerms(): void {
    this.#applyUpdate((state) => {
      this.#clearAcceptedTerms(state);
    });
  }

  /**
   * Clears the stored terms acceptance on the given draft state. Shared by the
   * paths that must invalidate acceptance — explicit clear, vendor terms
   * update, and session-creation failure — so they stay in sync. This is a
   * targeted invalidation and, unlike {@link reset}, deliberately leaves the
   * rest of the flow (geolocation, disclaimers, phase) untouched.
   *
   * @param state - The state to mutate.
   */
  #clearAcceptedTerms(state: KycControllerState): void {
    state.termsAcceptedAt = null;
    state.acceptedDisclaimerIds = [];
  }

  /**
   * Handles a message posted by a Check/Auth frame and advances the flow.
   *
   * The transport-agnostic caller (WebView on mobile, iframe on web) forwards
   * the raw message and injects the returned `reply` back into the frame.
   *
   * @param params - The parameters.
   * @param params.message - The raw message posted by the frame.
   * @returns An object whose optional `reply` should be posted back.
   */
  async handleFrameMessage(params: {
    message: unknown;
  }): Promise<{ reply?: unknown }> {
    const payload = params.message as FrameMessage | undefined;

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
    const status = payload.payload?.status;
    const credsEnvelope = payload.payload?.credentials;

    const customerId = payload.payload?.customer?.id ?? null;
    if (customerId) {
      this.#applyUpdate((state) => {
        state.moonpayCustomerId = customerId;
      });
    }

    if (!status) {
      return {};
    }

    let accessToken: string | undefined;
    let clientToken: string | undefined;
    if (credsEnvelope) {
      try {
        const { credentials } = decryptCredentials(
          credsEnvelope,
          this.#keypair.privateKey,
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
      return {};
    }

    if (channelId === CHANNEL_AUTH) {
      await this.#handleAuthOutcome(status, accessToken);
      return {};
    }

    return {};
  }

  /**
   * Applies a Check-frame outcome.
   *
   * @param status - The frame status.
   * @param accessToken - The decrypted access token, if any.
   * @param clientToken - The decrypted client token, if any.
   */
  async #handleCheckOutcome(
    status: NonNullable<FrameMessage['payload']>['status'],
    accessToken?: string,
    clientToken?: string,
  ): Promise<void> {
    if (status === 'active' && accessToken) {
      this.#applyUpdate((state) => {
        state.accessToken = accessToken;
        state.phase = 'form';
        state.statusMessage = 'Already authenticated. Review to submit.';
      });
      await this.#continueAfterAuthentication();
      return;
    }
    if (status === 'connectionRequired' && clientToken) {
      this.#authClientToken = clientToken;
      this.#applyUpdate((state) => {
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

  /**
   * Applies an Auth-frame outcome.
   *
   * @param status - The frame status.
   * @param accessToken - The decrypted access token, if any.
   */
  async #handleAuthOutcome(
    status: NonNullable<FrameMessage['payload']>['status'],
    accessToken?: string,
  ): Promise<void> {
    if (status === 'active' && accessToken) {
      this.#applyUpdate((state) => {
        state.accessToken = accessToken;
        state.phase = 'form';
        state.statusMessage = 'Authenticated. Review to submit.';
      });
      await this.#continueAfterAuthentication();
      return;
    }
    if (status === 'termsAcceptanceRequired') {
      this.#requireTermsReacceptance();
      return;
    }
    this.#fail(`Auth frame returned status: ${status}`);
  }

  /**
   * Continues the flow once authentication has completed (phase `form`).
   *
   * When the flow is scoped to a product (see {@link initialize}), the
   * KYC-required check runs automatically, and — when KYC is required — the
   * document-verification sub-flow is launched. When no product is set, this is
   * a no-op and the flow stays at `form` for the consumer to drive manually.
   *
   * Errors are already recorded on state by `checkKycRequired` (`error`
   * phase) and `startSumSub` (`sumsub.status = 'failed'`); this method swallows
   * them so it can be awaited safely from the frame-message handler.
   */
  async #continueAfterAuthentication(): Promise<void> {
    const product = this.state.activeProduct;
    if (!product) {
      return;
    }

    // A duplicate or late `complete` message can re-enter here while a prior
    // continuation is still running; ignore it so the check / sub-flow does not
    // run twice concurrently.
    if (this.#continuationInFlight) {
      return;
    }
    this.#continuationInFlight = true;

    // Capture the generation so a `reset()` landing mid-continuation does not
    // let the `finally` clear a flag that belongs to a newer flow.
    const generation = this.#generation;

    try {
      const kycRequired = await this.checkKycRequired({ product });
      if (!kycRequired) {
        return;
      }

      try {
        await this.startSumSub();
      } catch {
        // `startSumSub` already records `sumsub.status = 'failed'`; swallow the
        // rethrown error (e.g. SDK unavailable) so the awaited continuation
        // resolves cleanly rather than surfacing as an unhandled rejection.
      }
    } finally {
      if (this.#generation === generation) {
        this.#continuationInFlight = false;
      }
    }
  }

  /**
   * Invalidates stored terms and returns to the terms phase.
   */
  #requireTermsReacceptance(): void {
    this.#applyUpdate((state) => {
      this.#clearAcceptedTerms(state);
      state.phase = 'terms';
      state.statusMessage =
        'The vendor updated its Terms of Use — please re-accept.';
    });
  }

  /**
   * Builds the Check-frame URL, or `null` when no session exists yet.
   *
   * @returns The Check-frame URL or `null`.
   */
  buildCheckFrameUrl(): string | null {
    if (!this.state.sessionToken) {
      return null;
    }
    const url = new URL(`${FRAMES_BASE_URL}/check-connection`);
    url.searchParams.set('sessionToken', this.state.sessionToken);
    url.searchParams.set('publicKey', this.#keypair.publicKeyHex);
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
    if (!this.#authClientToken) {
      return null;
    }
    const url = new URL(`${FRAMES_BASE_URL}/auth`);
    url.searchParams.set('clientToken', this.#authClientToken);
    url.searchParams.set('publicKey', this.#keypair.publicKeyHex);
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

  /**
   * Checks whether KYC is required for a product and caches the result.
   *
   * @param params - The parameters.
   * @param params.product - The consuming feature.
   * @param params.country - Optional alpha-3 country override.
   * @returns Whether KYC is required.
   */
  async checkKycRequired(params: {
    product: KycProduct;
    country?: string;
  }): Promise<boolean> {
    const { accessToken } = this.state;
    if (!accessToken) {
      this.#fail('Missing accessToken — repeat the authentication step.');
      return false;
    }
    const country = params.country ?? this.state.geoCountry;
    if (!country) {
      this.#fail('Missing country for KYC-required check.');
      return false;
    }

    // Capture the flow generation so we can detect a `reset()` that happens
    // while the HTTP call is in flight and avoid writing stale results.
    const generation = this.#generation;

    this.#applyUpdate((state) => {
      state.phase = 'submit';
      state.statusMessage = 'Checking KYC status...';
    });

    try {
      const { kycRequired } = await this.messenger.call(
        'KycService:checkKycRequired',
        { accessToken, country, capabilities: [{ product: params.product }] },
      );
      // The flow was reset while the check was in flight; discard the result
      // rather than resurrecting a done/cached state on an idle controller.
      if (this.#generation !== generation) {
        return false;
      }
      this.#applyUpdate((state) => {
        state.kycRequiredByProduct[params.product] = kycRequired;
        state.lastCheckedAt = new Date().toISOString();
        state.phase = 'done';
        state.statusMessage = 'KYC check complete.';
      });
      return kycRequired;
    } catch (error) {
      if (this.#generation !== generation) {
        return false;
      }
      this.#fail(`KYC check failed: ${String(error)}`);
      return false;
    }
  }

  /**
   * Reads the cached "is KYC required" result for a product.
   *
   * @param params - The parameters.
   * @param params.product - The consuming feature.
   * @returns The cached value, or `undefined` if not yet checked.
   */
  getKycStatus(params: { product: KycProduct }): boolean | undefined {
    return this.state.kycRequiredByProduct[params.product];
  }

  /**
   * Runs the SumSub document-verification sub-flow: creates a UKYC session,
   * exchanges the wrapped key for an applicant access token, and presents the
   * SDK via the injected launcher.
   *
   * @param params - Optional parameters.
   * @param params.locale - BCP-47 locale for the SDK UI.
   * @param params.debug - Enables SDK debug logging.
   * @returns The SDK result.
   */
  async startSumSub(params?: {
    locale?: string;
    debug?: boolean;
  }): Promise<Record<string, unknown>> {
    if (!this.#sumsubLauncher.isAvailable()) {
      const error = 'SumSub SDK is not available in this runtime.';
      this.#applyUpdate((state) => {
        state.sumsub.status = 'failed';
        state.sumsub.result = { error };
      });
      throw new Error(error);
    }

    // Capture the flow generation so each async step can detect a `reset()`
    // that lands mid-flight and avoid writing stale sub-flow state (or, worse,
    // presenting the SDK) on a controller that is now idle.
    const generation = this.#generation;

    try {
      this.#applyUpdate((state) => {
        state.sumsub.status = 'creatingSession';
        state.sumsub.result = null;
      });

      const jwtToken = MOCK_JWT_TOKEN;
      const { sessionId, wrappingPublicKey, idosSessionId } =
        await this.messenger.call('KycService:createUkycSession', {
          jwtToken,
          vendorMetadata: {
            moonPayAccessToken: this.state.accessToken,
            moonPayUserId: this.state.moonpayCustomerId,
          },
        });
      // Retain the exchange material so the SDK can refresh its token. The
      // session's `wrappingPublicKey` is forwarded opaquely as the request's
      // `wrappedUserKey` field (the /wrapped-key endpoint's body is unchanged).
      const exchange = {
        sessionId,
        wrappedUserKey: wrappingPublicKey,
        idosSessionId,
        jwtToken,
      };

      this.#updateIfCurrent(generation, (state) => {
        state.sumsub.status = 'fetchingToken';
        state.sumsub.sessionId = sessionId;
      });

      const { applicantAccessToken } = await this.messenger.call(
        'KycService:submitWrappedKey',
        exchange,
      );

      // A reset() landed while the session/token was being prepared; abort
      // before presenting the SDK rather than launching on an idle controller.
      if (this.#generation !== generation) {
        return {};
      }

      this.#applyUpdate((state) => {
        state.sumsub.status = 'launching';
        state.sumsub.applicantAccessToken = applicantAccessToken;
      });

      // Track whether the SDK ever reported a successful completion. A resolved
      // `launch` alone does not imply success — the applicant may have
      // abandoned the flow or the SDK may have reported a non-success outcome.
      let reachedCompletion = false;

      const result = await this.#sumsubLauncher.launch({
        applicantAccessToken,
        onTokenExpiration: async () => {
          // A reset() may have superseded this flow while the SDK stayed open.
          // Refuse to refresh against the now-stale UKYC session rather than
          // silently keeping an orphaned SDK alive.
          if (this.#generation !== generation) {
            throw new Error(
              'KYC flow was reset; SumSub session is no longer active.',
            );
          }
          const refreshed = await this.messenger.call(
            'KycService:submitWrappedKey',
            exchange,
          );
          return refreshed.applicantAccessToken;
        },
        onStatusChange: (_prev, next) => {
          if (next === SUMSUB_COMPLETED_STATUS) {
            reachedCompletion = true;
          }
          this.#updateIfCurrent(generation, (state) => {
            state.sumsub.status =
              next === SUMSUB_COMPLETED_STATUS ? 'complete' : 'inProgress';
          });
        },
        locale: params?.locale ?? 'en',
        debug: params?.debug ?? false,
      });

      // Only record `complete` when the SDK actually reported completion;
      // otherwise treat the resolved-but-unfinished flow as `failed` so
      // consumers and UI do not mistake it for a finished verification.
      this.#updateIfCurrent(generation, (state) => {
        state.sumsub.status = reachedCompletion ? 'complete' : 'failed';
        state.sumsub.result = result as Json;
      });
      return result;
    } catch (error) {
      const result = { error: String(error) };
      this.#updateIfCurrent(generation, (state) => {
        state.sumsub.status = 'failed';
        state.sumsub.result = result;
      });
      return result;
    }
  }

  /**
   * Resets the flow to idle, clearing session tokens and sub-flow state while
   * preserving persisted terms acceptance and the per-product cache.
   */
  reset(): void {
    this.#authClientToken = null;
    // Invalidate any in-flight async work started before this reset.
    this.#generation += 1;
    // Allow the next authenticated flow to auto-continue; any continuation from
    // the superseded generation will no longer clear this flag (see the
    // generation guard in `#continueAfterAuthentication`).
    this.#continuationInFlight = false;
    this.#applyUpdate((state) => {
      state.phase = 'idle';
      state.statusMessage = '';
      state.error = null;
      state.disclaimers = [];
      state.disclaimersError = null;
      state.sessionToken = null;
      state.accessToken = null;
      state.moonpayCustomerId = null;
      state.activeProduct = null;
      state.sumsub = {
        status: 'idle',
        result: null,
        sessionId: null,
        applicantAccessToken: null,
      };
    });
  }

  /**
   * Applies a state update only when the flow has not been reset since
   * `generation` was captured. Prevents an in-flight async step from writing
   * stale results onto a controller that a concurrent {@link reset} has
   * returned to idle.
   *
   * @param generation - The flow generation captured before the async work.
   * @param updater - The state mutation to apply when still current.
   * @returns `true` if the update was applied, `false` if it was superseded.
   */
  #updateIfCurrent(
    generation: number,
    updater: (state: KycControllerState) => void,
  ): boolean {
    if (this.#generation !== generation) {
      return false;
    }
    this.#applyUpdate(updater);
    return true;
  }

  /**
   * The single state-update path for this controller. All mutations go through
   * here (rather than calling `this.update` directly) so the mechanism stays
   * consistent and one subtlety is handled in a single place:
   *
   * `sumsub.result` is typed as the recursive `Json`, and expanding
   * `Draft<Json>` (which happens whenever an updater touches `sumsub.result`)
   * trips TypeScript's "type instantiation is excessively deep" guard. By
   * typing the callback parameter as the plain {@link KycControllerState}
   * instead of Immer's `Draft`, we avoid expanding the draft type while keeping
   * the same mutate-in-place semantics (the underlying value is still the Immer
   * draft at runtime).
   *
   * @param updater - The state mutation to apply.
   */
  #applyUpdate(updater: (state: KycControllerState) => void): void {
    this.update((state) => {
      updater(state as unknown as KycControllerState);
    });
  }

  /**
   * Transitions to the error phase with a message.
   *
   * @param message - The error message.
   */
  #fail(message: string): void {
    this.#applyUpdate((state) => {
      state.error = message;
      state.phase = 'error';
    });
  }
}
