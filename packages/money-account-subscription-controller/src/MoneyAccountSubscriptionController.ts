import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetStateAction,
  AuthenticationControllerPerformSignOutAction,
  AuthenticationControllerState,
} from '@metamask/profile-sync-controller/auth';
import type {
  SubscriptionControllerGetStateAction,
  SubscriptionControllerState,
} from '@metamask/subscription-controller';

import { getMoneyAccountPlusClaimFromBearerToken } from './jwt-claims.js';
import type { MoneyAccountSubscriptionControllerMethodActions } from './MoneyAccountSubscriptionController-method-action-types.js';
import type {
  Env,
  MoneyAccountPlusJwtClaim,
  MoneyAccountSubscriptionControllerState,
} from './types.js';
import { getProductEntitlementsClaimKey } from './types.js';

export const controllerName = 'MoneyAccountSubscriptionController';

export const DEFAULT_POLLING_INTERVAL_MS = 60_000;

export const FORCE_REFRESH_THROTTLE_MS = 10_000;

const POLLING_INPUT = {
  type: 'entitlement-refresh',
} as const;

type PollingInput = typeof POLLING_INPUT;

export type MoneyAccountSubscriptionControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MoneyAccountSubscriptionControllerState
  >;

export type MoneyAccountSubscriptionControllerActions =
  | MoneyAccountSubscriptionControllerGetStateAction
  | MoneyAccountSubscriptionControllerMethodActions;

type AllowedActions =
  | AuthenticationControllerGetStateAction
  | AuthenticationControllerGetBearerTokenAction
  | AuthenticationControllerPerformSignOutAction
  | SubscriptionControllerGetStateAction;

type AuthenticationControllerStateChangedEvent = ControllerStateChangedEvent<
  'AuthenticationController',
  AuthenticationControllerState
>;

type SubscriptionControllerStateChangedEvent = ControllerStateChangedEvent<
  'SubscriptionController',
  SubscriptionControllerState
>;

export type MoneyAccountSubscriptionControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof controllerName,
    MoneyAccountSubscriptionControllerState
  >;

export type MoneyAccountSubscriptionControllerEvents =
  MoneyAccountSubscriptionControllerStateChangedEvent;

type AllowedEvents =
  | AuthenticationControllerStateChangedEvent
  | SubscriptionControllerStateChangedEvent;

export type MoneyAccountSubscriptionControllerMessenger = Messenger<
  typeof controllerName,
  MoneyAccountSubscriptionControllerActions | AllowedActions,
  MoneyAccountSubscriptionControllerEvents | AllowedEvents
>;

export type MoneyAccountSubscriptionControllerOptions = {
  messenger: MoneyAccountSubscriptionControllerMessenger;
  state?: Partial<MoneyAccountSubscriptionControllerState>;
  env: Env;
  pollingIntervalMs?: number;
};

const metadata: StateMetadata<MoneyAccountSubscriptionControllerState> = {
  plan: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  entitlements: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  isSubscriber: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  lastHydratedAt: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
};

const MESSENGER_EXPOSED_METHODS = [
  'forceRefresh',
  'startEntitlementRefresh',
  'stopEntitlementRefresh',
  'clearState',
] as const;

const MONEY_ACCOUNT_PLUS_PRODUCT = 'money_account_plus';

type RefreshMode = 'normal' | 'force';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SubscriptionStateSnapshot = {
  subscriptions?: unknown;
};

type ProductSnapshot = {
  name?: unknown;
};

type SubscriptionSnapshot = {
  cancelType?: unknown;
  currentPeriodEnd?: unknown;
  currentPeriodStart?: unknown;
  id?: unknown;
  paymentMethod?: unknown;
  products?: unknown;
  status?: unknown;
};

export function getDefaultMoneyAccountSubscriptionControllerState(): MoneyAccountSubscriptionControllerState {
  return {
    plan: null,
    entitlements: null,
    isSubscriber: false,
    lastHydratedAt: null,
  };
}

export class MoneyAccountSubscriptionController extends StaticIntervalPollingController<PollingInput>()<
  typeof controllerName,
  MoneyAccountSubscriptionControllerState,
  MoneyAccountSubscriptionControllerMessenger
> {
  readonly #claimKey: string;

  #entitlementRefreshPollingToken: string | null = null;

  #isSignedIn = false;

  #authStateRevision = 0;

  #refreshPromise: Promise<void> | null = null;

  #activeRefreshMode: RefreshMode | null = null;

  #pendingHydrationAuthStateRevision: number | null = null;

  #pendingForceRefreshAuthStateRevision: number | null = null;

  #lastForcedRefreshAt: number | null = null;

  #expectedForcedRefreshSignIn = false;

  #observedForcedRefreshSignOut = false;

  #suppressedAuthHydrationRevision: number | null = null;

  #moneyAccountSubscriptionSnapshot: string | null | undefined;

  #isTradingSurfaceActive = false;

  constructor({
    messenger,
    state,
    env,
    pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS,
  }: MoneyAccountSubscriptionControllerOptions) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: {
        ...getDefaultMoneyAccountSubscriptionControllerState(),
        ...state,
      },
    });

    this.#claimKey = getProductEntitlementsClaimKey(env);

    this.setIntervalLength(pollingIntervalMs);
    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.messenger.subscribe(
      'AuthenticationController:stateChanged',
      (stateChange) => {
        this.#handleAuthenticationStateChange(stateChange).catch((error) => {
          this.#logRefreshError(error);
        });
      },
    );

    this.messenger.subscribe(
      'SubscriptionController:stateChanged',
      (stateChange) => {
        this.#handleSubscriptionStateChange(stateChange).catch((error) => {
          this.#logRefreshError(error);
        });
      },
    );

    this.clearState();
    this.#bootstrap().catch((error) => {
      this.#logRefreshError(error);
    });
  }

  async forceRefresh(): Promise<void> {
    if (!this.#isSignedIn) {
      return;
    }

    const now = Date.now();
    if (this.#isForceRefreshThrottled(now)) {
      if (this.#refreshPromise) {
        await this.#refreshPromise;
      }
      return;
    }

    await this.#enqueueRefresh('force');
  }

  startEntitlementRefresh(): void {
    this.#isTradingSurfaceActive = true;
    this.#syncPollingState();
  }

  stopEntitlementRefresh(): void {
    this.#isTradingSurfaceActive = false;
    this.#stopEntitlementRefreshPolling();
  }

  clearState(): void {
    this.update(() => getDefaultMoneyAccountSubscriptionControllerState());
    this.#syncPollingState();
  }

  async _executePoll(): Promise<void> {
    if (!this.#isSignedIn || !this.state.isSubscriber) {
      return;
    }

    await this.#enqueueRefresh('force');
  }

  async #handleAuthenticationStateChange(
    authState: AuthenticationControllerState,
  ): Promise<void> {
    this.#authStateRevision += 1;
    this.#isSignedIn = authState.isSignedIn;

    if (!authState.isSignedIn) {
      this.#handleSignedOutAuthenticationState();
      return;
    }

    if (
      this.#expectedForcedRefreshSignIn &&
      this.#observedForcedRefreshSignOut
    ) {
      this.#markForcedRefreshSignInObserved();
      return;
    }

    await this.#hydrateSignedInAuthenticationState();
  }

  async #handleSubscriptionStateChange(
    subscriptionState: unknown,
  ): Promise<void> {
    if (!this.#isSignedIn) {
      return;
    }

    const nextSnapshot =
      this.#getMoneyAccountSubscriptionSnapshot(subscriptionState);

    if (nextSnapshot === undefined) {
      return;
    }

    if (nextSnapshot === this.#moneyAccountSubscriptionSnapshot) {
      return;
    }

    this.#moneyAccountSubscriptionSnapshot = nextSnapshot;
    await this.forceRefresh();
  }

  async #bootstrap(): Promise<void> {
    const authState = this.messenger.call('AuthenticationController:getState');
    this.#initializeSubscriptionSnapshot();
    await this.#handleAuthenticationStateChange(authState);
  }

  async #enqueueRefresh(mode: RefreshMode): Promise<void> {
    this.#markRefreshPending(mode);

    if (!this.#refreshPromise) {
      this.#refreshPromise = this.#drainRefreshQueue();
    }

    await this.#refreshPromise;
  }

  async #drainRefreshQueue(): Promise<void> {
    try {
      while (
        this.#pendingForceRefreshAuthStateRevision !== null ||
        this.#pendingHydrationAuthStateRevision !== null
      ) {
        const [mode, authStateRevision] = this.#takeNextRefresh();
        this.#activeRefreshMode = mode;

        if (
          authStateRevision === null ||
          !this.#shouldExecuteRefresh(authStateRevision)
        ) {
          continue;
        }

        await this.#refreshBearerToken(mode, authStateRevision);
      }
    } finally {
      this.#activeRefreshMode = null;
      this.#refreshPromise = null;
    }
  }

  #shouldExecuteRefresh(authStateRevision: number): boolean {
    return this.#isSignedIn && authStateRevision === this.#authStateRevision;
  }

  async #refreshBearerToken(
    mode: RefreshMode,
    authStateRevision: number,
  ): Promise<void> {
    if (mode === 'force') {
      this.#lastForcedRefreshAt = Date.now();
      await this.#forceBearerTokenRefresh(authStateRevision);
      return;
    }

    const token = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );

    if (this.#shouldSkipNormalHydration(authStateRevision)) {
      return;
    }

    this.#applyClaimFromToken(token);
  }

  async #forceBearerTokenRefresh(authStateRevision: number): Promise<void> {
    try {
      this.#expectedForcedRefreshSignIn = true;
      this.messenger.call('AuthenticationController:performSignOut');

      const token = await this.messenger.call(
        'AuthenticationController:getBearerToken',
      );
      const forcedSignInRevision = this.#suppressedAuthHydrationRevision;

      if (
        !this.#shouldApplyForcedRefreshToken(
          forcedSignInRevision,
          authStateRevision,
        )
      ) {
        return;
      }

      this.#suppressedAuthHydrationRevision = null;
      this.#applyClaimFromToken(token);
    } catch (error) {
      this.#lastForcedRefreshAt = null;
      throw error;
    } finally {
      this.#resetForceRefreshCoordination();
    }
  }

  #applyClaimFromToken(token: string): void {
    const claim = getMoneyAccountPlusClaimFromBearerToken(
      token,
      this.#claimKey,
    );
    this.#applyClaim(claim, Date.now());
  }

  #isForceRefreshThrottled(now: number): boolean {
    return (
      this.#lastForcedRefreshAt !== null &&
      now - this.#lastForcedRefreshAt < FORCE_REFRESH_THROTTLE_MS
    );
  }

  #handleSignedOutAuthenticationState(): void {
    if (this.#expectedForcedRefreshSignIn) {
      this.#observedForcedRefreshSignOut = true;
    } else {
      this.#cancelPendingRefreshWork();
      this.#resetForceRefreshCoordination();
      this.#lastForcedRefreshAt = null;
    }

    this.clearState();
  }

  #markForcedRefreshSignInObserved(): void {
    this.#expectedForcedRefreshSignIn = false;
    this.#observedForcedRefreshSignOut = false;
    this.#suppressedAuthHydrationRevision = this.#authStateRevision;
  }

  async #hydrateSignedInAuthenticationState(): Promise<void> {
    this.#suppressedAuthHydrationRevision = null;
    this.#initializeSubscriptionSnapshot();
    await this.#enqueueRefresh('normal');
  }

  #markRefreshPending(mode: RefreshMode): void {
    if (mode === 'normal') {
      this.#pendingHydrationAuthStateRevision = this.#authStateRevision;
      return;
    }

    if (this.#activeRefreshMode !== 'force') {
      this.#pendingForceRefreshAuthStateRevision = this.#authStateRevision;
    }
  }

  #takeNextRefresh(): [RefreshMode, number | null] {
    if (this.#pendingForceRefreshAuthStateRevision === null) {
      const authStateRevision = this.#pendingHydrationAuthStateRevision;
      this.#pendingHydrationAuthStateRevision = null;
      return ['normal', authStateRevision];
    }

    const authStateRevision = this.#pendingForceRefreshAuthStateRevision;
    this.#pendingForceRefreshAuthStateRevision = null;

    return ['force', authStateRevision];
  }

  #shouldSkipNormalHydration(authStateRevision: number): boolean {
    return (
      authStateRevision !== this.#authStateRevision ||
      !this.#isSignedIn ||
      authStateRevision === this.#suppressedAuthHydrationRevision
    );
  }

  #shouldApplyForcedRefreshToken(
    forcedSignInRevision: number | null,
    authStateRevision: number,
  ): boolean {
    if (forcedSignInRevision === null) {
      return this.#isSignedIn && this.#authStateRevision === authStateRevision;
    }

    return forcedSignInRevision === this.#authStateRevision && this.#isSignedIn;
  }

  #initializeSubscriptionSnapshot(): void {
    const subscriptionState = this.messenger.call(
      'SubscriptionController:getState',
    );
    this.#moneyAccountSubscriptionSnapshot =
      this.#getMoneyAccountSubscriptionSnapshot(subscriptionState);
  }

  #cancelPendingRefreshWork(): void {
    this.#pendingHydrationAuthStateRevision = null;
    this.#pendingForceRefreshAuthStateRevision = null;
  }

  #resetForceRefreshCoordination(): void {
    this.#expectedForcedRefreshSignIn = false;
    this.#observedForcedRefreshSignOut = false;
    this.#suppressedAuthHydrationRevision = null;
  }

  #syncPollingState(): void {
    if (
      this.#isTradingSurfaceActive &&
      this.#isSignedIn &&
      this.state.isSubscriber
    ) {
      if (!this.#entitlementRefreshPollingToken) {
        this.#entitlementRefreshPollingToken = this.startPolling(POLLING_INPUT);
      }
      return;
    }

    this.#stopEntitlementRefreshPolling();
  }

  #stopEntitlementRefreshPolling(): void {
    if (!this.#entitlementRefreshPollingToken) {
      return;
    }

    this.stopPollingByPollingToken(this.#entitlementRefreshPollingToken);
    this.#entitlementRefreshPollingToken = null;
  }

  #getMoneyAccountSubscriptionSnapshot(
    state: unknown,
  ): string | null | undefined {
    if (!isPlainObject(state)) {
      return undefined;
    }

    const { subscriptions } = state as SubscriptionStateSnapshot;
    if (!Array.isArray(subscriptions)) {
      return undefined;
    }

    const relevantSubscriptions = subscriptions
      .filter((subscription) => {
        if (!isPlainObject(subscription)) {
          return false;
        }

        const { products } = subscription as SubscriptionSnapshot;

        return (
          Array.isArray(products) &&
          products.some((product) => {
            const productSnapshot = product as ProductSnapshot;
            return isPlainObject(product)
              ? productSnapshot.name === MONEY_ACCOUNT_PLUS_PRODUCT
              : false;
          })
        );
      })
      .map((subscription) => {
        const {
          cancelType,
          currentPeriodEnd,
          currentPeriodStart,
          id,
          paymentMethod,
          products,
          status,
        } = subscription as SubscriptionSnapshot;

        return {
          cancelType: cancelType ?? null,
          currentPeriodEnd: currentPeriodEnd ?? null,
          currentPeriodStart: currentPeriodStart ?? null,
          id: id ?? null,
          paymentMethod: paymentMethod ?? null,
          products,
          status: status ?? null,
        };
      });

    if (relevantSubscriptions.length === 0) {
      return null;
    }

    return JSON.stringify(relevantSubscriptions);
  }

  #logRefreshError(error: unknown): void {
    console.error(error);
  }

  #applyClaim(
    claim: MoneyAccountPlusJwtClaim | null,
    hydratedAt: number,
  ): void {
    this.update((state) => {
      state.plan = claim?.plan ?? null;
      state.entitlements = claim?.entitlements ?? null;
      state.isSubscriber = claim !== null;
      state.lastHydratedAt = hydratedAt;
    });
    this.#syncPollingState();
  }
}
