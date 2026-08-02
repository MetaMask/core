import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  EscrowAssertion,
  ExportInitResult,
  MockSecretEscrowSnapshot,
  SecretEscrowClient,
  WebAuthnEscrowFactor,
} from '@metamask/secret-escrow-client';
import {
  SecretEscrowError,
  SecretEscrowErrorCode,
} from '@metamask/secret-escrow-client';

import { controllerName } from './constants.js';
import type { WrappedPassword } from './crypto.js';
import { unwrapPassword, wrapPassword } from './crypto.js';
import type { SecretEscrowControllerMethodActions } from './SecretEscrowController-method-action-types.js';

/**
 * Persisted metadata for an enrolled escrow factor.
 *
 * Never includes the raw escrow secret. May include a password ciphertext
 * wrapped under that secret for social-login recovery.
 */
export type SecretEscrowRecord = {
  userId: string;
  factorId: string;
  factor: WebAuthnEscrowFactor;
  enrolledAt: number;
  /**
   * Wallet password encrypted under the escrow secret.
   *
   * Stored so Social + Passkey can recover the password for TOPRF without
   * typing it. Safe to persist: useless without the escrow-released secret.
   */
  wrappedPassword?: WrappedPassword;
};

/**
 * State for {@link SecretEscrowController}.
 */
export type SecretEscrowControllerState = {
  escrowRecord: SecretEscrowRecord | null;
  /**
   * Mock-backend snapshot so local-dev secrets survive extension restarts.
   * Unused when talking to a real escrow API — always null in production.
   */
  mockClientSnapshot: MockSecretEscrowSnapshot | null;
};

/**
 * Client that can export/import an in-memory snapshot (mock only).
 */
export type SnapshotCapableSecretEscrowClient = SecretEscrowClient & {
  exportSnapshot: () => MockSecretEscrowSnapshot;
  importSnapshot: (snapshot: MockSecretEscrowSnapshot) => void;
};

/**
 * Options for constructing {@link SecretEscrowController}.
 */
export type SecretEscrowControllerOptions = {
  messenger: SecretEscrowControllerMessenger;
  state?: Partial<SecretEscrowControllerState>;
  /**
   * Escrow backend client. Use {@link MockSecretEscrowClient} until a real
   * backend is wired.
   */
  client: SecretEscrowClient | SnapshotCapableSecretEscrowClient;
};

export type SecretEscrowControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SecretEscrowControllerState
>;

export type SecretEscrowControllerActions =
  | SecretEscrowControllerGetStateAction
  | SecretEscrowControllerMethodActions;

type AllowedActions = never;

export type SecretEscrowControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  SecretEscrowControllerState
>;

export type SecretEscrowControllerEvents =
  SecretEscrowControllerStateChangeEvent;

type AllowedEvents = never;

export type SecretEscrowControllerMessenger = Messenger<
  typeof controllerName,
  SecretEscrowControllerActions | AllowedActions,
  SecretEscrowControllerEvents | AllowedEvents
>;

const secretEscrowControllerMetadata = {
  escrowRecord: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: true,
  },
  mockClientSnapshot: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: false,
  },
} satisfies StateMetadata<SecretEscrowControllerState>;

const MESSENGER_EXPOSED_METHODS = [
  'isEnrolled',
  'enroll',
  'enrollAndWrapPassword',
  'startExport',
  'completeExport',
  'recoverPassword',
  'revoke',
  'clearState',
] as const;

/**
 * Returns default state for {@link SecretEscrowController}.
 *
 * @returns Fresh empty state.
 */
export function getDefaultSecretEscrowControllerState(): SecretEscrowControllerState {
  return { escrowRecord: null, mockClientSnapshot: null };
}

/**
 * Selectors for {@link SecretEscrowControllerState}.
 */
export const secretEscrowControllerSelectors = {
  selectIsEnrolled: (state: SecretEscrowControllerState): boolean =>
    state.escrowRecord !== null,
  selectEscrowRecord: (
    state: SecretEscrowControllerState,
  ): SecretEscrowRecord | null => state.escrowRecord,
  selectHasWrappedPassword: (state: SecretEscrowControllerState): boolean =>
    Boolean(state.escrowRecord?.wrappedPassword),
};

/**
 * Whether a client supports mock snapshot import/export.
 *
 * @param client - Escrow client instance.
 * @returns True when snapshot methods exist.
 */
function isSnapshotCapableClient(
  client: SecretEscrowClient | SnapshotCapableSecretEscrowClient,
): client is SnapshotCapableSecretEscrowClient {
  return (
    typeof (client as SnapshotCapableSecretEscrowClient).exportSnapshot ===
      'function' &&
    typeof (client as SnapshotCapableSecretEscrowClient).importSnapshot ===
      'function'
  );
}

/**
 * Orchestrates WebAuthn-gated secret escrow enrollment and export for
 * social-login passkey recovery.
 *
 * Prefer {@link enrollAndWrapPassword} / {@link recoverPassword} for the
 * social coexistence path (password remains the TOPRF factor; passkey unlocks
 * a wrapped copy via escrow).
 */
export class SecretEscrowController extends BaseController<
  typeof controllerName,
  SecretEscrowControllerState,
  SecretEscrowControllerMessenger
> {
  readonly #client: SecretEscrowClient | SnapshotCapableSecretEscrowClient;

  constructor({ messenger, state, client }: SecretEscrowControllerOptions) {
    super({
      messenger,
      metadata: secretEscrowControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultSecretEscrowControllerState(),
        ...state,
      },
    });
    this.#client = client;

    if (
      isSnapshotCapableClient(client) &&
      this.state.mockClientSnapshot !== null
    ) {
      client.importSnapshot(this.state.mockClientSnapshot);
    }

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Whether an escrow factor is enrolled in local state.
   *
   * @returns True when {@link SecretEscrowControllerState.escrowRecord} is set.
   */
  isEnrolled(): boolean {
    return this.state.escrowRecord !== null;
  }

  /**
   * Registers a WebAuthn factor with the escrow and persists local metadata.
   *
   * @param params - Enrollment parameters.
   * @param params.userId - Stable escrow user id.
   * @param params.factorId - Factor id (e.g. `"passkey"`).
   * @param params.factor - Public WebAuthn factor metadata.
   * @param params.secret - Optional 32-byte secret; generated by escrow when omitted.
   * @returns The escrowed secret (caller must clear after use).
   */
  async enroll(params: {
    userId: string;
    factorId: string;
    factor: WebAuthnEscrowFactor;
    secret?: Uint8Array;
  }): Promise<Uint8Array> {
    if (this.state.escrowRecord) {
      throw new SecretEscrowError('Secret escrow already enrolled', {
        code: SecretEscrowErrorCode.AlreadyRegistered,
      });
    }

    const { secret } = await this.#client.register({
      userId: params.userId,
      factorId: params.factorId,
      factor: params.factor,
      secret: params.secret,
    });

    this.update((state) => {
      state.escrowRecord = {
        userId: params.userId,
        factorId: params.factorId,
        factor: structuredClone(params.factor),
        enrolledAt: Date.now(),
      };
    });
    this.#persistMockSnapshot();

    return secret;
  }

  /**
   * Enrolls a WebAuthn factor and wraps the wallet password under the escrow
   * secret for later Social + Passkey recovery.
   *
   * @param params - Enrollment parameters including plaintext password.
   * @param params.userId - Stable escrow user id.
   * @param params.factorId - Factor id (e.g. `"passkey"`).
   * @param params.factor - Public WebAuthn factor metadata.
   * @param params.password - Wallet password to wrap (TOPRF factor).
   * @param params.secret - Optional 32-byte secret; generated by escrow when omitted.
   */
  async enrollAndWrapPassword(params: {
    userId: string;
    factorId: string;
    factor: WebAuthnEscrowFactor;
    password: string;
    secret?: Uint8Array;
  }): Promise<void> {
    const secret = await this.enroll({
      userId: params.userId,
      factorId: params.factorId,
      factor: params.factor,
      secret: params.secret,
    });
    try {
      const wrappedPassword = wrapPassword(params.password, secret);
      this.update((state) => {
        // `enroll` above always sets `escrowRecord` before returning.
        state.escrowRecord!.wrappedPassword = wrappedPassword;
      });
    } finally {
      secret.fill(0);
    }
  }

  /**
   * Starts an export ceremony and returns the challenge for WebAuthn `get()`.
   *
   * @returns Export challenge.
   */
  async startExport(): Promise<ExportInitResult> {
    const record = this.#requireEnrolled();
    return this.#client.exportInit({
      userId: record.userId,
      factorId: record.factorId,
    });
  }

  /**
   * Completes export with a WebAuthn assertion and returns the escrowed secret.
   *
   * @param assertion - Assertion from `navigator.credentials.get()` (or mock).
   * @returns Released secret (caller must clear after use).
   */
  async completeExport(assertion: EscrowAssertion): Promise<Uint8Array> {
    const record = this.#requireEnrolled();
    const { secret } = await this.#client.exportComplete({
      userId: record.userId,
      factorId: record.factorId,
      assertion,
    });
    return secret;
  }

  /**
   * Recovers the wrapped wallet password after a successful WebAuthn assertion.
   *
   * @param assertion - Assertion from `navigator.credentials.get()` (or mock).
   * @returns Plaintext wallet password (caller must clear after use).
   */
  async recoverPassword(assertion: EscrowAssertion): Promise<string> {
    const record = this.#requireEnrolled();
    if (!record.wrappedPassword) {
      throw new SecretEscrowError('No wrapped password enrolled', {
        code: SecretEscrowErrorCode.NotRegistered,
      });
    }

    const secret = await this.completeExport(assertion);
    try {
      return unwrapPassword(record.wrappedPassword, secret);
    } finally {
      secret.fill(0);
    }
  }

  /**
   * Revokes escrow material remotely and clears local enrollment state.
   */
  async revoke(): Promise<void> {
    const record = this.state.escrowRecord;
    if (record) {
      await this.#client.revoke({ userId: record.userId });
    }
    this.clearState();
  }

  /**
   * Clears local enrollment state without calling the escrow backend.
   *
   * Prefer {@link revoke} when the remote record should also be deleted.
   */
  clearState(): void {
    this.update((state) => {
      state.escrowRecord = null;
      state.mockClientSnapshot = null;
    });
  }

  #requireEnrolled(): SecretEscrowRecord {
    const { escrowRecord } = this.state;
    if (!escrowRecord) {
      throw new SecretEscrowError('Secret escrow is not enrolled', {
        code: SecretEscrowErrorCode.NotRegistered,
      });
    }
    return escrowRecord;
  }

  #persistMockSnapshot(): void {
    if (!isSnapshotCapableClient(this.#client)) {
      return;
    }
    const snapshot = this.#client.exportSnapshot();
    this.update((state) => {
      state.mockClientSnapshot = snapshot;
    });
  }
}
