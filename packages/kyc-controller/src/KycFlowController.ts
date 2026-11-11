import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { KycFlowControllerMethodActions } from './KycFlowController-method-action-types.js';
import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import type { KycOnboardingStep } from './KycService.js';
import type { KycFlowVendor, KycStep } from './types.js';

// === GENERAL ===

/**
 * The name of the {@link KycFlowController}, used to namespace the
 * controller's actions and events.
 */
export const flowControllerName = 'KycFlowController';

// === STATE ===

/**
 * What the phone keeps for one vendor. Everything else is decided by kyc-api,
 * so nothing here can disagree with it: the step is a copy for the first
 * paint, and the session id is only a handle.
 */
export type KycFlowVendorState = {
  /** The last step kyc-api answered with. */
  step: KycStep;
  /** The vendor's UKYC session id, once one exists. */
  sessionId: string | null;
};

/**
 * State of the {@link KycFlowController}.
 */
export type KycFlowControllerState = {
  vendors: Partial<Record<KycFlowVendor, KycFlowVendorState>>;
};

const kycFlowControllerMetadata = {
  vendors: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
} satisfies StateMetadata<KycFlowControllerState>;

/**
 * Gets the default {@link KycFlowController} state.
 *
 * @returns The default state.
 */
export function getDefaultKycFlowControllerState(): KycFlowControllerState {
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
  verifyLink: (params: {
    code: string;
  }) => Promise<{ mfaMethod?: KycAccountLinkMfaMethod }>;
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'refreshStep',
  'acceptTerms',
  'startAccountLink',
  'verifyAccountLink',
  'submitPhone',
  'submitPhoneCode',
  'submitEmailCode',
  'resendEmailCode',
  'markProviderSubmitted',
  'reset',
] as const;

export type KycFlowControllerGetStateAction = ControllerGetStateAction<
  typeof flowControllerName,
  KycFlowControllerState
>;

export type KycFlowControllerActions =
  | KycFlowControllerGetStateAction
  | KycFlowControllerMethodActions;

type AllowedActions = KycServiceMethodActions;

export type KycFlowControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof flowControllerName,
  KycFlowControllerState
>;

export type KycFlowControllerEvents = KycFlowControllerStateChangeEvent;

type AllowedEvents = never;

/**
 * The messenger of the {@link KycFlowController}.
 */
export type KycFlowControllerMessenger = Messenger<
  typeof flowControllerName,
  KycFlowControllerActions | AllowedActions,
  KycFlowControllerEvents | AllowedEvents
>;

/**
 * Options for constructing a {@link KycFlowController}.
 */
export type KycFlowControllerOptions = {
  messenger: KycFlowControllerMessenger;
  state?: Partial<KycFlowControllerState>;
  /**
   * The device-signed account link calls, by vendor. Only needed for vendors
   * that link an account (Kalshi).
   */
  accountLinkAdapters?: Partial<Record<KycFlowVendor, KycAccountLinkAdapter>>;
};

// === CONTROLLER DEFINITION ===

/**
 * `KycFlowController` follows the step kyc-api decides for a vendor. Each
 * action goes to kyc-api and saves the step it answers with, so the client
 * never works out where the user is. It keeps only the step and the session
 * id per vendor: no terms, consents or account link state.
 *
 * It shares {@link KycService} with `KycController` and does not touch
 * `KycController` state, so a vendor can move to it on its own.
 */
export class KycFlowController extends BaseController<
  typeof flowControllerName,
  KycFlowControllerState,
  KycFlowControllerMessenger
> {
  readonly #accountLinkAdapters: Partial<
    Record<KycFlowVendor, KycAccountLinkAdapter>
  >;

  /**
   * The newest step request per vendor. An answer that arrives after a newer
   * request started is ignored, so a slow response cannot undo a later one.
   */
  readonly #stepRequests: Partial<Record<KycFlowVendor, number>> = {};

  /**
   * Constructs a new {@link KycFlowController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - Partial initial state; merged over defaults.
   * @param options.accountLinkAdapters - The device-signed account link
   * calls, by vendor.
   */
  constructor({
    messenger,
    state,
    accountLinkAdapters,
  }: KycFlowControllerOptions) {
    super({
      messenger,
      metadata: kycFlowControllerMetadata,
      name: flowControllerName,
      state: { ...getDefaultKycFlowControllerState(), ...state },
    });

    this.#accountLinkAdapters = accountLinkAdapters ?? {};

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Asks kyc-api for the vendor's current step and saves it. Call it when a
   * screen opens: the answer replaces whatever was saved.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @returns The step.
   */
  async refreshStep({ vendor }: { vendor: KycFlowVendor }): Promise<KycStep> {
    const request = (this.#stepRequests[vendor] ?? 0) + 1;
    this.#stepRequests[vendor] = request;
    const step = await this.messenger.call('KycService:getStep', vendor);
    // A newer request started while this one was in flight.
    if (this.#stepRequests[vendor] === request) {
      this.#writeStep(vendor, step);
    }
    return step;
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
   * @returns The next step.
   */
  async acceptTerms(params: {
    vendor: KycFlowVendor;
    disclaimerIds: string[];
    country?: string;
  }): Promise<KycStep> {
    const step = await this.messenger.call('KycService:acceptVendorTerms', {
      vendor: params.vendor,
      disclaimerIds: params.disclaimerIds,
      ...(params.country ? { country: params.country } : {}),
    });
    this.#writeStep(params.vendor, step);
    return step;
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
    vendor: KycFlowVendor;
    email: string;
  }): Promise<KycStep> {
    await this.#requireAdapter(params.vendor).startLink({
      email: params.email,
    });
    return this.refreshStep({ vendor: params.vendor });
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
    vendor: KycFlowVendor;
    code: string;
  }): Promise<{ step: KycStep; mfaMethod?: KycAccountLinkMfaMethod }> {
    const { mfaMethod } = await this.#requireAdapter(params.vendor).verifyLink({
      code: params.code,
    });
    const step = await this.refreshStep({ vendor: params.vendor });
    return { step, ...(mfaMethod ? { mfaMethod } : {}) };
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
    vendor: KycFlowVendor;
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
    vendor: KycFlowVendor;
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
    vendor: KycFlowVendor;
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
  async resendEmailCode(params: { vendor: KycFlowVendor }): Promise<KycStep> {
    return this.#runOnboardingStep(params.vendor, 'email/resend-otp');
  }

  /**
   * Tells kyc-api the user finished the identity provider flow (SumSub), so
   * the step survives a reinstall.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor.
   * @returns The next step.
   */
  async markProviderSubmitted({
    vendor,
  }: {
    vendor: KycFlowVendor;
  }): Promise<KycStep> {
    const sessionId = await this.#getSessionId(vendor);
    const step = await this.messenger.call('KycService:markProviderSubmitted', {
      sessionId,
    });
    this.#writeStep(vendor, step);
    return step;
  }

  /**
   * Forgets what the phone saved, for one vendor or all of them. kyc-api
   * keeps its own record, so the next refresh brings the step back.
   *
   * @param params - The parameters.
   * @param params.vendor - The vendor to forget. Omit to forget all.
   */
  reset({ vendor }: { vendor?: KycFlowVendor } = {}): void {
    this.update((state) => {
      if (vendor) {
        delete state.vendors[vendor];
      } else {
        state.vendors = {};
      }
    });
  }

  async #runOnboardingStep(
    vendor: KycFlowVendor,
    step: KycOnboardingStep,
    body?: Record<string, string>,
  ): Promise<KycStep> {
    const sessionId = await this.#getSessionId(vendor);
    await this.messenger.call('KycService:postOnboardingStep', {
      sessionId,
      step,
      ...(body ? { body } : {}),
    });
    return this.refreshStep({ vendor });
  }

  /**
   * Gets the vendor's session id from what the phone saved, or from kyc-api
   * when the phone has none (a reinstall).
   *
   * @param vendor - The vendor.
   * @returns The session id.
   */
  async #getSessionId(vendor: KycFlowVendor): Promise<string> {
    const saved = this.state.vendors[vendor]?.sessionId;
    if (saved) {
      return saved;
    }
    const status = await this.messenger.call(
      'KycService:getSessionStatusForVendor',
      vendor,
    );
    if (!status) {
      throw new Error(`KycFlowController: no ${vendor} session to continue.`);
    }
    this.#write(vendor, { sessionId: status.id });
    return status.id;
  }

  #requireAdapter(vendor: KycFlowVendor): KycAccountLinkAdapter {
    const adapter = this.#accountLinkAdapters[vendor];
    if (!adapter) {
      throw new Error(
        `KycFlowController: no account link adapter for ${vendor}.`,
      );
    }
    return adapter;
  }

  #writeStep(vendor: KycFlowVendor, step: KycStep): void {
    this.#write(vendor, { step });
  }

  #write(vendor: KycFlowVendor, patch: Partial<KycFlowVendorState>): void {
    this.update((state) => {
      const entry = state.vendors[vendor] ?? {
        step: 'vendor_terms' as KycStep,
        sessionId: null,
      };
      state.vendors[vendor] = { ...entry, ...patch };
    });
  }
}
