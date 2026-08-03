import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  EnrollmentCapableSecretEscrowClient,
  EscrowAssertion,
  EscrowFactor,
  EscrowFactorPublic,
  ExportInitResult,
  FactorProof,
  LocalPasskeyRecord,
  MockSecretEscrowSnapshot,
  SecretEscrowClient,
  WebAuthnEscrowFactor,
} from '@metamask/secret-escrow-client';
import {
  SecretEscrowError,
  SecretEscrowErrorCode,
  toPublicEscrowFactor,
} from '@metamask/secret-escrow-client';

import { controllerName } from './constants.js';
import type { WrappedPassword } from './crypto.js';
import { unwrapPassword, wrapPassword } from './crypto.js';
import type { SecretEscrowControllerMethodActions } from './SecretEscrowController-method-action-types.js';

/**
 * Persisted metadata for enrolled escrow factors.
 *
 * Never includes the raw wallet secret `S`. May include a password ciphertext
 * wrapped under that secret for the legacy Social + Passkey coexistence path
 * (TOPRF still password-based).
 */
export type SecretEscrowRecord = {
  userId: string;
  /**
   * Default factor id for legacy {@link SecretEscrowController.startExport} /
   * {@link SecretEscrowController.completeExport} / recoverPassword.
   */
  factorId: string;
  /**
   * Public metadata for the default factor (legacy single-factor field).
   */
  factor: EscrowFactorPublic;
  /**
   * All enrolled factors (1-of-N release policy).
   */
  factors: Record<string, EscrowFactorPublic>;
  enrolledAt: number;
  /**
   * Wallet password encrypted under the escrow secret.
   *
   * Legacy bridge only — new flows escrow wallet secret `S` directly.
   */
  wrappedPassword?: WrappedPassword;
  /**
   * Local offline-unlock wrap (password under passkey), mirrored to remote
   * enrollment metadata for wipe/rehydration.
   */
  localPasskeyRecord?: LocalPasskeyRecord;
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
  'listFactors',
  'generateWalletSecret',
  'createWithWalletSecret',
  'createWithWalletSecretAndWrapPassword',
  'addFactor',
  'updateWrappedPassword',
  'enroll',
  'enrollAndWrapPassword',
  'hydrateFromRemote',
  'setLocalPasskeyRecord',
  'clearLocalPasskeyRecord',
  'startExport',
  'completeExport',
  'unlockWithFactor',
  'recoverPassword',
  'recoverPasswordWithFactor',
  'revoke',
  'clearState',
] as const;

const WALLET_SECRET_BYTE_LENGTH = 32;

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
  selectFactors: (
    state: SecretEscrowControllerState,
  ): Record<string, EscrowFactorPublic> => state.escrowRecord?.factors ?? {},
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
 * Whether a client supports remote enrollment metadata persistence.
 *
 * @param client - Escrow client instance.
 * @returns True when enrollment metadata methods exist.
 */
function isEnrollmentCapableClient(
  client: SecretEscrowClient | SnapshotCapableSecretEscrowClient,
): client is EnrollmentCapableSecretEscrowClient {
  return (
    typeof (client as EnrollmentCapableSecretEscrowClient)
      .putEnrollmentMetadata === 'function' &&
    typeof (client as EnrollmentCapableSecretEscrowClient)
      .getEnrollmentMetadata === 'function'
  );
}

/**
 * Whether a public factor is a WebAuthn factor (legacy enrollment metadata).
 *
 * @param factor - Public factor metadata.
 * @returns True when the factor is webauthn.
 */
function isWebAuthnPublicFactor(
  factor: EscrowFactorPublic,
): factor is WebAuthnEscrowFactor {
  return factor.type === 'webauthn';
}

/**
 * Orchestrates factor-gated wallet secret escrow for social-login recovery.
 *
 * Prefer {@link createWithWalletSecret} + {@link addFactor} +
 * {@link unlockWithFactor} for the multi-factor (1-of-N) wallet secret `S`
 * path. Prefer {@link enrollAndWrapPassword} / {@link recoverPassword} for
 * the legacy Social + Passkey coexistence bridge (password remains the TOPRF
 * factor; passkey unlocks a wrapped copy via escrow).
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

    // Migrate older persisted records that only had a single factor field.
    const existingRecord = this.state.escrowRecord as
      | (SecretEscrowRecord & { factors?: Record<string, EscrowFactorPublic> })
      | null;
    if (existingRecord && !existingRecord.factors) {
      this.update((draft) => {
        draft.escrowRecord = {
          ...existingRecord,
          factors: { [existingRecord.factorId]: existingRecord.factor },
        };
      });
    }

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
   * Lists enrolled public factors from local state.
   *
   * @returns Factor id → public metadata map.
   */
  listFactors(): Record<string, EscrowFactorPublic> {
    return this.state.escrowRecord?.factors ?? {};
  }

  /**
   * Generates a 32-byte wallet secret `S` suitable for escrow registration.
   *
   * @returns Fresh random secret (caller must clear after use).
   */
  generateWalletSecret(): Uint8Array {
    const secret = new Uint8Array(WALLET_SECRET_BYTE_LENGTH);
    globalThis.crypto.getRandomValues(secret);
    return secret;
  }

  /**
   * Registers the first factor and escrows wallet secret `S`.
   *
   * Additional factors use {@link addFactor} (1-of-N).
   *
   * @param params - Creation parameters.
   * @param params.userId - Stable escrow user id.
   * @param params.factorId - Factor id (e.g. `"password"` or `"passkey"`).
   * @param params.factor - Factor payload (password includes plaintext once).
   * @param params.secret - Optional 32-byte `S`; generated when omitted.
   * @returns The escrowed wallet secret (caller must clear after use).
   */
  async createWithWalletSecret(params: {
    userId: string;
    factorId: string;
    factor: EscrowFactor;
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

    const publicFactor = toPublicEscrowFactor(params.factor);
    this.update((state) => {
      state.escrowRecord = {
        userId: params.userId,
        factorId: params.factorId,
        factor: publicFactor,
        factors: { [params.factorId]: publicFactor },
        enrolledAt: Date.now(),
      };
    });
    this.#persistMockSnapshot();

    return secret;
  }

  /**
   * Adds another factor to an existing escrow enrollment (1-of-N).
   *
   * @param params - Add-factor parameters.
   * @param params.factorId - New factor id.
   * @param params.factor - Factor payload.
   */
  async addFactor(params: {
    factorId: string;
    factor: EscrowFactor;
  }): Promise<void> {
    const record = this.#requireEnrolled();
    const existing = record.factors[params.factorId];
    if (
      existing &&
      (existing.type !== 'password' || params.factor.type !== 'password')
    ) {
      throw new SecretEscrowError('Secret escrow factor already enrolled', {
        code: SecretEscrowErrorCode.AlreadyRegistered,
      });
    }

    await this.#client.addFactor({
      userId: record.userId,
      factorId: params.factorId,
      factor: params.factor,
    });

    const publicFactor = toPublicEscrowFactor(params.factor);
    this.update((state) => {
      state.escrowRecord!.factors[params.factorId] = publicFactor;
    });
    this.#persistMockSnapshot();
    await this.#syncEnrollmentMetadata();
  }

  /**
   * Replaces the wrapped wallet password ciphertext under the given escrow
   * secret `S` (e.g. after rotating the vault password during onboarding).
   *
   * @param params - Rewrap parameters.
   * @param params.password - New wallet password to wrap.
   * @param params.secret - Escrow-released wallet secret `S`.
   */
  async updateWrappedPassword(params: {
    password: string;
    secret: Uint8Array;
  }): Promise<void> {
    this.#requireEnrolled();
    const wrappedPassword = wrapPassword(params.password, params.secret);
    this.update((state) => {
      state.escrowRecord!.wrappedPassword = wrappedPassword;
    });
    await this.#syncEnrollmentMetadata();
  }

  /**
   * Registers the first factor, escrows wallet secret `S`, and wraps the wallet
   * password under `S` for TOPRF coexistence during migration.
   *
   * @param params - Creation parameters including plaintext password to wrap.
   * @param params.userId - Stable escrow user id.
   * @param params.factorId - Factor id (e.g. `"password"` or `"passkey"`).
   * @param params.factor - Factor payload.
   * @param params.password - Wallet password to wrap.
   * @param params.secret - Optional 32-byte `S`; generated when omitted.
   */
  async createWithWalletSecretAndWrapPassword(params: {
    userId: string;
    factorId: string;
    factor: EscrowFactor;
    password: string;
    secret?: Uint8Array;
  }): Promise<void> {
    const secret = await this.createWithWalletSecret({
      userId: params.userId,
      factorId: params.factorId,
      factor: params.factor,
      secret: params.secret,
    });
    try {
      const wrappedPassword = wrapPassword(params.password, secret);
      this.update((state) => {
        state.escrowRecord!.wrappedPassword = wrappedPassword;
      });
      await this.#syncEnrollmentMetadata();
    } finally {
      secret.fill(0);
    }
  }

  /**
   * Registers a WebAuthn factor with the escrow and persists local metadata.
   *
   * @deprecated Prefer {@link createWithWalletSecret} for new flows.
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
    return this.createWithWalletSecret(params);
  }

  /**
   * Enrolls a WebAuthn factor and wraps the wallet password under the escrow
   * secret for later Social + Passkey recovery.
   *
   * Legacy coexistence bridge while TOPRF remains password-based.
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
    await this.createWithWalletSecretAndWrapPassword(params);
  }

  /**
   * Restores local enrollment from a remote escrow that persists public
   * metadata (e.g. the file-backed mock HTTP server).
   *
   * No-op when already enrolled locally or when the client cannot fetch
   * enrollment metadata. Used after wallet wipe + social rehydration.
   *
   * @param userId - Stable escrow user id.
   * @returns True when local state was hydrated from remote.
   */
  async hydrateFromRemote(userId: string): Promise<boolean> {
    if (this.state.escrowRecord) {
      return false;
    }
    if (!isEnrollmentCapableClient(this.#client)) {
      return false;
    }

    const metadata = await this.#client.getEnrollmentMetadata(userId);
    if (!metadata?.wrappedPassword) {
      return false;
    }

    const factorId = metadata.factorId || 'passkey';
    const factor = structuredClone(metadata.factor);
    const factors =
      metadata.factors ??
      ({
        [factorId]: factor,
      } as Record<string, EscrowFactorPublic>);

    this.update((state) => {
      state.escrowRecord = {
        userId: metadata.userId,
        // Guard against port-IPC `null` factor ids from older enrollments.
        factorId,
        factor,
        factors,
        enrolledAt: metadata.enrolledAt,
        wrappedPassword: { ...metadata.wrappedPassword },
        ...(metadata.localPasskeyRecord
          ? {
              localPasskeyRecord: structuredClone(metadata.localPasskeyRecord),
            }
          : {}),
      };
    });
    return true;
  }

  /**
   * Stores (or replaces) the local offline passkey wrap and syncs remote metadata.
   *
   * @param localPasskeyRecord - PasskeyController passkeyRecord to persist for wipe recovery.
   */
  async setLocalPasskeyRecord(
    localPasskeyRecord: LocalPasskeyRecord,
  ): Promise<void> {
    this.#requireEnrolled();
    this.update((state) => {
      state.escrowRecord!.localPasskeyRecord =
        structuredClone(localPasskeyRecord);
    });
    await this.#syncEnrollmentMetadata();
  }

  /**
   * Clears the local offline passkey wrap from escrow state and remote metadata.
   */
  async clearLocalPasskeyRecord(): Promise<void> {
    if (!this.state.escrowRecord?.localPasskeyRecord) {
      return;
    }
    this.update((state) => {
      delete state.escrowRecord!.localPasskeyRecord;
    });
    await this.#syncEnrollmentMetadata();
  }

  /**
   * Starts an export ceremony and returns the challenge for the factor proof.
   *
   * @param factorId - Optional factor id; defaults to the enrolled default.
   * @returns Export challenge.
   */
  async startExport(factorId?: string): Promise<ExportInitResult> {
    const record = this.#requireEnrolled();
    const resolvedFactorId = factorId ?? record.factorId;
    if (!record.factors[resolvedFactorId]) {
      throw new SecretEscrowError('Unknown escrow factor id', {
        code: SecretEscrowErrorCode.UnknownFactor,
      });
    }
    return this.#client.exportInit({
      userId: record.userId,
      factorId: resolvedFactorId,
    });
  }

  /**
   * Completes export with a WebAuthn assertion for the default factor.
   *
   * Legacy helper — prefer {@link unlockWithFactor} for multi-factor flows.
   *
   * @param assertion - Assertion from `navigator.credentials.get()` (or mock).
   * @returns Released secret (caller must clear after use).
   */
  async completeExport(assertion: EscrowAssertion): Promise<Uint8Array> {
    const record = this.#requireEnrolled();
    return this.unlockWithFactor({
      factorId: record.factorId,
      proof: { type: 'webauthn', assertion },
    });
  }

  /**
   * Completes export for any enrolled factor (1-of-N) and returns wallet secret `S`.
   *
   * Caller must have already called {@link startExport} for the same factor.
   *
   * @param params - Unlock parameters.
   * @param params.factorId - Factor to prove.
   * @param params.proof - Factor proof (webauthn assertion or password).
   * @returns Released wallet secret (caller must clear after use).
   */
  async unlockWithFactor(params: {
    factorId: string;
    proof: FactorProof;
  }): Promise<Uint8Array> {
    const record = this.#requireEnrolled();
    if (!record.factors[params.factorId]) {
      throw new SecretEscrowError('Unknown escrow factor id', {
        code: SecretEscrowErrorCode.UnknownFactor,
      });
    }
    const { secret } = await this.#client.exportComplete({
      userId: record.userId,
      factorId: params.factorId,
      proof: params.proof,
    });
    return secret;
  }

  /**
   * Recovers the wrapped wallet password after a successful WebAuthn assertion.
   *
   * Legacy coexistence bridge only. Prefer {@link recoverPasswordWithFactor}
   * for password / TOTP proofs.
   *
   * @param assertion - Assertion from `navigator.credentials.get()` (or mock).
   * @param factorId - Optional factor id; defaults to the enrolled default.
   * @returns Plaintext wallet password (caller must clear after use).
   */
  async recoverPassword(
    assertion: EscrowAssertion,
    factorId?: string,
  ): Promise<string> {
    const record = this.#requireEnrolled();
    const resolvedFactorId = factorId ?? record.factorId;
    return this.recoverPasswordWithFactor({
      factorId: resolvedFactorId,
      proof: { type: 'webauthn', assertion },
    });
  }

  /**
   * Recovers the wrapped wallet password after proving any enrolled factor.
   *
   * Caller must have already called {@link startExport} for the same factor.
   *
   * @param params - Unlock parameters.
   * @param params.factorId - Factor to prove.
   * @param params.proof - Factor proof (webauthn, password, or totp).
   * @returns Plaintext wallet password (caller must clear after use).
   */
  async recoverPasswordWithFactor(params: {
    factorId: string;
    proof: FactorProof;
  }): Promise<string> {
    const record = this.#requireEnrolled();
    if (!record.wrappedPassword) {
      throw new SecretEscrowError('No wrapped password enrolled', {
        code: SecretEscrowErrorCode.NotRegistered,
      });
    }

    const secret = await this.unlockWithFactor(params);
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

  /**
   * Pushes public enrollment metadata to a remote-capable client (legacy wrap).
   *
   * Uses any enrolled WebAuthn factor for the legacy `factor` field so password-
   * first enrollments can sync after a passkey is added.
   */
  async #syncEnrollmentMetadata(): Promise<void> {
    const record = this.state.escrowRecord;
    if (!record?.wrappedPassword || !isEnrollmentCapableClient(this.#client)) {
      return;
    }
    const webauthnEntry = Object.entries(record.factors).find(([, factor]) =>
      isWebAuthnPublicFactor(factor),
    );
    if (!webauthnEntry || !isWebAuthnPublicFactor(webauthnEntry[1])) {
      return;
    }
    const [factorId, factor] = webauthnEntry;
    await this.#client.putEnrollmentMetadata({
      userId: record.userId,
      factorId,
      factor: structuredClone(factor),
      wrappedPassword: record.wrappedPassword,
      enrolledAt: record.enrolledAt,
      factors: structuredClone(record.factors),
      ...(record.localPasskeyRecord
        ? {
            localPasskeyRecord: structuredClone(record.localPasskeyRecord),
          }
        : {}),
    });
  }
}
