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
import { base64ToBytes, bytesToString, stringToBytes } from '@metamask/utils';

import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import {
  isSumSubFlowFailed,
  isSumSubPreSubmissionStatus,
  isSumSubSubmissionStatus,
} from './providers/sumsub.js';
import type { KycSumSubLauncher } from './providers/sumsub.js';
import { KYC_SIGNED_REQUEST_LIMITS, KYC_VENDOR_SIGN_PATHS } from './types.js';
import type {
  KalshiRequestSigner,
  KycClientContext,
  KycConsentRecord,
  KycSignedRequest,
  KycVendorSignRequest,
  OnboardingVendor,
  KycSessionDisclaimers,
  KycStep,
  KycStepStatus,
} from './types.js';
import { UkycLocalUserSecretStore } from './ukyc/localUserSecret.js';
import { createUkycSession } from './ukyc/sessionAuthorization.js';
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
  /**
   * Whether the user finished MetaMask's MFA on this device. It comes before
   * any session exists, so kyc-api cannot see it yet. Sent with every step
   * read as `mfaCompleted`.
   */
  mfaCompleted: boolean;
  /**
   * Catalog ids of the vendor terms the user accepted on this device. Sent
   * with every step read, and dropped once the session holds its consents.
   */
  acceptedDisclaimerIds: string[];
  /** ISO 3166-1 alpha-3 country the accepted terms were fetched for. */
  termsCountry: string | null;
  /**
   * The idOS and identity provider consents the user gave on the terms
   * pages. They wait here until a session exists to receive them.
   */
  pendingConsents: PendingSessionConsents | null;
};

/**
 * Session-scoped consents held on the phone until the session exists. The
 * same fields as {@link KycService.submitSessionDisclaimers}, minus the
 * session id.
 */
export type PendingSessionConsents = {
  idOS: KycConsentRecord[];
  kycProvider: KycConsentRecord[];
  credentialReusabilityConsentGiven: boolean;
};

/**
 * The state a vendor has before anything is saved for it.
 *
 * @returns The empty vendor state.
 */
function getDefaultVendorState(): OnboardingVendorState {
  return {
    step: null,
    status: null,
    sessionId: null,
    mfaCompleted: false,
    acceptedDisclaimerIds: [],
    termsCountry: null,
    pendingConsents: null,
  };
}

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

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'refreshStep',
  'recordMfaCompleted',
  'submitTerms',
  'startSession',
  'getPartnerEmail',
  'fetchSessionDisclaimers',
  'recordSessionDisclaimers',
  'launchProviderFlow',
  'sendPhoneOtp',
  'verifyPhoneOtp',
  'verifyEmailOtp',
  'sendEmailOtp',
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
 * Terms for Kalshi. The idOS and identity provider consents are kept on the
 * phone until the session exists, so they travel with the terms.
 */
export type SubmitKalshiTermsParams = {
  vendor: 'kalshi';
  disclaimerIds: string[];
  country: string;
  idOS: KycConsentRecord[];
  kycProvider: KycConsentRecord[];
  credentialReusabilityConsentGiven: boolean;
};

/**
 * Terms for a vendor whose acceptance goes straight to kyc-api.
 */
export type SubmitVendorTermsParams = {
  vendor: Exclude<OnboardingVendor, 'kalshi'>;
  disclaimerIds: string[];
  country?: string;
};

/**
 * Options for constructing a {@link VendorOnboardingController}.
 */
export type VendorOnboardingControllerOptions = {
  messenger: VendorOnboardingControllerMessenger;
  state?: Partial<VendorOnboardingControllerState>;
  /**
   * Signs the Kalshi calls with the device key. Only needed for Kalshi, whose
   * email link the relay forwards. The controller chooses the calls. The
   * signer does not send them.
   */
  kalshiRequestSigner?: KalshiRequestSigner;
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
  readonly #kalshiRequestSigner?: KalshiRequestSigner;

  readonly #localUserSecretStore: UkycLocalUserSecretStore;

  readonly #sumsubLauncher?: KycSumSubLauncher;

  /**
   * The step read in flight per vendor, which a plain `refreshStep` joins
   * instead of starting its own. Every other path starts its own read, so an
   * action never reports a step computed before it ran. A read saves its
   * answer only while it is still the one stored here, so a later read or a
   * `reset` wins over a slow response.
   */
  readonly #readStepPromises: Partial<
    Record<OnboardingVendor, Promise<KycStep>>
  > = {};

  /**
   * Constructs a new {@link VendorOnboardingController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - Partial initial state; merged over defaults.
   * @param options.kalshiRequestSigner - Signs the Kalshi calls with the device
   * key. The controller chooses the calls.
   * @param options.sumsubLauncher - The platform SumSub launcher adapter.
   */
  constructor({
    messenger,
    state,
    kalshiRequestSigner,
    sumsubLauncher,
  }: VendorOnboardingControllerOptions) {
    super({
      messenger,
      metadata: vendorOnboardingControllerMetadata,
      name: vendorOnboardingControllerName,
      state: { ...getDefaultVendorOnboardingControllerState(), ...state },
    });

    this.#kalshiRequestSigner = kalshiRequestSigner;
    this.#sumsubLauncher = sumsubLauncher;
    this.#localUserSecretStore = new UkycLocalUserSecretStore(this.messenger);

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
    return this.#readStep(vendor);
  }

  /**
   * Records that the user finished MetaMask's MFA on this device, then reads
   * the step. Call it when MFA succeeds, before any session exists: kyc-api
   * cannot see MFA until the session is created, and without this it would
   * ask for MFA again.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @returns The next step.
   */
  async recordMfaCompleted(params: {
    vendor: OnboardingVendor;
  }): Promise<KycStep> {
    this.#write(params.vendor, { mfaCompleted: true });
    return this.#readStep(params.vendor, { supersede: true });
  }

  /**
   * Records the user's acceptance of the vendor's terms, then reads the step.
   *
   * Kalshi keeps the acceptance and the idOS and identity provider consents on
   * the phone until the session exists. Nothing goes to kyc-api yet, because
   * kyc-api only takes consents on a session. If a session already exists the
   * consents are posted to it straight away.
   *
   * Other vendors send the acceptance to kyc-api right away.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.disclaimerIds - Accepted terms ids from the vendor catalog.
   * @param params.country - ISO 3166-1 alpha-3 country the terms were fetched
   * for.
   * @param params.idOS - Kalshi only. Accepted idOS documents (`key` and
   * `version` from {@link KycService.fetchSessionDisclaimersByCountry}).
   * @param params.kycProvider - Kalshi only. Accepted identity provider
   * documents.
   * @param params.credentialReusabilityConsentGiven - Kalshi only. Whether the
   * user lets idOS reuse their existing credentials. The screen asks for it,
   * so it is an argument and never a default.
   * @returns The step the user is on once the terms are recorded.
   */
  async submitTerms(
    params: SubmitKalshiTermsParams | SubmitVendorTermsParams,
  ): Promise<KycStep> {
    if (params.vendor === 'kalshi') {
      this.#write('kalshi', {
        acceptedDisclaimerIds: [...params.disclaimerIds],
        termsCountry: params.country,
        pendingConsents: {
          idOS: params.idOS,
          kycProvider: params.kycProvider,
          credentialReusabilityConsentGiven:
            params.credentialReusabilityConsentGiven,
        },
      });
      const existing = await this.messenger.call(
        'KycService:getSessionStatusForVendor',
        'kalshi',
      );
      if (existing) {
        this.#write('kalshi', { sessionId: existing.id });
        await this.#postPendingConsents('kalshi', existing.id);
      }
      return this.#readStep('kalshi', { supersede: true });
    }
    await this.messenger.call('KycService:acceptVendorTerms', {
      vendor: params.vendor,
      disclaimerIds: params.disclaimerIds,
      ...(params.country ? { country: params.country } : {}),
    });
    return this.#readStep(params.vendor, { supersede: true });
  }

  /**
   * Opens the vendor's UKYC session, or picks up the one kyc-api already has,
   * then reads the next step. Call it from the step that asks for MFA
   * (`mfa`), with the token MFA returned.
   *
   * A new session creates the user's `local_user_secret` when it is missing,
   * then wraps the encryption key and a capability token for idOS. The
   * consents the user gave on the terms pages are posted to the new session,
   * then cleared from the phone. An existing session is picked up as it is:
   * its authorizations are left alone.
   *
   * This does not create a vendor customer. A vendor that needs one before
   * its session (Iron) adds that when it moves to this controller.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.aal2Token - AAL2 token from MFA. Required only when a new
   * session has to be created. Omit it to pick up an existing session. Held
   * in memory by the caller and never saved here.
   * @param params.email - The Kalshi email the phone signs into `users/link`.
   * Required when creating a Kalshi session, and when resuming one to send a
   * code to a new address. kyc-api does not receive it: the relay is given the
   * verified email from the partner identity token, so this must be that
   * address.
   * @returns The step the user is on once the session exists.
   */
  async startSession(params: {
    vendor: OnboardingVendor;
    aal2Token?: string;
    email?: string;
  }): Promise<KycStep> {
    const { vendor } = params;
    const existing = await this.messenger.call(
      'KycService:getSessionStatusForVendor',
      vendor,
    );

    if (existing) {
      return this.#resumeSession(vendor, existing.id, params.email);
    }

    if (!params.aal2Token) {
      throw new Error(
        'VendorOnboardingController.startSession: aal2Token is required to create a KYC session.',
      );
    }
    const typedEmail =
      vendor === 'kalshi'
        ? this.#requireKalshiEmail(params.email?.trim())
        : undefined;
    const residenceCountry = await this.messenger.call(
      'KycService:getGeoCountry',
    );
    // kyc-api takes the session's email from this token's verified `ext.email`.
    // The phone signs that same address into `users/link`; it is not sent
    // beside the signed calls.
    const partnerIdentityToken = await this.#mintPartnerIdentityToken(vendor);
    const email =
      typedEmail === undefined
        ? undefined
        : this.#matchVerifiedEmail(typedEmail, partnerIdentityToken);
    // A signature lasts 60 seconds, so this is the last thing before the
    // call that carries it.
    const signedRequests =
      email === undefined
        ? undefined
        : await this.#signKalshiRequests([
            { operation: 'enrollment/intents' },
            { operation: 'users/link', email },
          ]);
    const session = await createUkycSession({
      messenger: this.messenger,
      localUserSecretStore: this.#localUserSecretStore,
      vendor,
      residenceCountry,
      aal2Token: params.aal2Token,
      partnerIdentityToken,
      ...(signedRequests && { signedRequests }),
    });
    // Saved before the consents are posted, so a failed post can be retried
    // against this session instead of opening a second one.
    this.#write(vendor, { sessionId: session.id });
    await this.#postPendingConsents(vendor, session.id);
    return this.#readStep(vendor, { supersede: true });
  }

  /**
   * The verified MetaMask email the vendor's session is opened with: the
   * address a screen should start its email field with. Reads it from a
   * partner identity token minted for the vendor.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @returns The email, or `undefined` when the token carries none.
   */
  async getPartnerEmail({
    vendor,
  }: {
    vendor: OnboardingVendor;
  }): Promise<string | undefined> {
    return verifiedEmailOf(await this.#mintPartnerIdentityToken(vendor));
  }

  /**
   * Picks up a session kyc-api already has. Posts any consents still waiting
   * on the phone. When an email is given and no consents were waiting, sends
   * a code to that address.
   *
   * @param vendor - The vendor.
   * @param sessionId - The existing session's id.
   * @param email - The Kalshi email to send a code to, if the user gave one.
   * @returns The next step.
   */
  async #resumeSession(
    vendor: OnboardingVendor,
    sessionId: string,
    email: string | undefined,
  ): Promise<KycStep> {
    this.#write(vendor, { sessionId });
    if (this.state.vendors[vendor]?.pendingConsents) {
      await this.#postPendingConsents(vendor, sessionId);
    } else if (vendor === 'kalshi' && email !== undefined) {
      const [signedRequest] = await this.#signKalshiRequests([
        {
          operation: 'users/link',
          email: this.#requireKalshiEmail(email.trim()),
        },
      ]);
      await this.messenger.call('KycService:sendEmailOtp', {
        sessionId,
        signedRequest,
      });
    }
    return this.#readStep(vendor, { supersede: true });
  }

  /**
   * Posts the consents waiting on the phone to the session, then forgets the
   * terms and consents that were kept for the session. Does nothing when
   * nothing is waiting.
   *
   * Forgetting them only after kyc-api has them means a failed post is tried
   * again, and the terms phase keeps counting the ids until then.
   *
   * @param vendor - The vendor.
   * @param sessionId - The session to post the consents to.
   */
  async #postPendingConsents(
    vendor: OnboardingVendor,
    sessionId: string,
  ): Promise<void> {
    const pending = this.state.vendors[vendor]?.pendingConsents;
    if (!pending) {
      return;
    }
    await this.messenger.call('KycService:submitSessionDisclaimers', {
      sessionId,
      idOS: pending.idOS,
      kycProvider: pending.kycProvider,
      credentialReusabilityConsentGiven:
        pending.credentialReusabilityConsentGiven,
    });
    this.#write(vendor, {
      acceptedDisclaimerIds: [],
      termsCountry: null,
      pendingConsents: null,
    });
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
  async recordSessionDisclaimers(params: {
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
    return this.#readStep(params.vendor, { supersede: true });
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
   * {@link VendorOnboardingController.recordSessionDisclaimers}).
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
      await this.#readStep(params.vendor, { supersede: true });
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
  async sendPhoneOtp(params: {
    vendor: OnboardingVendor;
    phoneNumber: string;
  }): Promise<KycStep> {
    const sessionId = await this.#getSessionId(params.vendor);
    await this.messenger.call('KycService:sendPhoneOtp', {
      sessionId,
      phoneNumber: params.phoneNumber,
    });
    return this.#readStep(params.vendor, { supersede: true });
  }

  /**
   * Verifies the vendor's SMS code.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.code - The code from the user.
   * @returns The next step.
   */
  async verifyPhoneOtp(params: {
    vendor: OnboardingVendor;
    code: string;
  }): Promise<KycStep> {
    const sessionId = await this.#getSessionId(params.vendor);
    await this.messenger.call('KycService:verifyPhoneOtp', {
      sessionId,
      otp: params.code,
    });
    return this.#readStep(params.vendor, { supersede: true });
  }

  /**
   * Verifies the vendor's email code.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.code - The code from the user.
   * @returns The next step.
   */
  async verifyEmailOtp(params: {
    vendor: OnboardingVendor;
    code: string;
  }): Promise<KycStep> {
    if (params.vendor !== 'kalshi') {
      const sessionId = await this.#getSessionId(params.vendor);
      await this.messenger.call('KycService:verifyEmailOtp', {
        sessionId,
        otp: params.code,
      });
      return this.#readStep(params.vendor, { supersede: true });
    }
    const [signedRequest] = await this.#signKalshiRequests([
      { operation: 'users/link/verify', code: params.code },
    ]);
    const sessionId = await this.#getSessionId(params.vendor);
    await this.messenger.call('KycService:verifyEmailOtp', {
      sessionId,
      signedRequest,
    });
    return this.#readStep(params.vendor, { supersede: true });
  }

  /**
   * Sends the vendor's email code again.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @param params.email - The Kalshi email to sign into the new `users/link`.
   * Required for Kalshi, including when the user corrects the address.
   * @returns The next step.
   */
  async sendEmailOtp(params: {
    vendor: OnboardingVendor;
    email?: string;
  }): Promise<KycStep> {
    if (params.vendor !== 'kalshi') {
      const sessionId = await this.#getSessionId(params.vendor);
      await this.messenger.call('KycService:sendEmailOtp', { sessionId });
      return this.#readStep(params.vendor, { supersede: true });
    }
    const [signedRequest] = await this.#signKalshiRequests([
      {
        operation: 'users/link',
        email: this.#requireKalshiEmail(params.email?.trim()),
      },
    ]);
    const sessionId = await this.#getSessionId(params.vendor);
    await this.messenger.call('KycService:sendEmailOtp', {
      sessionId,
      signedRequest,
    });
    return this.#readStep(params.vendor, { supersede: true });
  }

  /**
   * Forgets what the phone saved, for one vendor or all of them. kyc-api
   * keeps its own record, so the next refresh brings the step back.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor to forget. Omit to forget all.
   */
  reset({ vendor }: { vendor?: OnboardingVendor } = {}): void {
    // Drop any step read in flight, so its answer cannot bring back the
    // entry being forgotten.
    const vendors = vendor
      ? [vendor]
      : (Object.keys(this.#readStepPromises) as OnboardingVendor[]);
    for (const each of vendors) {
      delete this.#readStepPromises[each];
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

  /**
   * The relay creates the Kalshi account from the verified email in the
   * partner identity token and rejects a signed `users/link` for any other
   * address (`kalshi_signed_request_email_mismatch`). The address signed to
   * open a session is therefore the token's, matched to what the user typed
   * without regard to letter case, and a different address is refused here
   * with the right one named instead of at the relay. A token whose email
   * cannot be read is left to the relay.
   *
   * @param typed - The address the user typed.
   * @param partnerIdentityToken - The token the session is created with.
   * @returns The address to sign.
   */
  #matchVerifiedEmail(typed: string, partnerIdentityToken: string): string {
    const verified = verifiedEmailOf(partnerIdentityToken);
    if (verified === undefined) {
      return typed;
    }
    if (verified.toLowerCase() !== typed.toLowerCase()) {
      throw new Error(
        `Kalshi has to be linked to your MetaMask email, ${verified}.`,
      );
    }
    return verified;
  }

  /**
   * The Kalshi email the signed `users/link` body carries.
   *
   * @param email - The trimmed address, when the caller passed one.
   * @returns The address.
   */
  #requireKalshiEmail(email: string | undefined): string {
    if (!email) {
      throw new Error(
        'VendorOnboardingController: a Kalshi email is required to sign users/link.',
      );
    }
    return email;
  }

  /**
   * Signs the Kalshi calls and checks the signer answered each one, in order.
   *
   * @param requests - The calls to sign.
   * @returns The signed calls, in the same order.
   */
  async #signKalshiRequests(
    requests: readonly KycVendorSignRequest[],
  ): Promise<readonly KycSignedRequest[]> {
    const signer = this.#kalshiRequestSigner;
    if (!signer) {
      throw new Error('VendorOnboardingController: no Kalshi request signer.');
    }
    const signed = await signer({ requests });
    if (
      signed.length !== requests.length ||
      signed.some(
        (each, index) =>
          each.path !== KYC_VENDOR_SIGN_PATHS[requests[index]?.operation],
      )
    ) {
      throw new Error(
        'VendorOnboardingController: Kalshi signer did not return the requested calls.',
      );
    }
    const invalid = signed.find((each) => !isWithinSignedRequestLimits(each));
    if (invalid) {
      throw new Error(
        `VendorOnboardingController: Kalshi signer returned a request kyc-api would refuse (at most ${KYC_SIGNED_REQUEST_LIMITS.headerCount} headers, all strings, and ${KYC_SIGNED_REQUEST_LIMITS.bodyBytes} body bytes).`,
      );
    }
    return signed;
  }

  /**
   * Mints the partner identity token kyc-api takes the session's email from.
   * The token's audience is the vendor, so each vendor gets its own consent.
   *
   * The consent has to be recorded first: MetaMask Auth answers
   * `403 consent_required` for an audience the user has not granted, so the
   * two calls always go together.
   *
   * @param vendor - The vendor the token is minted for.
   * @returns The minted token.
   */
  async #mintPartnerIdentityToken(vendor: OnboardingVendor): Promise<string> {
    const audience = vendor;
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
   * What only this device knows, sent with every step request: the terms it
   * accepted, the country they were fetched for, and whether MFA is done
   * before a session exists. kyc-api reads it for that answer and keeps none
   * of it.
   *
   * @param vendor - The vendor the step is being read for.
   * @returns The client context to send.
   */
  #clientContext(vendor: OnboardingVendor): KycClientContext {
    const entry = this.state.vendors[vendor];
    const acceptedDisclaimerIds = entry?.acceptedDisclaimerIds ?? [];
    return {
      ...(acceptedDisclaimerIds.length > 0 && { acceptedDisclaimerIds }),
      ...(entry?.termsCountry && { country: entry.termsCountry }),
      ...(entry?.mfaCompleted === true && { mfaCompleted: true }),
    };
  }

  /**
   * Asks kyc-api for the step and saves it.
   *
   * A caller that only wants the current step (a screen opening, a poll)
   * joins a read already in flight. A caller that has just changed something
   * at kyc-api supersedes it: that read may have started before the change
   * and would answer with the old step.
   *
   * @param vendor - The vendor.
   * @param options - The options.
   * @param options.supersede - Whether to start a new read instead of joining
   * one already in flight. Defaults to `false`.
   * @returns The step.
   */
  async #readStep(
    vendor: OnboardingVendor,
    { supersede = false }: { supersede?: boolean } = {},
  ): Promise<KycStep> {
    const inflight = this.#readStepPromises[vendor];
    if (!supersede && inflight) {
      return inflight;
    }
    // `let` so the closure can see the promise it is assigning. The binding
    // is written once, before the first await resumes.
    // oxlint-disable-next-line prefer-const
    let read!: Promise<KycStep>;
    read = (async (): Promise<KycStep> => {
      try {
        const info = await this.messenger.call(
          'KycService:getStep',
          vendor,
          this.#clientContext(vendor),
        );
        // A later read, or a reset, has taken this slot.
        if (this.#readStepPromises[vendor] === read) {
          this.#write(vendor, { step: info.step, status: info.status });
        }
        return info.step;
      } finally {
        if (this.#readStepPromises[vendor] === read) {
          delete this.#readStepPromises[vendor];
        }
      }
    })();
    this.#readStepPromises[vendor] = read;
    return read;
  }

  #write(
    vendor: OnboardingVendor,
    patch: Partial<OnboardingVendorState>,
  ): void {
    this.update((state) => {
      // Fills in fields an entry saved before they existed.
      state.vendors[vendor] = {
        ...getDefaultVendorState(),
        ...state.vendors[vendor],
        ...patch,
      };
    });
  }
}

/**
 * The verified email a partner identity token carries in `ext.email`. The
 * signature is not checked here: kyc-api verifies the token, and this only
 * tells the screen which address the session will be opened with.
 *
 * @param token - The partner identity token (a JWT).
 * @returns The email, or `undefined` when the token has none or is not a JWT.
 */
function verifiedEmailOf(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) {
    return undefined;
  }
  try {
    const base64 = payload.replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const claims = JSON.parse(bytesToString(base64ToBytes(padded))) as {
      ext?: { email?: unknown };
    };
    const email = claims.ext?.email;
    return typeof email === 'string' && email.length > 0 ? email : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a signed request is within what kyc-api accepts: at most 16
 * headers that all hold strings, and a body of at most 4 KB. The body is the
 * exact string that was signed. The path is already pinned to the route.
 *
 * @param request - The request the signer returned.
 * @returns Whether kyc-api would take it.
 */
function isWithinSignedRequestLimits(request: KycSignedRequest): boolean {
  const headers = Object.values(request.headers);
  return (
    headers.length <= KYC_SIGNED_REQUEST_LIMITS.headerCount &&
    headers.every((value) => typeof value === 'string') &&
    stringToBytes(request.body).length <= KYC_SIGNED_REQUEST_LIMITS.bodyBytes
  );
}
