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
    if (params?.email || params?.product) {
      this.update((state) => {
        if (params.email) {
          state.email = params.email;
        }
        if (params.product) {
          state.activeProduct = params.product;
        }
      });
    }

    // Resolve country for display; non-blocking.
    try {
      const country = await this.messenger.call('KycService:getGeoCountry');
      this.update((state) => {
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

    this.update((state) => {
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
      const cachedCountry = params?.country ?? this.state.geoCountry;
      const country =
        cachedCountry ??
        (await this.messenger.call('KycService:getGeoCountry'));
      if (!cachedCountry) {
        this.update((state) => {
          state.geoCountry = country;
        });
      }
      const disclaimers = await this.messenger.call(
        'KycService:fetchDisclaimers',
        { country },
      );
      this.update((state) => {
        state.disclaimers = disclaimers;
        state.disclaimersError = null;
      });
    } catch (error) {
      this.update((state) => {
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
    this.update((state) => {
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

    this.update((state) => {
      state.error = null;
      state.phase = 'session';
      state.statusMessage = 'Creating session...';
    });

    try {
      const { sessionToken } = await this.messenger.call(
        'KycService:createSession',
        { email, termsAcceptedAt, disclaimerIds: acceptedDisclaimerIds },
      );
      this.update((state) => {
        state.sessionToken = sessionToken;
        state.phase = 'check';
        state.statusMessage = 'Authenticating via Check frame...';
      });
    } catch (error) {
      // Invalidate the stored acceptance so the customer can retry.
      this.update((state) => {
        state.termsAcceptedAt = null;
        state.acceptedDisclaimerIds = [];
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
    this.update((state) => {
      state.termsAcceptedAt = null;
      state.acceptedDisclaimerIds = [];
    });
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
      this.update((state) => {
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
      this.update((state) => {
        state.accessToken = accessToken;
        state.phase = 'form';
        state.statusMessage = 'Already authenticated. Review to submit.';
      });
      await this.#continueAfterAuthentication();
      return;
    }
    if (status === 'connectionRequired' && clientToken) {
      this.#authClientToken = clientToken;
      this.update((state) => {
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
      this.update((state) => {
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
  }

  /**
   * Invalidates stored terms and returns to the terms phase.
   */
  #requireTermsReacceptance(): void {
    this.update((state) => {
      state.termsAcceptedAt = null;
      state.acceptedDisclaimerIds = [];
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

    this.update((state) => {
      state.phase = 'submit';
      state.statusMessage = 'Checking KYC status...';
    });

    try {
      const { kycRequired } = await this.messenger.call(
        'KycService:checkKycRequired',
        { accessToken, country, capabilities: [{ product: params.product }] },
      );
      this.update((state) => {
        state.kycRequiredByProduct[params.product] = kycRequired;
        state.lastCheckedAt = new Date().toISOString();
        state.phase = 'done';
        state.statusMessage = 'KYC check complete.';
      });
      return kycRequired;
    } catch (error) {
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
      this.update((state) => {
        state.sumsub.status = 'failed';
        state.sumsub.result = { error };
      });
      throw new Error(error);
    }

    try {
      this.update((state) => {
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

      this.update((state) => {
        state.sumsub.status = 'fetchingToken';
        state.sumsub.sessionId = sessionId;
      });

      const { applicantAccessToken } = await this.messenger.call(
        'KycService:submitWrappedKey',
        exchange,
      );

      this.update((state) => {
        state.sumsub.status = 'launching';
        state.sumsub.applicantAccessToken = applicantAccessToken;
      });

      const result = await this.#sumsubLauncher.launch({
        applicantAccessToken,
        onTokenExpiration: async () => {
          const refreshed = await this.messenger.call(
            'KycService:submitWrappedKey',
            exchange,
          );
          return refreshed.applicantAccessToken;
        },
        onStatusChange: (_prev, next) => {
          this.update((state) => {
            state.sumsub.status =
              next === 'Completed' ? 'complete' : 'inProgress';
          });
        },
        locale: params?.locale ?? 'en',
        debug: params?.debug ?? false,
      });

      this.update((state) => {
        state.sumsub.status = 'complete';
        state.sumsub.result = result as Json;
      });
      return result;
    } catch (error) {
      const result = { error: String(error) };
      this.update((state) => {
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
    this.update((state) => {
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
   * Transitions to the error phase with a message.
   *
   * @param message - The error message.
   */
  #fail(message: string): void {
    this.update((state) => {
      state.error = message;
      state.phase = 'error';
    });
  }
}
