import type { AuthenticatedUserStorageServicePutIdentitySharingConsentAction } from '@metamask/authenticated-user-storage';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationControllerGetPartnerIdentityTokenAction } from '@metamask/profile-sync-controller/auth';
import type {
  UserStorageControllerPerformGetStorageAction,
  UserStorageControllerPerformSetStorageAction,
} from '@metamask/profile-sync-controller/user-storage';

import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import type { KycOnboardingStep } from './KycService.js';
import {
  isSumSubFlowFailed,
  isSumSubPreSubmissionStatus,
  isSumSubSubmissionStatus,
} from './providers/sumsub.js';
import type { KycSumSubLauncher } from './providers/sumsub.js';
import { needsCapabilityAuthorizationRefresh } from './types.js';
import type {
  KycClientContext,
  KycConsentRecord,
  OnboardingVendor,
  KycSessionDisclaimers,
  KycStep,
  KycStepStatus,
} from './types.js';
import {
  createAuthorizedSession,
  refreshSessionAuthorizations,
} from './ukyc/sessionAuthorization.js';
import type { UkycSessionDeps } from './ukyc/sessionAuthorization.js';
import type { VendorOnboardingControllerMethodActions } from './VendorOnboardingController-method-action-types.js';

// === GENERAL ===

/**
 * The name of the {@link VendorOnboardingController}, used to namespace the
 * controller's actions and events.
 */
export const vendorOnboardingControllerName = 'VendorOnboardingController';

// === STATE ===

/**
 * What the phone keeps for one vendor. Everything else is decided by kyc-api,
 * so nothing here can disagree with it: the step is a copy for the first
 * paint, and the session id is only a handle. `step` and `status` are `null`
 * until kyc-api has answered, so a saved session id never reads as a step.
 */
export type OnboardingVendorState = {
  /** The last step kyc-api answered with, or `null` before it has answered. */
  step: KycStep | null;
  /**
   * How verification is going, as of that answer. Separate from the step: a
   * user asked to redo the identity provider is on the same step as one
   * doing it the first time, so this is what a "we need another look"
   * banner keys off. `null` until kyc-api has answered.
   */
  status: KycStepStatus | null;
  /** The vendor's UKYC session id, once one exists. */
  sessionId: string | null;
};

/**
 * State of the {@link VendorOnboardingController}.
 */
export type VendorOnboardingControllerState = {
  vendors: Partial<Record<OnboardingVendor, OnboardingVendorState>>;
};

const vendorOnboardingControllerMetadata = {
  vendors: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
} satisfies StateMetadata<VendorOnboardingControllerState>;

/**
 * Gets the default {@link VendorOnboardingController} state.
 *
 * @returns The default state.
 */
export function getDefaultVendorOnboardingControllerState(): VendorOnboardingControllerState {
  return { vendors: {} };
}

// === ACCOUNT LINK ADAPTER ===

/**
 * MFA methods a vendor can ask for while it verifies the account link.
 */
export type KycAccountLinkMfaMethod = 'sms' | 'email' | 'authenticator-app';

/**
 * The calls that create or link a vendor's own account (Kalshi). They are
 * signed with a key that lives on the device, so each client supplies them.
 * The adapter sends the signed call through kyc-api. The controller then asks
 * kyc-api for the next step, so it never keeps the link state itself.
 */
export type KycAccountLinkAdapter = {
  /**
   * Starts the link by sending the vendor's code to the email.
   */
  startLink: (params: { email: string }) => Promise<void>;
  /**
   * Verifies the code the vendor sent.
   *
   * @returns The MFA method the vendor wants next, if it wants one.
   */
  verifyLink: (params: { code: string }) => Promise<{
    mfaMethod?: KycAccountLinkMfaMethod;
  }>;
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'refreshStep',
  'acceptTerms',
  'startAccountLink',
  'verifyAccountLink',
  'startSession',
  'fetchSessionDisclaimers',
  'acceptSessionDisclaimers',
  'launchProviderFlow',
  'submitPhone',
  'submitPhoneCode',
  'submitEmailCode',
  'resendEmailCode',
  'reset',
] as const;

export type VendorOnboardingControllerGetStateAction = ControllerGetStateAction<
  typeof vendorOnboardingControllerName,
  VendorOnboardingControllerState
>;

export type VendorOnboardingControllerActions =
  | VendorOnboardingControllerGetStateAction
  | VendorOnboardingControllerMethodActions;

type AllowedActions =
  | KycServiceMethodActions
  | AuthenticationControllerGetPartnerIdentityTokenAction
  | AuthenticatedUserStorageServicePutIdentitySharingConsentAction
  | UserStorageControllerPerformGetStorageAction
  | UserStorageControllerPerformSetStorageAction;

export type VendorOnboardingControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof vendorOnboardingControllerName,
    VendorOnboardingControllerState
  >;

export type VendorOnboardingControllerEvents =
  VendorOnboardingControllerStateChangeEvent;

type AllowedEvents = never;

/**
 * The messenger of the {@link VendorOnboardingController}.
 */
export type VendorOnboardingControllerMessenger = Messenger<
  typeof vendorOnboardingControllerName,
  VendorOnboardingControllerActions | AllowedActions,
  VendorOnboardingControllerEvents | AllowedEvents
>;

/**
 * How the identity provider flow ended. `submitted` means the user finished
 * it and kyc-api was told. `abandoned` means they closed it first, so the
 * screen should offer to try again. `failed` means it could not run.
 */
export type OnboardingProviderOutcome = 'submitted' | 'abandoned' | 'failed';

/**
 * Options for constructing a {@link VendorOnboardingController}.
 */
export type VendorOnboardingControllerOptions = {
  messenger: VendorOnboardingControllerMessenger;
  state?: Partial<VendorOnboardingControllerState>;
  /**
   * The device-signed account link calls, by vendor. Only needed for vendors
   * that link an account (Kalshi).
   */
  accountLinkAdapters?: Partial<
    Record<OnboardingVendor, KycAccountLinkAdapter>
  >;
  /**
   * Platform adapter that presents the SumSub SDK. Injected by each client so
   * the controller stays platform-agnostic. Without it, `launchProviderFlow`
   * reports `failed`.
   */
  sumsubLauncher?: KycSumSubLauncher;
};

// === CONTROLLER DEFINITION ===

/**
 * `VendorOnboardingController` follows the step kyc-api decides for a vendor. Each
 * action goes to kyc-api and saves the step it answers with, so the client
 * never works out where the user is. It keeps only the step and the session
 * id per vendor: no terms, consents or account link state.
 *
 * It shares {@link KycService} with `KycController` and does not touch
 * `KycController` state, so a vendor can move to it on its own.
 */
export class VendorOnboardingController extends BaseController<
  typeof vendorOnboardingControllerName,
  VendorOnboardingControllerState,
  VendorOnboardingControllerMessenger
> {
  readonly #accountLinkAdapters: Partial<
    Record<OnboardingVendor, KycAccountLinkAdapter>
  >;

  readonly #sumsubLauncher?: KycSumSubLauncher;

  /**
   * The newest step request per vendor. An answer that arrives after a newer
   * request started is ignored, so a slow response cannot undo a later one.
   */
  readonly #stepRequests: Partial<Record<OnboardingVendor, number>> = {};

  /**
   * The step read in flight per vendor, which a plain `refreshStep` joins
   * instead of starting its own. Every other path starts its own read, so an
   * action never reports a step computed before it ran.
   */
  readonly #stepReads: Partial<Record<OnboardingVendor, Promise<KycStep>>> = {};

  /**
   * Constructs a new {@link VendorOnboardingController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - Partial initial state; merged over defaults.
   * @param options.accountLinkAdapters - The device-signed account link
   * calls, by vendor.
   * @param options.sumsubLauncher - The platform SumSub launcher adapter.
   */
  constructor({
    messenger,
    state,
    accountLinkAdapters,
    sumsubLauncher,
  }: VendorOnboardingControllerOptions) {
    super({
      messenger,
      metadata: vendorOnboardingControllerMetadata,
      name: vendorOnboardingControllerName,
      state: { ...getDefaultVendorOnboardingControllerState(), ...state },
    });

    this.#accountLinkAdapters = accountLinkAdapters ?? {};
    this.#sumsubLauncher = sumsubLauncher;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Asks kyc-api for the vendor's current step and saves it. Call it when a
   * screen opens: the answer replaces whatever was saved. Calls that overlap
   * share one request.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @returns The step.
   */
  async refreshStep({
    vendor,
  }: {
    vendor: OnboardingVendor;
  }): Promise<KycStep> {
    return this.#readStep(vendor, { join: true });
  }

  /**
   * Records the user's acceptance of the vendor's terms with kyc-api right
   * away. Nothing is kept on the phone, so there is no draft that the server
   * does not know about.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.disclaimerIds - Accepted terms ids from the vendor catalog.
   * @param params.country - ISO 3166-1 alpha-3 country the terms were
   * fetched for.
   * @returns The step the user is on once the terms are recorded.
   */
  async acceptTerms(params: {
    vendor: OnboardingVendor;
    disclaimerIds: string[];
    country?: string;
  }): Promise<KycStep> {
    await this.messenger.call('KycService:acceptVendorTerms', {
      vendor: params.vendor,
      disclaimerIds: params.disclaimerIds,
      ...(params.country ? { country: params.country } : {}),
    });
    return this.#readStep(params.vendor, { join: false });
  }

  /**
   * Starts linking the user's account at the vendor (Kalshi), then reads the
   * next step.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.email - The email the vendor sends its code to.
   * @returns The next step.
   */
  async startAccountLink(params: {
    vendor: OnboardingVendor;
    email: string;
  }): Promise<KycStep> {
    await this.#requireAdapter(params.vendor).startLink({
      email: params.email,
    });
    return this.#readStep(params.vendor, { join: false });
  }

  /**
   * Verifies the code the vendor sent for the account link, then reads the
   * next step.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.code - The code from the user.
   * @returns The next step, and the MFA method the vendor wants, if any. The
   * MFA method is not kept: the screen asks for the code and calls this
   * again.
   */
  async verifyAccountLink(params: {
    vendor: OnboardingVendor;
    code: string;
  }): Promise<{ step: KycStep; mfaMethod?: KycAccountLinkMfaMethod }> {
    const { mfaMethod } = await this.#requireAdapter(params.vendor).verifyLink({
      code: params.code,
    });
    const step = await this.#readStep(params.vendor, { join: false });
    return { step, ...(mfaMethod ? { mfaMethod } : {}) };
  }

  /**
   * Opens the vendor's UKYC session, or picks up the one kyc-api already has,
   * then reads the next step. Call it from the step that asks for MFA
   * (`confirm_identity`), with the token MFA returned.
   *
   * A new session creates the user's `local_user_secret` when it is missing,
   * then wraps the encryption key and a capability token for idOS. An existing
   * session only gets fresh authorizations if its status says they are
   * `new` or `expired`, so a reinstall or a second device carries on where the
   * user left off.
   *
   * This does not create a vendor customer. A vendor that needs one before
   * its session (Iron) adds that when it moves to this controller.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.aal2Token - AAL2 token from MFA. Required only when a new
   * session has to be created. Omit it to pick up an existing session.
   * @returns The step the user is on once the session exists.
   */
  async startSession(params: {
    vendor: OnboardingVendor;
    aal2Token?: string;
  }): Promise<KycStep> {
    const { vendor } = params;
    const existing = await this.messenger.call(
      'KycService:getSessionStatusForVendor',
      vendor,
    );

    if (existing) {
      this.#write(vendor, { sessionId: existing.id });
      if (needsCapabilityAuthorizationRefresh(existing)) {
        await refreshSessionAuthorizations({
          deps: this.#getSessionDeps(),
          sessionId: existing.id,
        });
      }
      return this.#readStep(vendor, { join: false });
    }

    if (!params.aal2Token) {
      throw new Error(
        'VendorOnboardingController.startSession: aal2Token is required to create a KYC session.',
      );
    }
    const residenceCountry = await this.messenger.call(
      'KycService:getGeoCountry',
    );
    const session = await createAuthorizedSession({
      deps: this.#getSessionDeps(),
      vendor,
      residenceCountry,
      aal2Token: params.aal2Token,
      partnerIdentityToken: await this.#mintPartnerIdentityToken(),
    });
    this.#write(vendor, { sessionId: session.id });
    return this.#readStep(vendor, { join: false });
  }

  /**
   * Fetches the idOS and identity provider (SumSub) documents the user
   * consents to once the vendor session exists, with which ones are already
   * consented. Nothing is saved on the phone.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @returns The documents and the reusability consent.
   */
  async fetchSessionDisclaimers({
    vendor,
  }: {
    vendor: OnboardingVendor;
  }): Promise<KycSessionDisclaimers> {
    const sessionId = await this.#getSessionId(vendor);
    return this.messenger.call(
      'KycService:fetchSessionDisclaimersBySessionId',
      {
        sessionId,
      },
    );
  }

  /**
   * Records the user's idOS and identity provider consents with kyc-api right
   * away, then reads the next step. Nothing is kept on the phone.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.idOS - Accepted idOS documents (`key` and `version` from
   * {@link VendorOnboardingController.fetchSessionDisclaimers}).
   * @param params.kycProvider - Accepted identity provider documents.
   * @param params.credentialReusabilityConsentGiven - Whether the user lets
   * idOS reuse their existing credentials. The screen asks for it, so it is
   * an argument and never a default.
   * @returns The next step.
   */
  async acceptSessionDisclaimers(params: {
    vendor: OnboardingVendor;
    idOS: KycConsentRecord[];
    kycProvider: KycConsentRecord[];
    credentialReusabilityConsentGiven: boolean;
  }): Promise<KycStep> {
    const sessionId = await this.#getSessionId(params.vendor);
    await this.messenger.call('KycService:submitSessionDisclaimers', {
      sessionId,
      idOS: params.idOS,
      kycProvider: params.kycProvider,
      credentialReusabilityConsentGiven:
        params.credentialReusabilityConsentGiven,
    });
    return this.#readStep(params.vendor, { join: false });
  }

  /**
   * Presents the identity provider flow (SumSub) for the vendor's session.
   * When the user finishes it, the next step is read: kyc-api works out from
   * the relay whether idOS still needs anything. Nothing about the flow is
   * kept on
   * the phone.
   *
   * The session must already have its authorizations (see
   * {@link VendorOnboardingController.startSession}) and its consents (see
   * {@link VendorOnboardingController.acceptSessionDisclaimers}).
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.locale - BCP-47 locale for the SDK UI.
   * @param params.debug - Enables SDK debug logging.
   * @returns How the flow ended.
   */
  async launchProviderFlow(params: {
    vendor: OnboardingVendor;
    locale?: string;
    debug?: boolean;
  }): Promise<OnboardingProviderOutcome> {
    const launcher = this.#sumsubLauncher;
    if (!launcher?.isAvailable()) {
      return 'failed';
    }
    try {
      const sessionId = await this.#getSessionId(params.vendor);
      const { applicantAccessToken } = await this.messenger.call(
        'KycService:createJourney',
        sessionId,
      );

      // A resolved `launch` alone does not mean success: the user may have
      // closed the SDK, or the SDK may have reported that it could not run.
      let submitted = false;
      let sdkFailed = false;
      const result = await launcher.launch({
        applicantAccessToken,
        onTokenExpiration: async () => {
          const journey = await this.messenger.call(
            'KycService:createJourney',
            sessionId,
          );
          return journey.applicantAccessToken;
        },
        onStatusChange: (_previous, next) => {
          // A review decision keeps the previous value, so a decision the SDK
          // opens on is not a submission but one that follows it still is.
          if (isSumSubSubmissionStatus(next)) {
            submitted = true;
          } else if (isSumSubPreSubmissionStatus(next)) {
            submitted = false;
          }
          sdkFailed ||= isSumSubFlowFailed(next);
        },
        locale: params.locale ?? 'en',
        debug: params.debug ?? false,
      });
      // Some native SDKs resolve with their final status without first
      // delivering the state-change callback.
      submitted ||= isSumSubSubmissionStatus(result.status);
      sdkFailed ||= isSumSubFlowFailed(result.status);

      if (sdkFailed) {
        return 'failed';
      }
      if (!submitted) {
        return 'abandoned';
      }
      // The SDK result is not the decision. kyc-api and the relay decide, so
      // ask where the user is now rather than assuming.
      await this.#readStep(params.vendor, { join: false });
      return 'submitted';
    } catch {
      return 'failed';
    }
  }

  /**
   * Sends the vendor's SMS code to the phone number.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.phoneNumber - The phone number in E.164 format.
   * @returns The next step.
   */
  async submitPhone(params: {
    vendor: OnboardingVendor;
    phoneNumber: string;
  }): Promise<KycStep> {
    return this.#runOnboardingStep(params.vendor, 'phone/send-otp', {
      phoneNumber: params.phoneNumber,
    });
  }

  /**
   * Verifies the vendor's SMS code.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.code - The code from the user.
   * @returns The next step.
   */
  async submitPhoneCode(params: {
    vendor: OnboardingVendor;
    code: string;
  }): Promise<KycStep> {
    return this.#runOnboardingStep(params.vendor, 'phone/verify-otp', {
      otp: params.code,
    });
  }

  /**
   * Verifies the vendor's email code.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.code - The code from the user.
   * @returns The next step.
   */
  async submitEmailCode(params: {
    vendor: OnboardingVendor;
    code: string;
  }): Promise<KycStep> {
    return this.#runOnboardingStep(params.vendor, 'email/verify-otp', {
      otp: params.code,
    });
  }

  /**
   * Sends the vendor's email code again.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @returns The next step.
   */
  async resendEmailCode(params: {
    vendor: OnboardingVendor;
  }): Promise<KycStep> {
    return this.#runOnboardingStep(params.vendor, 'email/resend-otp');
  }

  /**
   * Forgets what the phone saved, for one vendor or all of them. kyc-api
   * keeps its own record, so the next refresh brings the step back.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor to forget. Omit to forget all.
   */
  reset({ vendor }: { vendor?: OnboardingVendor } = {}): void {
    // Outdate any step read in flight, so its answer cannot bring back the
    // entry being forgotten.
    const vendors = vendor
      ? [vendor]
      : (Object.keys(this.#stepRequests) as OnboardingVendor[]);
    for (const each of vendors) {
      this.#stepRequests[each] = (this.#stepRequests[each] ?? 0) + 1;
      delete this.#stepReads[each];
    }
    this.update((state) => {
      if (vendor) {
        delete state.vendors[vendor];
      } else {
        state.vendors = {};
      }
    });
  }

  /**
   * The calls session authorization makes, on this controller's messenger.
   *
   * @returns The calls.
   */
  #getSessionDeps(): UkycSessionDeps {
    return {
      createUkycSession: async (params) =>
        this.messenger.call('KycService:createUkycSession', params),
      resetWrappingKeys: async (params) =>
        this.messenger.call('KycService:resetWrappingKeys', params),
      setAuthorizations: async (params) =>
        this.messenger.call('KycService:setAuthorizations', params),
      fetchIdosEnclaveJwks: async () =>
        this.messenger.call('KycService:fetchIdosEnclaveJwks'),
      fetchIdosRelayJwks: async () =>
        this.messenger.call('KycService:fetchIdosRelayJwks'),
      localUserSecretStore: {
        get: async (path, entropySourceId) =>
          this.messenger.call(
            'UserStorageController:performGetStorage',
            path as `${string}.${string}`,
            entropySourceId,
          ),
        set: async (path, value, entropySourceId) =>
          this.messenger.call(
            'UserStorageController:performSetStorage',
            path as `${string}.${string}`,
            value,
            entropySourceId,
          ),
      },
    };
  }

  async #runOnboardingStep(
    vendor: OnboardingVendor,
    step: KycOnboardingStep,
    body?: Record<string, string>,
  ): Promise<KycStep> {
    const sessionId = await this.#getSessionId(vendor);
    await this.messenger.call('KycService:postOnboardingStep', {
      sessionId,
      step,
      ...(body ? { body } : {}),
    });
    return this.#readStep(vendor, { join: false });
  }

  /**
   * Gets the vendor's session id from what the phone saved, or from kyc-api
   * when the phone has none (a reinstall).
   *
   * @param vendor - The vendor.
   * @returns The session id.
   */
  async #getSessionId(vendor: OnboardingVendor): Promise<string> {
    const saved = this.state.vendors[vendor]?.sessionId;
    if (saved) {
      return saved;
    }
    const status = await this.messenger.call(
      'KycService:getSessionStatusForVendor',
      vendor,
    );
    if (!status) {
      throw new Error(
        `VendorOnboardingController: no ${vendor} session to continue.`,
      );
    }
    this.#write(vendor, { sessionId: status.id });
    return status.id;
  }

  #requireAdapter(vendor: OnboardingVendor): KycAccountLinkAdapter {
    const adapter = this.#accountLinkAdapters[vendor];
    if (!adapter) {
      throw new Error(
        `VendorOnboardingController: no account link adapter for ${vendor}.`,
      );
    }
    return adapter;
  }

  /**
   * Mints the partner identity token kyc-api takes the session's email from.
   *
   * The consent has to be recorded first: MetaMask Auth answers
   * `403 consent_required` for an audience the user has not granted, so the
   * two calls always go together.
   *
   * @returns The minted token.
   */
  async #mintPartnerIdentityToken(): Promise<string> {
    // TODO: use the vendor's own audience once MetaMask Auth has one for it.
    // `IdentitySharingAudience` is `'kyc' | 'iron'`, so a Kalshi onboarding
    // currently records an Iron consent. Tracked with the matching mapping in
    // kyc-api's `createSession`.
    const audience = 'iron';
    await this.messenger.call(
      'AuthenticatedUserStorageService:putIdentitySharingConsent',
      { audience, granted: true },
    );
    return this.messenger.call(
      'AuthenticationController:getPartnerIdentityToken',
      ['email'],
      audience,
    );
  }

  /**
   * What only this device knows, sent with every step request.
   *
   * Empty for Kalshi: kyc-api records its terms as they are accepted, so
   * there is nothing the server cannot already see.
   *
   * @param _vendor - The vendor the step is being read for.
   * @returns The client context to send.
   */
  #clientContext(_vendor: OnboardingVendor): KycClientContext {
    return {};
  }

  /**
   * Asks kyc-api for the step and saves it.
   *
   * A caller that only wants the current step (a screen opening, a poll)
   * joins a read already in flight. A caller that has just changed something
   * at kyc-api never joins one: that read may have started before the change
   * and would answer with the old step.
   *
   * @param vendor - The vendor.
   * @param options - The options.
   * @param options.join - Whether to share a read already in flight.
   * @returns The step.
   */
  async #readStep(
    vendor: OnboardingVendor,
    { join }: { join: boolean },
  ): Promise<KycStep> {
    const inflight = this.#stepReads[vendor];
    if (join && inflight) {
      return inflight;
    }
    const request = (this.#stepRequests[vendor] ?? 0) + 1;
    this.#stepRequests[vendor] = request;
    const read = (async (): Promise<KycStep> => {
      try {
        const info = await this.messenger.call(
          'KycService:getStep',
          vendor,
          this.#clientContext(vendor),
        );
        // Drop the answer when a newer read started while this was in
        // flight, so a slow read cannot overwrite a fresher step.
        if (this.#stepRequests[vendor] === request) {
          this.#write(vendor, { step: info.step, status: info.status });
        }
        return info.step;
      } finally {
        // A newer read has taken over from this one.
        if (this.#stepRequests[vendor] === request) {
          delete this.#stepReads[vendor];
        }
      }
    })();
    this.#stepReads[vendor] = read;
    return read;
  }

  #write(
    vendor: OnboardingVendor,
    patch: Partial<OnboardingVendorState>,
  ): void {
    this.update((state) => {
      const entry = state.vendors[vendor] ?? {
        step: null,
        status: null,
        sessionId: null,
      };
      state.vendors[vendor] = { ...entry, ...patch };
    });
  }
}
