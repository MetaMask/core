import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { AuthConnection } from '@metamask/seedless-onboarding-controller';
import { bytesToHex } from '@metamask/utils';
import { describe, expect, it, vi } from 'vitest';

import {
  STUB_SEEDLESS_AUTH_DATA,
  StubAuthProvider,
  StubEscrowProvider,
  StubIdentifierAuthProvider,
  StubSeedlessIdentifierAuthProvider,
  createAuthControllerToken,
  passthroughEncryptor,
} from '../tests/stubs.js';
import {
  generateSigningKey,
  generateWrapKey,
  hash,
  unixNow,
} from './crypto.js';
import { IncompleteMutationError, MutationRejectedError } from './errors.js';
import type {
  MfaRecoveryControllerMessenger,
  MfaRecoveryControllerOptions,
} from './MfaRecoveryController.js';
import { MfaRecoveryController } from './MfaRecoveryController.js';
import type {
  Identifier,
  IdentifierSession,
  KeyBoundIdentifierLogin,
  RecoveredSecret,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
  RegisterPayload,
  SeedlessAuthData,
  WritingPendingOperation,
} from './types.js';

const PASSKEY: Identifier = {
  type: 'passkey',
  namespace: 'example.com',
  value: 'cred-1',
  verifier: { publicKey: 'pk' },
};

const SOCIAL: Identifier = {
  type: 'social',
  namespace: 'https://accounts.google.com',
  value: 'hashed-email',
};

const OTHER_PASSKEY: Identifier = { ...PASSKEY, value: 'cred-2' };

const WALLET: Identifier = {
  type: 'siwe',
  namespace: 'example.com:1',
  value: '0xAbC0000000000000000000000000000000000001',
  verifier: { domain: 'example.com', chainId: 1 },
};

const IDENTIFIERS = [PASSKEY, SOCIAL];

const SECRET = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const SECRET_2 = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]);
const REGISTERED_EPOCH = 1;

describe('MfaRecoveryController', () => {
  describe('constructor', () => {
    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          {
            "pendingOperation": null,
          }
        `);
      });
    });

    it('throws if no escrows are configured', () => {
      const rootMessenger = getRootMessenger();
      expect(
        () =>
          new MfaRecoveryController({
            messenger: getMessenger(rootMessenger),
            authProvider: new StubAuthProvider(),
            identifierAuthProvider: new StubIdentifierAuthProvider(),
            escrows: [],
            pendingOperationEncryptor: passthroughEncryptor,
          }),
      ).toThrow('At least one escrow is required');
    });

    it('throws if escrow ids are duplicated', async () => {
      const rootMessenger = getRootMessenger();
      const wrapKey = await generateWrapKey();
      const receiptKey = await generateSigningKey();
      expect(
        () =>
          new MfaRecoveryController({
            messenger: getMessenger(rootMessenger),
            authProvider: new StubAuthProvider(),
            identifierAuthProvider: new StubIdentifierAuthProvider(),
            escrows: [
              new StubEscrowProvider('escrow-a', wrapKey, receiptKey),
              new StubEscrowProvider('escrow-a', wrapKey, receiptKey),
            ],
            pendingOperationEncryptor: passthroughEncryptor,
          }),
      ).toThrow('Duplicate escrow id');
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          {
            "pendingOperation": null,
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "pendingOperation": null,
          }
        `);
      });
    });
  });

  describe('register', () => {
    it('replicates the recovery secret to every escrow', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        const verifyReceipt = vi.spyOn(escrowA, 'verifyReceipt');
        const applyA = vi.spyOn(escrowA, 'applyMutation');
        const applyB = vi.spyOn(escrowB, 'applyMutation');
        await controller.register(SECRET, IDENTIFIERS);
        expect(controller.state.pendingOperation).toBeNull();
        expect(await controller.getPhase()).toBe('idle');
        expect(verifyReceipt.mock.calls[0][2]).toBe('escrow-a');

        const wrappedA = (applyA.mock.calls[0][3] as RegisterPayload)
          .recoverySecret;
        const wrappedB = (applyB.mock.calls[0][3] as RegisterPayload)
          .recoverySecret;
        expect(Object.keys(wrappedA).sort()).toStrictEqual([
          'ciphertext',
          'pkE',
        ]);
        expect(wrappedA.ciphertext).not.toBe(wrappedB.ciphertext);

        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it.each([
      ['an AAL1 approval', { requireTwoFactor: false }, {}],
      ['identifiers the approval does not bind', {}, { identifiers: [SOCIAL] }],
    ])(
      'rejects %s before writing',
      async (_name, paramsPatch, approvalPatch) => {
        await withController(async ({ controller, authProvider, escrowA }) => {
          const approve =
            authProvider.authorizeRecoveryRequest.bind(authProvider);
          vi.spyOn(authProvider, 'authorizeRecoveryRequest').mockImplementation(
            async (params) => ({
              ...(await approve({ ...params, ...paramsPatch })),
              ...approvalPatch,
            }),
          );
          const apply = vi.spyOn(escrowA, 'applyMutation');

          await expect(
            controller.register(SECRET, IDENTIFIERS),
          ).rejects.toMatchObject({ code: 'invalid_pending_operation' });
          expect(apply).not.toHaveBeenCalled();
        });
      },
    );

    it('publishes state changes through the stateChanged event', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const listener = vi.fn();
        rootMessenger.subscribe('MfaRecoveryController:stateChanged', listener);

        await controller.register(SECRET, IDENTIFIERS);

        expect(listener).toHaveBeenCalled();
        expect(listener).toHaveBeenLastCalledWith(
          { pendingOperation: null },
          expect.any(Array),
        );
      });
    });

    it('rejects an empty identifier list', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.register(SECRET, [])).rejects.toThrow(
          'Requires at least 2 identifiers',
        );
      });
    });

    it('rejects a single identifier', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.register(SECRET, [PASSKEY])).rejects.toThrow(
          'Requires at least 2 identifiers',
        );
      });
    });

    it('rejects duplicate identifiers', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.register(SECRET, [PASSKEY, PASSKEY]),
        ).rejects.toThrow('Requires at least 2 identifiers');
      });
    });

    it('rejects a second registration for the same profile', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toBeInstanceOf(MutationRejectedError);
        expect(await controller.getPhase()).toBe('idle');
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('does not write when an escrow wrap key is invalid', async () => {
      const escrowA = new StubEscrowProvider(
        'escrow-a',
        await generateWrapKey(),
        await generateSigningKey(),
      );
      const escrowB = new StubEscrowProvider(
        'escrow-b',
        {
          publicKey: new Uint8Array(0),
          privateKey: new Uint8Array(0),
        },
        await generateSigningKey(),
      );
      const applyA = vi.spyOn(escrowA, 'applyMutation');
      const applyB = vi.spyOn(escrowB, 'applyMutation');
      const controller = new MfaRecoveryController({
        ...getOptions(escrowA, escrowB),
        messenger: getMessenger(getRootMessenger()),
      });

      await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
        'Invalid public key length: Public key must be exactly 32 bytes for X25519.',
      );

      expect(applyA).not.toHaveBeenCalled();
      expect(applyB).not.toHaveBeenCalled();
      expect(await controller.getPhase()).toBe('authorizing');
    });
  });

  describe('authenticateIdentifier', () => {
    it('rejects unknown identifier types', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.authenticateIdentifier({
            type: 'unknown',
            namespace: 'example.com',
            value: 'unknown',
            verifier: null,
          }),
        ).rejects.toThrow('Unknown identifier type');
      });
    });

    it('binds the returned token to the read request', async () => {
      await withController(async ({ controller }) => {
        const { session } = await controller.authenticateIdentifier(PASSKEY);

        expect(session.token.requestHash).toBe(
          await hash({
            operation: 'getRecoverySecret',
            requestId: session.requestId,
            pkE: session.pkE,
          }),
        );
      });
    });

    it.each([
      {
        name: 'request id',
        update: (session: IdentifierSession): IdentifierSession => ({
          ...session,
          requestId: `${session.requestId}-tampered`,
        }),
      },
      {
        name: 'ephemeral public key',
        update: (session: IdentifierSession): IdentifierSession => {
          const pkE = new Uint8Array(session.pkE);
          pkE[0] = (pkE[0] + 1) % 256;
          return { ...session, pkE };
        },
      },
    ])('rejects a tampered $name', async ({ update }) => {
      await withController(async ({ controller }) => {
        const { session } = await controller.authenticateIdentifier(PASSKEY);

        await expect(
          controller.getRecoverySecret(update(session)),
        ).rejects.toMatchObject({
          code: 'invalid_identifier_session',
        });
      });
    });

    it('does not log in again when reading with a session', async () => {
      await withController(async ({ controller, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const login = vi.spyOn(
          options.identifierAuthProvider,
          'getKeyBoundIdentifierLogin',
        );

        const { session } = await controller.authenticateIdentifier(PASSKEY);
        expect(login).toHaveBeenCalledTimes(1);

        await controller.getRecoverySecret(session);
        expect(login).toHaveBeenCalledTimes(1);
      });
    });

    it('allows a session to be reused for another read', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const { session } = await controller.authenticateIdentifier(PASSKEY);

        const first = await controller.getRecoverySecret(session);
        expect(first).toStrictEqual(
          expect.objectContaining({ epoch: REGISTERED_EPOCH }),
        );
        const second = await controller.getRecoverySecret(session);
        expect(second).toStrictEqual(
          expect.objectContaining({ epoch: REGISTERED_EPOCH }),
        );
      });
    });

    it('omits seedlessAuthData when the login returns none', async () => {
      await withController(async ({ controller, options }) => {
        const login = vi.spyOn(
          options.identifierAuthProvider,
          'getKeyBoundIdentifierLogin',
        );

        const result = await controller.authenticateIdentifier(SOCIAL);

        expect(login).toHaveBeenCalledTimes(1);
        expect(result).not.toHaveProperty('seedlessAuthData');
        expect(result.session.token.identifier).toStrictEqual(SOCIAL);
      });
    });

    it('rejects login tokens not bound to the request', async () => {
      const identifierAuthProvider = new StubIdentifierAuthProvider();
      vi.spyOn(
        identifierAuthProvider,
        'getKeyBoundIdentifierLogin',
      ).mockImplementation(async (params) => ({
        token: {
          identifier: params.identifier,
          proofPublicKey: params.proofPublicKey,
          requestHash: '0xother-request',
          providerAssertion: {},
        },
      }));
      await withController(
        { identifierAuthProvider },
        async ({ controller }) => {
          await expect(
            controller.authenticateIdentifier(PASSKEY),
          ).rejects.toMatchObject({ code: 'invalid_identifier_token' });
        },
      );
    });

    it('rejects login tokens for another identifier', async () => {
      const identifierAuthProvider = new StubIdentifierAuthProvider();
      vi.spyOn(
        identifierAuthProvider,
        'getKeyBoundIdentifierLogin',
      ).mockImplementation(async (params) => ({
        token: {
          identifier: OTHER_PASSKEY,
          proofPublicKey: params.proofPublicKey,
          requestHash: params.requestHash,
          providerAssertion: {},
        },
      }));
      await withController(
        { identifierAuthProvider },
        async ({ controller }) => {
          await expect(
            controller.authenticateIdentifier(PASSKEY),
          ).rejects.toMatchObject({ code: 'invalid_identifier_token' });
        },
      );
    });

    it('rejects updateRecoverySecret when the token is for another identifier', async () => {
      await withController(async ({ controller, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(
          options.identifierAuthProvider,
          'getKeyBoundIdentifierLogin',
        ).mockImplementation(async (params) => ({
          token: {
            identifier: OTHER_PASSKEY,
            proofPublicKey: params.proofPublicKey,
            requestHash: params.requestHash,
            providerAssertion: {},
          },
        }));

        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toMatchObject({ code: 'invalid_identifier_token' });
      });
    });

    describe('with a seedless login provider', () => {
      it('returns seedless auth data beside key-bound recovery session from one login', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            const login = vi.spyOn(
              identifierAuthProvider,
              'getKeyBoundIdentifierLogin',
            );

            const { session, seedlessAuthData } =
              await controller.authenticateIdentifier(SOCIAL);

            expect(login).toHaveBeenCalledTimes(1);
            expect(seedlessAuthData).toStrictEqual(STUB_SEEDLESS_AUTH_DATA);
            expect(session).not.toHaveProperty('seedlessAuthData');
            expect(session.token.identifier).toStrictEqual(SOCIAL);
            expect(session.token.providerAssertion).toMatchObject({
              providerIdToken: 'provider-id-token',
            });
            expect(session.token.proofPublicKey).toStrictEqual(
              login.mock.calls[0][0].proofPublicKey,
            );
            expect(session.token.requestHash).toBe(
              await hash({
                operation: 'getRecoverySecret',
                requestId: session.requestId,
                pkE: session.pkE,
              }),
            );
            expect(session.proofPrivateKey).toBeInstanceOf(Uint8Array);
            expect(session.ephemeralPrivateKey).toBeInstanceOf(Uint8Array);
          },
        );
      });

      it('is callable through the messenger', async () => {
        await withController(
          { identifierAuthProvider: new StubSeedlessIdentifierAuthProvider() },
          async ({ rootMessenger }) => {
            const result = await rootMessenger.call(
              'MfaRecoveryController:authenticateIdentifier',
              SOCIAL,
            );

            expect(result.seedlessAuthData).toStrictEqual(
              STUB_SEEDLESS_AUTH_DATA,
            );
            expect(result.session).not.toHaveProperty('seedlessAuthData');
          },
        );
      });

      it('reads the recovery secret with the same session without another login', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await controller.register(SECRET, IDENTIFIERS);
            const login = vi.spyOn(
              identifierAuthProvider,
              'getKeyBoundIdentifierLogin',
            );

            const { session } = await controller.authenticateIdentifier(SOCIAL);
            const recovered = await controller.getRecoverySecret(session);

            expect(bytesToHex(recovered.recoverySecret)).toBe(
              bytesToHex(SECRET),
            );
            expect(recovered.epoch).toBe(REGISTERED_EPOCH);
            expect(login).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('does not send seedless auth data to escrows', async () => {
        await withController(
          { identifierAuthProvider: new StubSeedlessIdentifierAuthProvider() },
          async ({ controller, escrowA }) => {
            await controller.register(SECRET, IDENTIFIERS);
            const getSecret = vi.spyOn(escrowA, 'getSecret');

            const { session, seedlessAuthData } =
              await controller.authenticateIdentifier(SOCIAL);
            await controller.getRecoverySecret(session);

            const sent = JSON.stringify(getSecret.mock.calls[0]);
            for (const token of [
              ...STUB_SEEDLESS_AUTH_DATA.idTokens,
              STUB_SEEDLESS_AUTH_DATA.accessToken,
              STUB_SEEDLESS_AUTH_DATA.metadataAccessToken,
              STUB_SEEDLESS_AUTH_DATA.refreshToken,
              STUB_SEEDLESS_AUTH_DATA.revokeToken,
            ]) {
              expect(sent).not.toContain(token);
            }
            expect(seedlessAuthData).toBeDefined();
            expect(getSecret.mock.calls[0][1].token).not.toHaveProperty(
              'seedlessAuthData',
            );
            expect(session).not.toHaveProperty('seedlessAuthData');
          },
        );
      });

      it('does not request an AAL2 approval while authenticating', async () => {
        await withController(
          { identifierAuthProvider: new StubSeedlessIdentifierAuthProvider() },
          async ({ controller, authProvider }) => {
            const authorize = vi.spyOn(
              authProvider,
              'authorizeRecoveryRequest',
            );

            await controller.authenticateIdentifier(SOCIAL);

            expect(authorize).not.toHaveBeenCalled();
          },
        );
      });

      it('returns only the documented seedless auth data fields', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        identifierAuthProvider.seedlessAuthData = {
          ...STUB_SEEDLESS_AUTH_DATA,
          skipLock: true,
          aal: 2,
        } as SeedlessAuthData;
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            const { seedlessAuthData } =
              await controller.authenticateIdentifier(SOCIAL);

            expect(seedlessAuthData).toStrictEqual(STUB_SEEDLESS_AUTH_DATA);
          },
        );
      });

      it('accepts seedless auth data without optional fields', async () => {
        const {
          groupedAuthConnectionId: _groupedAuthConnectionId,
          socialLoginEmail: _socialLoginEmail,
          ...required
        } = STUB_SEEDLESS_AUTH_DATA;
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        identifierAuthProvider.seedlessAuthData = required;
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            const { seedlessAuthData } =
              await controller.authenticateIdentifier(SOCIAL);

            expect(seedlessAuthData).toStrictEqual(required);
          },
        );
      });

      it('returns seedless auth data without revokeToken for the client to check', async () => {
        const { revokeToken: _revokeToken, ...withoutRevoke } =
          STUB_SEEDLESS_AUTH_DATA;
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        identifierAuthProvider.seedlessAuthData = withoutRevoke;
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            const { seedlessAuthData } =
              await controller.authenticateIdentifier(SOCIAL);

            expect(seedlessAuthData).toStrictEqual(withoutRevoke);
          },
        );
      });

      it('rejects seedless auth data whose authConnection does not match the identifier', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        identifierAuthProvider.seedlessAuthData = {
          ...STUB_SEEDLESS_AUTH_DATA,
          authConnection: AuthConnection.Apple,
        };
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await expect(
              controller.authenticateIdentifier(SOCIAL),
            ).rejects.toMatchObject({ code: 'invalid_seedless_auth_data' });
          },
        );
      });

      it('accepts a token that discovers the provider subject when request value is empty', async () => {
        const socialWithoutSubject: Identifier = { ...SOCIAL, value: '' };
        const providerSubject = 'provider-oidc-sub';
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        const login = identifierAuthProvider.getKeyBoundIdentifierLogin.bind(
          identifierAuthProvider,
        );
        vi.spyOn(
          identifierAuthProvider,
          'getKeyBoundIdentifierLogin',
        ).mockImplementation(async (params) => {
          const result = await login(params);
          return {
            ...result,
            token: {
              ...result.token,
              identifier: {
                ...params.identifier,
                value: providerSubject,
              },
            },
          };
        });
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            const { session, seedlessAuthData } =
              await controller.authenticateIdentifier(socialWithoutSubject);

            expect(seedlessAuthData).toStrictEqual(STUB_SEEDLESS_AUTH_DATA);
            expect(session.token.identifier).toStrictEqual({
              ...socialWithoutSubject,
              value: providerSubject,
            });
          },
        );
      });

      it('rejects an empty request value when the token also has an empty value', async () => {
        const socialWithoutSubject: Identifier = { ...SOCIAL, value: '' };
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await expect(
              controller.authenticateIdentifier(socialWithoutSubject),
            ).rejects.toMatchObject({ code: 'invalid_identifier_token' });
          },
        );
      });

      it('rejects seedless auth data for a non-social identifier', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await expect(
              controller.authenticateIdentifier(PASSKEY),
            ).rejects.toMatchObject({ code: 'invalid_seedless_auth_data' });
          },
        );
      });

      it('returns a recovery session without seedless auth data when the login returns none', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        identifierAuthProvider.seedlessAuthData = undefined;
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await controller.register(SECRET, IDENTIFIERS);

            const result = await controller.authenticateIdentifier(PASSKEY);
            const recovered = await controller.getRecoverySecret(
              result.session,
            );

            expect(result).not.toHaveProperty('seedlessAuthData');
            expect(bytesToHex(recovered.recoverySecret)).toBe(
              bytesToHex(SECRET),
            );
          },
        );
      });

      it.each([
        {
          name: 'a missing access token',
          update: ({
            accessToken: _accessToken,
            ...rest
          }: SeedlessAuthData): unknown => rest,
        },
        {
          name: 'a missing metadata access token',
          update: ({
            metadataAccessToken: _metadataAccessToken,
            ...rest
          }: SeedlessAuthData): unknown => rest,
        },
        {
          name: 'an empty refresh token',
          update: (data: SeedlessAuthData): unknown => ({
            ...data,
            refreshToken: '',
          }),
        },
        {
          name: 'no ID tokens',
          update: (data: SeedlessAuthData): unknown => ({
            ...data,
            idTokens: [],
          }),
        },
        {
          name: 'an empty ID token',
          update: (data: SeedlessAuthData): unknown => ({
            ...data,
            idTokens: [''],
          }),
        },
        {
          name: 'a missing user id',
          update: ({ userId: _userId, ...rest }: SeedlessAuthData): unknown =>
            rest,
        },
        {
          name: 'a non-string revoke token',
          update: (data: SeedlessAuthData): unknown => ({
            ...data,
            revokeToken: 1,
          }),
        },
        {
          name: 'an empty revoke token',
          update: (data: SeedlessAuthData): unknown => ({
            ...data,
            revokeToken: '',
          }),
        },
        {
          name: 'an unsupported auth connection',
          update: (data: SeedlessAuthData): unknown => ({
            ...data,
            authConnection: 'facebook',
          }),
        },
        {
          name: 'a non-object value',
          update: (): unknown => 'seedless-tokens',
        },
      ])('rejects seedless auth data with $name', async ({ update }) => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        identifierAuthProvider.seedlessAuthData = update(
          STUB_SEEDLESS_AUTH_DATA,
        ) as SeedlessAuthData;
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await expect(
              controller.authenticateIdentifier(SOCIAL),
            ).rejects.toMatchObject({ code: 'invalid_seedless_auth_data' });
          },
        );
      });

      it.each([
        {
          name: 'no login result',
          update: (): unknown => undefined,
        },
        {
          name: 'no token',
          update: ({ seedlessAuthData }: KeyBoundIdentifierLogin): unknown => ({
            seedlessAuthData,
          }),
        },
        {
          name: 'a null token',
          update: (login: KeyBoundIdentifierLogin): unknown => ({
            ...login,
            token: null,
          }),
        },
        {
          name: 'a token bound to another request',
          update: (login: KeyBoundIdentifierLogin): unknown => ({
            ...login,
            token: { ...login.token, requestHash: '0xother' },
          }),
        },
        {
          name: 'a token bound to another proof key',
          update: (login: KeyBoundIdentifierLogin): unknown => ({
            ...login,
            token: { ...login.token, proofPublicKey: new Uint8Array(32) },
          }),
        },
        {
          name: 'a token with a non-byte proof key',
          update: (login: KeyBoundIdentifierLogin): unknown => ({
            ...login,
            token: {
              ...login.token,
              proofPublicKey: bytesToHex(login.token.proofPublicKey),
            },
          }),
        },
        {
          name: 'a token for another identifier',
          update: (login: KeyBoundIdentifierLogin): unknown => ({
            ...login,
            token: {
              ...login.token,
              identifier: {
                ...SOCIAL,
                value: 'other-user',
              },
            },
          }),
        },
        {
          name: 'a token with a different identifier type',
          update: (login: KeyBoundIdentifierLogin): unknown => ({
            ...login,
            token: {
              ...login.token,
              identifier: {
                ...SOCIAL,
                type: 'passkey',
              },
            },
          }),
        },
        {
          name: 'a token with a different identifier namespace',
          update: (login: KeyBoundIdentifierLogin): unknown => ({
            ...login,
            token: {
              ...login.token,
              identifier: {
                ...SOCIAL,
                namespace: 'https://appleid.apple.com',
              },
            },
          }),
        },
      ])('rejects a login with $name', async ({ update }) => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        const login = identifierAuthProvider.getKeyBoundIdentifierLogin.bind(
          identifierAuthProvider,
        );
        vi.spyOn(
          identifierAuthProvider,
          'getKeyBoundIdentifierLogin',
        ).mockImplementation(
          async (params) =>
            update(await login(params)) as KeyBoundIdentifierLogin,
        );
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await expect(
              controller.authenticateIdentifier(SOCIAL),
            ).rejects.toMatchObject({ code: 'invalid_identifier_token' });
          },
        );
      });

      it('propagates a failed provider token exchange', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        vi.spyOn(
          identifierAuthProvider,
          'getKeyBoundIdentifierLogin',
        ).mockRejectedValue(new Error('token exchange failed'));
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await expect(
              controller.authenticateIdentifier(SOCIAL),
            ).rejects.toThrow('token exchange failed');
          },
        );
      });

      it('does not send seedless auth data to escrows on writes', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        await withController(
          { identifierAuthProvider },
          async ({ controller, escrowA }) => {
            await controller.register(SECRET, IDENTIFIERS);
            const login = vi.spyOn(
              identifierAuthProvider,
              'getKeyBoundIdentifierLogin',
            );
            const applyMutation = vi.spyOn(escrowA, 'applyMutation');

            await controller.updateRecoverySecret(
              SOCIAL,
              SECRET_2,
              REGISTERED_EPOCH,
            );

            expect(login).toHaveBeenCalledTimes(1);
            const sent = JSON.stringify(applyMutation.mock.calls[0]);
            for (const token of [
              ...STUB_SEEDLESS_AUTH_DATA.idTokens,
              STUB_SEEDLESS_AUTH_DATA.accessToken,
              STUB_SEEDLESS_AUTH_DATA.metadataAccessToken,
              STUB_SEEDLESS_AUTH_DATA.refreshToken,
              STUB_SEEDLESS_AUTH_DATA.revokeToken,
            ]) {
              expect(sent).not.toContain(token);
            }
          },
        );
      });

      it('ignores invalid seedless auth data on writes', async () => {
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        identifierAuthProvider.seedlessAuthData = {
          ...STUB_SEEDLESS_AUTH_DATA,
          authConnection: AuthConnection.Apple,
        };
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await controller.register(SECRET, IDENTIFIERS);

            expect(
              await controller.updateRecoverySecret(
                SOCIAL,
                SECRET_2,
                REGISTERED_EPOCH,
              ),
            ).toBeUndefined();
          },
        );
      });

      it('rejects empty identifier values on writes even when the token discovers a subject', async () => {
        const socialWithoutSubject: Identifier = { ...SOCIAL, value: '' };
        const identifierAuthProvider = new StubSeedlessIdentifierAuthProvider();
        const login = identifierAuthProvider.getKeyBoundIdentifierLogin.bind(
          identifierAuthProvider,
        );
        vi.spyOn(
          identifierAuthProvider,
          'getKeyBoundIdentifierLogin',
        ).mockImplementation(async (params) => {
          const result = await login(params);
          return {
            ...result,
            token: {
              ...result.token,
              identifier: {
                ...params.identifier,
                value: 'provider-oidc-sub',
              },
            },
          };
        });
        await withController(
          { identifierAuthProvider },
          async ({ controller }) => {
            await controller.register(SECRET, IDENTIFIERS);

            await expect(
              controller.updateRecoverySecret(
                socialWithoutSubject,
                SECRET_2,
                REGISTERED_EPOCH,
              ),
            ).rejects.toMatchObject({ code: 'invalid_identifier_token' });
          },
        );
      });
    });
  });

  describe('getRecoverySecret', () => {
    it('requests a request-bound AAL2 approval for each read', async () => {
      await withController(async ({ controller, authProvider, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const authorize = vi.spyOn(authProvider, 'authorizeRecoveryRequest');
        const generateChallenge = vi.spyOn(escrowA, 'generateChallenge');
        const { session } = await controller.authenticateIdentifier(PASSKEY);
        await controller.getRecoverySecret(session);
        expect(authorize).toHaveBeenCalledExactlyOnceWith({
          requestHash: session.token.requestHash,
          audiences: ['stub-audience', 'stub-audience'],
          requireTwoFactor: true,
        });
        const { approval } = await authorize.mock.results[0].value;
        expect(generateChallenge).toHaveBeenCalledExactlyOnceWith(approval);
      });
    });

    it('reads the highest version while a mutation is writing', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET_2));
        expect(recovered.epoch).toBe(REGISTERED_EPOCH + 1);
        expect(await controller.getPhase()).toBe('writing');
      });
    });

    it('returns the selected epoch so a later update can be formed', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
        expect(recovered.epoch).toBe(REGISTERED_EPOCH);

        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          recovered.epoch,
        );
        const afterUpdate = await recover(controller, PASSKEY);
        expect(bytesToHex(afterUpdate.recoverySecret)).toBe(
          bytesToHex(SECRET_2),
        );
        expect(afterUpdate.epoch).toBe(REGISTERED_EPOCH + 1);
      });
    });

    it('returns the highest consistent version when one escrow is down', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.available = false;
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('continues reading when an escrow availability check fails', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'isAvailable').mockRejectedValue(
          new Error('health check failed'),
        );

        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('continues reading when key-bound authorization fails for one escrow', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'generateChallenge').mockRejectedValue(
          new Error('challenge failed'),
        );

        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('continues reading when an escrow returns an unexpected wrap key id', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'getSecret').mockResolvedValue({
          recoverySecret: { ciphertext: new Uint8Array([0xaa]) },
          version: 1,
          lastMutationId: '0x',
          wrapKeyId: '0xdead',
        });
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('throws when matching versions disagree', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.patchRecord('profile-1', {
          lastMutationId: '0xdifferent',
        });
        await expect(recover(controller, PASSKEY)).rejects.toThrow(
          'Replica corruption',
        );
      });
    });

    it('throws when no escrow is available', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.available = false;
        escrowB.available = false;
        await expect(recover(controller, PASSKEY)).rejects.toThrow(
          'No escrow is available',
        );
      });
    });

    it('throws when every available escrow fails the read', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failGetSecret = true;
        escrowB.failGetSecret = true;
        await expect(recover(controller, PASSKEY)).rejects.toThrow(
          'No escrow returned a recovery secret',
        );
      });
    });
  });

  describe('configured escrows', () => {
    it('uses a snapshot of the configured escrow array', async () => {
      await withController(
        async ({ controller, escrowA, escrowB, options }) => {
          options.escrows.splice(0, options.escrows.length);

          await controller.register(SECRET, IDENTIFIERS);

          expect(await escrowA.getRecoveryMetadata('profile-1')).toStrictEqual({
            version: 1,
            lastMutationId: expect.any(String) as string,
          });
          expect(await escrowB.getRecoveryMetadata('profile-1')).toStrictEqual({
            version: 1,
            lastMutationId: expect.any(String) as string,
          });
        },
      );
    });
  });

  describe('updateRecoverySecret', () => {
    it('replaces the secret at every escrow', async () => {
      await withController(async ({ controller, escrowA }) => {
        const generateChallenge = vi.spyOn(escrowA, 'generateChallenge');
        await controller.register(SECRET, IDENTIFIERS);
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(generateChallenge).toHaveBeenCalledExactlyOnceWith(
          apply.mock.calls[0][1],
        );
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET_2));
      });
    });

    it('throws when a configured escrow is unavailable', async () => {
      await withController(async ({ controller, escrowB, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.available = false;
        const auth = vi.spyOn(options.authProvider, 'authorizeRecoveryRequest');
        auth.mockClear();
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow('All configured escrows are required for mutation');
        expect(auth).not.toHaveBeenCalled();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('does not authorize a resumed authorizing mutation when an escrow is unavailable', async () => {
      await withController(async ({ controller, escrowB, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const auth = vi
          .spyOn(options.authProvider, 'authorizeRecoveryRequest')
          .mockRejectedValueOnce(new Error('auth down'));
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow('auth down');
        expect(await controller.getPhase()).toBe('authorizing');

        escrowB.available = false;
        auth.mockClear();
        await expect(controller.resume()).rejects.toThrow(
          'All configured escrows are required for mutation',
        );
        expect(auth).not.toHaveBeenCalled();
        expect(await controller.getPhase()).toBe('authorizing');
        await controller.abort();
      });
    });

    it('does not write when one escrow cannot be authorized', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'generateChallenge').mockRejectedValue(
          new Error('challenge failed'),
        );
        const applyA = vi.spyOn(escrowA, 'applyMutation');
        const applyB = vi.spyOn(escrowB, 'applyMutation');

        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow('Unable to authorize every escrow');

        expect(applyA).not.toHaveBeenCalled();
        expect(applyB).not.toHaveBeenCalled();
        expect(await controller.getPhase()).toBe('authorizing');
        await controller.abort();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('persists writing state when every escrow apply fails', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;

        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');
        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('persists writing state before the first escrow write', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);

        let releaseApply = (): void => undefined;
        let resolveApplyStarted = (): void => undefined;
        const applyGate = new Promise<void>((resolve) => {
          releaseApply = resolve;
        });
        const applyStarted = new Promise<void>((resolve) => {
          resolveApplyStarted = resolve;
        });
        vi.spyOn(escrowA, 'applyMutation').mockImplementation(async () => {
          resolveApplyStarted();
          await applyGate;
          throw new Error('apply failed');
        });

        const mutation = controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        await applyStarted;

        expect(
          JSON.parse(controller.state.pendingOperation as string),
        ).toStrictEqual(
          expect.objectContaining({
            phase: 'writing',
            receipts: [],
          }),
        );

        releaseApply();
        await expect(mutation).rejects.toBeInstanceOf(IncompleteMutationError);
      });
    });

    it('throws when replicas disagree on version', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.patchRecord('profile-1', { version: 2 });
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
      });
    });

    it('drops an update every escrow rejects for a stale epoch', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, 0),
        ).rejects.toBeInstanceOf(MutationRejectedError);
        expect(await controller.getPhase()).toBe('idle');
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(
          bytesToHex((await recover(controller, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET_2));
      });
    });

    it('cannot abort a writing mutation that may have been applied', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');
        now += 10 * 60;
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
        expect(await controller.getPhase()).toBe('writing');
      });
    });

    it('refuses a new mutation while one is pending', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow(
          'A pending mutation must be resumed or aborted first',
        );
        expect(await controller.getPhase()).toBe('writing');
        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('throws when a replica is missing the recovery record', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.clearRecord('profile-1');
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
      });
    });

    it('throws when the supplied epoch is invalid', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, 1.5),
        ).rejects.toThrow('Invalid epoch');
      });
    });
  });

  describe('getIdentifiers', () => {
    it('returns the enrolled identifiers, epoch and Auth identifiers', async () => {
      await withController(async ({ controller, authProvider }) => {
        await controller.register(SECRET, IDENTIFIERS);
        authProvider.identifiers = [...IDENTIFIERS, OTHER_PASSKEY];
        const authorize = vi.spyOn(authProvider, 'authorizeRecoveryRequest');
        expect(await controller.getIdentifiers()).toStrictEqual({
          identifiers: IDENTIFIERS,
          epoch: REGISTERED_EPOCH,
          authIdentifiers: authProvider.identifiers,
        });
        expect(authorize).toHaveBeenCalledExactlyOnceWith({
          requestHash: await hash({ operation: 'getIdentifiers' }),
          audiences: ['stub-audience', 'stub-audience'],
        });
      });
    });

    it('returns the highest version when one escrow is behind', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        options.authProvider.identifiers = [...IDENTIFIERS, OTHER_PASSKEY];
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateIdentifiers(
            PASSKEY,
            [SOCIAL, OTHER_PASSKEY],
            REGISTERED_EPOCH,
          ),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getIdentifiers()).toMatchObject({
          identifiers: [SOCIAL, OTHER_PASSKEY],
          epoch: REGISTERED_EPOCH + 1,
        });
      });
    });

    it('throws when replicas at the same version disagree', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'getIdentifiers').mockResolvedValue({
          identifiers: [SOCIAL, OTHER_PASSKEY],
          version: REGISTERED_EPOCH,
        });
        await expect(controller.getIdentifiers()).rejects.toMatchObject({
          code: 'replica_corruption',
        });
      });
    });

    it('throws when no escrow returns identifiers', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.getIdentifiers()).rejects.toMatchObject({
          code: 'read_failed',
        });
      });
    });

    it('throws when no escrow is available', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.available = false;
        escrowB.available = false;
        await expect(controller.getIdentifiers()).rejects.toMatchObject({
          code: 'no_available_escrow',
        });
      });
    });
  });

  describe('updateIdentifiers', () => {
    it('replaces the identifier set', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await controller.updateIdentifiers(
          PASSKEY,
          [SOCIAL, PASSKEY],
          REGISTERED_EPOCH,
        );
        const recovered = await recover(controller, SOCIAL);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('rejects an empty identifier list', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.updateIdentifiers(PASSKEY, [], REGISTERED_EPOCH),
        ).rejects.toThrow('Requires at least 2 identifiers');
      });
    });
  });

  describe('Auth identifiers', () => {
    it('sends the caller identifiers with all Auth-approved identifiers', async () => {
      await withController(async ({ controller, authProvider, escrowA }) => {
        authProvider.identifiers = [SOCIAL, OTHER_PASSKEY, PASSKEY];
        const authorize = vi.spyOn(authProvider, 'authorizeRecoveryRequest');
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.register(SECRET, IDENTIFIERS);
        expect(authorize).toHaveBeenCalledExactlyOnceWith({
          requestHash: apply.mock.calls[0][0].requestHash,
          audiences: ['stub-audience', 'stub-audience'],
          requireTwoFactor: true,
        });
        expect(apply.mock.calls[0][3]).toMatchObject({
          identifiers: IDENTIFIERS,
        });
        expect(apply.mock.calls[0][4]).toStrictEqual(authProvider.identifiers);
      });
    });

    it.each([
      ['an identifier Auth did not approve', [SOCIAL, OTHER_PASSKEY]],
      [
        'a stale passkey verifier',
        [{ ...PASSKEY, verifier: { publicKey: 'rotated' } }, SOCIAL],
      ],
    ])(
      'rejects %s before writing, leaving the mutation abortable',
      async (_name, approved) => {
        await withController(async ({ controller, authProvider, escrowA }) => {
          authProvider.identifiers = approved;
          const apply = vi.spyOn(escrowA, 'applyMutation');
          await expect(
            controller.register(SECRET, IDENTIFIERS),
          ).rejects.toMatchObject({ code: 'invalid_pending_operation' });
          expect(apply).not.toHaveBeenCalled();
          expect(await controller.getPhase()).toBe('authorizing');
          await controller.abort();
          expect(await controller.getPhase()).toBe('idle');
        });
      },
    );
  });

  describe('SIWE identifiers', () => {
    const LOWERCASE_WALLET = { ...WALLET, value: WALLET.value.toLowerCase() };
    it.each([
      [
        'only address casing variants',
        [WALLET, LOWERCASE_WALLET],
        'too_few_identifiers',
      ],
      [
        'address casing duplicates',
        [PASSKEY, WALLET, LOWERCASE_WALLET],
        'duplicate_identifier',
      ],
      [
        'a malformed address',
        [PASSKEY, { ...WALLET, value: '0x1234' }],
        'invalid_identifier',
      ],
      ...['example.com/login', 'example .com'].map((domain) => [
        `the domain ${domain}`,
        [
          PASSKEY,
          {
            ...WALLET,
            namespace: `${domain}:1`,
            verifier: { domain, chainId: 1 },
          },
        ],
        'invalid_identifier',
      ]),
      [
        'more than 16 identifiers',
        Array.from({ length: 17 }, (_, index) => ({
          ...SOCIAL,
          value: `user-${index}`,
        })),
        'too_many_identifiers',
      ],
    ] as [string, Identifier[], string][])(
      'rejects %s before authorization',
      async (_, identifiers, code) => {
        await withController(async ({ controller, authProvider, options }) => {
          const authorize = vi.spyOn(authProvider, 'authorizeRecoveryRequest');
          const login = vi.spyOn(
            options.identifierAuthProvider,
            'getKeyBoundIdentifierLogin',
          );

          await expect(
            controller.register(SECRET, identifiers),
          ).rejects.toMatchObject({ code });
          await expect(
            controller.updateIdentifiers(
              PASSKEY,
              identifiers,
              REGISTERED_EPOCH,
            ),
          ).rejects.toMatchObject({ code });
          expect(authorize).not.toHaveBeenCalled();
          expect(login).not.toHaveBeenCalled();
          expect(controller.state.pendingOperation).toBeNull();
        });
      },
    );

    it('proves each SIWE identifier at register', async () => {
      await withController(async ({ controller, escrowA }) => {
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.register(SECRET, [PASSKEY, WALLET]);
        expect(
          apply.mock.calls[0][2].map(({ token }) => token.identifier),
        ).toStrictEqual([WALLET]);
      });
    });

    it('proves an added SIWE identifier with the enrolled identifier on one challenge', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.updateIdentifiers(
          PASSKEY,
          [SOCIAL, WALLET],
          REGISTERED_EPOCH,
        );
        const authorizations = apply.mock.calls[0][2];
        expect(
          authorizations.map(({ token }) => token.identifier),
        ).toStrictEqual([PASSKEY, WALLET]);
        expect(
          new Set(authorizations.map(({ proof }) => proof.challengeId)).size,
        ).toBe(1);
      });
    });

    it('does not prove an enrolled SIWE identifier in another address case', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, [PASSKEY, WALLET]);
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.updateIdentifiers(
          PASSKEY,
          [SOCIAL, { ...WALLET, value: WALLET.value.toLowerCase() }],
          REGISTERED_EPOCH,
        );
        expect(
          apply.mock.calls[0][2].map(({ token }) => token.identifier),
        ).toStrictEqual([PASSKEY]);
      });
    });

    it('does not prove SIWE identifiers to an escrow that already applied the mutation', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.invalidReceipts = true;
        await expect(
          controller.updateIdentifiers(
            PASSKEY,
            [SOCIAL, WALLET],
            REGISTERED_EPOCH,
          ),
        ).rejects.toThrow('Invalid mutation receipt');
        escrowA.invalidReceipts = false;
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.resume();
        expect(
          apply.mock.calls[0][2].map(({ token }) => token.identifier),
        ).toStrictEqual([PASSKEY]);
        expect(await controller.getPhase()).toBe('idle');
      });
    });
  });

  describe('resume and abort', () => {
    it('resumes a persisted writing mutation after a replica failure', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');

        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET_2));
      });
    });

    it('clears a persisted writing mutation that every escrow rejects', async () => {
      await withController(
        async ({ controller, escrowA, escrowB, options }) => {
          await controller.register(SECRET, IDENTIFIERS);
          const pending = await getValidWritingPending([escrowA, escrowB], 0);
          const resumed = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger()),
            state: {
              pendingOperation: await passthroughEncryptor.encrypt(pending),
            },
          });

          await expect(resumed.resume()).rejects.toBeInstanceOf(
            MutationRejectedError,
          );
          expect(await resumed.getPhase()).toBe('idle');
          await resumed.updateRecoverySecret(
            PASSKEY,
            SECRET_2,
            REGISTERED_EPOCH,
          );
          expect(await resumed.getPhase()).toBe('idle');
        },
      );
    });

    it('keeps a writing mutation that one escrow already acknowledged', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        escrowA.patchRecord('profile-1', { version: 9 });

        await expect(controller.resume()).rejects.toBeInstanceOf(
          IncompleteMutationError,
        );
        expect(await controller.getPhase()).toBe('writing');
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
      });
    });

    it('repairs only the missing replica when an acknowledged replica is offline', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        escrowB.available = false;

        await controller.resume();

        expect(await controller.getPhase()).toBe('idle');
        expect(
          bytesToHex((await recover(controller, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET_2));
      });
    });

    it('clears a fully acknowledged mutation without checking escrow availability', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const pending = await getValidWritingPending([escrowA, escrowB]);
        pending.receipts = await Promise.all(
          [escrowA, escrowB].map(async (escrow) =>
            escrow.createReceipt(pending.mutation),
          ),
        );
        const encrypted = await passthroughEncryptor.encrypt(pending);
        const availabilityA = vi.spyOn(escrowA, 'isAvailable');
        const availabilityB = vi.spyOn(escrowB, 'isAvailable');
        availabilityA.mockClear();
        availabilityB.mockClear();
        escrowA.available = false;
        escrowB.available = false;

        const resumed = new MfaRecoveryController({
          ...getOptions(escrowA, escrowB),
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: encrypted },
        });

        await resumed.resume();

        expect(await resumed.getPhase()).toBe('idle');
        expect(availabilityA).not.toHaveBeenCalled();
        expect(availabilityB).not.toHaveBeenCalled();
      });
    });

    it('aborts a writing mutation no escrow applied once its approval expires', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );

        now += 10 * 60;
        vi.spyOn(escrowB, 'getIdentifiers').mockRejectedValueOnce(
          new Error('offline'),
        );
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
        await controller.abort();

        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('clears instead of resuming a writing mutation no escrow applied once its approval expires', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        const authorize = vi.spyOn(
          options.authProvider,
          'authorizeRecoveryRequest',
        );

        now += 10 * 60;
        await expect(controller.resume()).rejects.toBeInstanceOf(
          MutationRejectedError,
        );

        expect(await controller.getPhase()).toBe('idle');
        expect(authorize).not.toHaveBeenCalledWith(
          expect.objectContaining({ requireTwoFactor: true }),
        );
      });
    });

    it('aborts a writing mutation no escrow applied when an escrow lags', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.patchRecord('profile-1', { version: REGISTERED_EPOCH + 1 });
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(
            PASSKEY,
            SECRET_2,
            REGISTERED_EPOCH + 1,
          ),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        now += 10 * 60;
        await controller.abort();

        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('aborts a writing register no escrow applied once its approval expires', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          now: (): number => now,
        });
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        // Escrows read a missing record as version 0.
        for (const escrow of [escrowA, escrowB]) {
          vi.spyOn(escrow, 'getIdentifiers').mockResolvedValue({
            identifiers: [],
            version: 0,
          });
        }

        now += 10 * 60;
        await controller.abort();

        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('aborts an authorizing mutation and refuses to abort writing', async () => {
      await withController(async ({ options }) => {
        const validPending = await getValidWritingPending(options.escrows);
        const authorizing = await passthroughEncryptor.encrypt({
          phase: 'authorizing',
          mutation: validPending.mutation,
          payload: validPending.payload,
          identifier: validPending.identifier,
        });
        const authorizingMessenger = getMessenger(getRootMessenger());
        const idleController = new MfaRecoveryController({
          ...options,
          messenger: authorizingMessenger,
          state: { pendingOperation: authorizing },
        });
        expect(await idleController.getPhase()).toBe('authorizing');
        await idleController.abort();
        expect(await idleController.getPhase()).toBe('idle');

        const writing = await passthroughEncryptor.encrypt({
          ...validPending,
          receipts: [
            {
              mutationId: validPending.mutation.id,
              requestHash: validPending.mutation.requestHash,
              escrowId: 'escrow-a',
              version: validPending.mutation.newVersion,
              receiptKeyId: '0xreceipt',
              signature: '0xsignature',
            },
          ],
        });
        const writingMessenger = getMessenger(getRootMessenger());
        const writingController = new MfaRecoveryController({
          ...options,
          messenger: writingMessenger,
          state: { pendingOperation: writing },
        });
        await expect(writingController.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
        expect(await writingController.getPhase()).toBe('writing');
      });
    });

    it('resumes an authorizing mutation', async () => {
      await withController(async ({ options }) => {
        const payload = {
          identifiers: IDENTIFIERS,
          recoverySecret: bytesToHex(SECRET),
        };
        const payloadHash = await hash(payload);
        const fields = {
          id: '0xmutauth',
          profileId: 'profile-1',
          operation: 'register' as const,
          expectedVersion: 0,
          newVersion: 1,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
        };
        const mutation = {
          ...fields,
          requestHash: await hash(fields),
        };
        const authorizing = await passthroughEncryptor.encrypt({
          phase: 'authorizing',
          mutation,
          payload,
          identifier: null,
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: authorizing },
        });
        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
        expect(
          bytesToHex((await recover(controller, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET));
      });
    });

    it('resumes a persisted authorizing updateIdentifiers mutation', async () => {
      await withController(async ({ controller, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const payload = { identifiers: IDENTIFIERS };
        const payloadHash = await hash(payload);
        const mutationFields = {
          id: '0xmutidentifiers',
          profileId: 'profile-1',
          operation: 'updateIdentifiers' as const,
          expectedVersion: 1,
          newVersion: 2,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
        };
        const mutation = {
          ...mutationFields,
          requestHash: await hash(mutationFields),
        };
        const authorizing = {
          phase: 'authorizing' as const,
          mutation,
          payload,
          identifier: PASSKEY,
        };
        const resumed = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: {
            pendingOperation: await passthroughEncryptor.encrypt(authorizing),
          },
        });

        await resumed.resume();

        expect(await resumed.getPhase()).toBe('idle');
        expect(
          bytesToHex((await recover(resumed, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET));
      });
    });

    it('is a no-op to resume or abort when idle', async () => {
      await withController(async ({ controller }) => {
        await controller.resume();
        await controller.abort();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('clears a writing mutation that already has every receipt', async () => {
      await withController(
        async ({ controller, options, escrowA, escrowB }) => {
          await controller.register(SECRET, IDENTIFIERS);
          const payload = {
            recoverySecret: bytesToHex(SECRET_2),
          };
          const mutation = {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'updateRecoverySecret' as const,
            expectedVersion: 1,
            newVersion: 2,
            payloadHash: await hash(payload),
            audiences: ['escrow-a', 'escrow-b'],
            requestHash: '0x',
          };
          mutation.requestHash = await hash({
            id: mutation.id,
            profileId: mutation.profileId,
            operation: mutation.operation,
            expectedVersion: mutation.expectedVersion,
            newVersion: mutation.newVersion,
            payloadHash: mutation.payloadHash,
            audiences: mutation.audiences,
          });
          const receipts = [
            await escrowA.createReceipt(mutation),
            await escrowB.createReceipt(mutation),
          ];
          const writing = await passthroughEncryptor.encrypt({
            phase: 'writing',
            mutation,
            authControllerToken: createAuthControllerToken({
              sub: 'profile-1',
              exp: unixNow() + 60,
              requestHash: mutation.requestHash,
              aal: 2,
            }),
            approvedIdentifiers: IDENTIFIERS,
            payload,
            identifier: PASSKEY,
            receipts,
          });
          const resumed = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger()),
            state: { pendingOperation: writing },
          });
          await resumed.resume();
          expect(await resumed.getPhase()).toBe('idle');
        },
      );
    });

    it('rejects a persisted mutation with the wrong escrow audience', async () => {
      await withController(async ({ options }) => {
        const writing = await passthroughEncryptor.encrypt({
          phase: 'authorizing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash: '0x',
            audiences: ['escrow-other'],
            requestHash: '0x',
          },
          payload: {
            recoverySecret: bytesToHex(SECRET),
            identifiers: IDENTIFIERS,
          },
          identifier: null,
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Persisted mutation audiences do not match configured escrows',
        );
      });
    });

    it('rejects a pending payload that does not match the mutation hash', async () => {
      await withController(async ({ options }) => {
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash: '0xdead',
            audiences: ['escrow-a', 'escrow-b'],
            requestHash: '0x',
          },
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: '0x',
          }),
          approvedIdentifiers: IDENTIFIERS,
          payload: {
            recoverySecret: bytesToHex(SECRET),
            identifiers: IDENTIFIERS,
          },
          identifier: null,
          receipts: [],
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Pending payload does not match mutation',
        );
      });
    });

    it('rejects a receipt from an unknown escrow', async () => {
      await withController(async ({ options }) => {
        const payload = {
          identifiers: IDENTIFIERS,
          recoverySecret: bytesToHex(SECRET),
        };
        const payloadHash = await hash(payload);
        const mutation = {
          id: '0xmut',
          profileId: 'profile-1',
          operation: 'register' as const,
          expectedVersion: 0,
          newVersion: 1,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
          requestHash: '',
        };
        mutation.requestHash = await hash({
          id: mutation.id,
          profileId: mutation.profileId,
          operation: mutation.operation,
          expectedVersion: mutation.expectedVersion,
          newVersion: mutation.newVersion,
          payloadHash: mutation.payloadHash,
          audiences: mutation.audiences,
        });
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation,
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash,
            aal: 2,
            identifiersHash: await hash(payload.identifiers),
          }),
          approvedIdentifiers: IDENTIFIERS,
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: mutation.requestHash,
              escrowId: 'escrow-z',
              version: 1,
              receiptKeyId: '0xreceipt',
              signature: '0x',
            },
          ],
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Receipt escrow is not configured',
        );
      });
    });

    it('rejects an invalid persisted receipt', async () => {
      await withController(async ({ options, escrowA }) => {
        escrowA.invalidReceipts = true;
        const payload = {
          identifiers: IDENTIFIERS,
          recoverySecret: bytesToHex(SECRET),
        };
        const payloadHash = await hash(payload);
        const mutation = {
          id: '0xmut',
          profileId: 'profile-1',
          operation: 'register' as const,
          expectedVersion: 0,
          newVersion: 1,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
          requestHash: '',
        };
        mutation.requestHash = await hash({
          id: mutation.id,
          profileId: mutation.profileId,
          operation: mutation.operation,
          expectedVersion: mutation.expectedVersion,
          newVersion: mutation.newVersion,
          payloadHash: mutation.payloadHash,
          audiences: mutation.audiences,
        });
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation,
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash,
            aal: 2,
            identifiersHash: await hash(payload.identifiers),
          }),
          approvedIdentifiers: IDENTIFIERS,
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: mutation.requestHash,
              escrowId: 'escrow-a',
              version: 1,
              receiptKeyId: '0xreceipt',
              signature: '0x',
            },
          ],
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('rejects a newly issued invalid receipt', async () => {
      await withController(async ({ controller, escrowA }) => {
        escrowA.invalidReceipts = true;
        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('persists valid receipts before reporting an invalid receipt', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.invalidReceipts = true;

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );

        const pending = JSON.parse(
          controller.state.pendingOperation as string,
        ) as {
          receipts: { escrowId: string }[];
        };
        expect(pending.receipts).toStrictEqual([
          expect.objectContaining({ escrowId: 'escrow-b' }),
        ]);
        expect(await escrowB.getRecoveryMetadata('profile-1')).toStrictEqual({
          version: 1,
          lastMutationId: expect.any(String) as string,
        });
      });
    });

    it('rejects a receipt whose escrow id does not match its target', async () => {
      await withController(async ({ controller, escrowA }) => {
        vi.spyOn(escrowA, 'applyMutation').mockResolvedValue({
          mutationId: '0xmutation',
          requestHash: '0xrequest',
          escrowId: 'escrow-z',
          version: 1,
          receiptKeyId: '0xreceipt',
          signature: '0xsignature',
        });
        vi.spyOn(escrowA, 'verifyReceipt').mockResolvedValue(true);

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('treats receipt verification errors as invalid receipts', async () => {
      await withController(async ({ controller, escrowA }) => {
        vi.spyOn(escrowA, 'verifyReceipt').mockRejectedValue(
          new Error('verification failed'),
        );

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('refreshes an expired AuthController token while resuming', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        const pending = JSON.parse(
          controller.state.pendingOperation as string,
        ) as { mutation: { requestHash: string }; authControllerToken: string };
        pending.authControllerToken = createAuthControllerToken({
          sub: 'profile-1',
          exp: 0,
          requestHash: pending.mutation.requestHash,
          aal: 2,
        });
        const resumed = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: JSON.stringify(pending) },
        });
        options.authProvider.identifiers = [...IDENTIFIERS, OTHER_PASSKEY];
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await resumed.resume();
        expect(apply.mock.calls[0][4]).toStrictEqual(
          options.authProvider.identifiers,
        );
        expect(await resumed.getPhase()).toBe('idle');
      });
    });

    it('rejects a null decrypted pending operation before external calls', async () => {
      await withController(async ({ escrowA, escrowB, options }) => {
        const auth = vi.spyOn(options.authProvider, 'authorizeRecoveryRequest');
        const availabilityA = vi.spyOn(escrowA, 'isAvailable');
        const availabilityB = vi.spyOn(escrowB, 'isAvailable');
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: 'null' },
        });

        await expect(controller.resume()).rejects.toThrow(
          'Invalid pending operation',
        );

        expect(auth).not.toHaveBeenCalled();
        expect(availabilityA).not.toHaveBeenCalled();
        expect(availabilityB).not.toHaveBeenCalled();
      });
    });

    it.each([
      {
        name: 'an invalid phase',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.phase = 'invalid';
        },
      },
      {
        name: 'a malformed mutation',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.mutation = null;
        },
      },
      {
        name: 'an operation and payload mismatch',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'updateIdentifiers';
          pending.payload = { recoverySecret: bytesToHex(SECRET) };
        },
      },
      {
        name: 'a malformed payload',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.payload = null;
        },
      },
      {
        name: 'a payload without a recovery secret',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.payload = {};
        },
      },
      {
        name: 'an invalid recovery secret encoding',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.payload = {
            recoverySecret: '0xzz',
          };
        },
      },
      {
        name: 'an identifier payload with invalid entries',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'updateIdentifiers';
          pending.payload = { identifiers: [{}] };
        },
      },
      {
        name: 'duplicate identifiers',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          const payload = { identifiers: [PASSKEY, PASSKEY] };
          const payloadHash = await hash(payload);
          const fields = {
            id: mutation.id,
            profileId: mutation.profileId,
            operation: 'updateIdentifiers',
            expectedVersion: mutation.expectedVersion,
            newVersion: mutation.newVersion,
            payloadHash,
            audiences: mutation.audiences,
          };
          pending.mutation = {
            ...fields,
            requestHash: await hash(fields),
          };
          pending.payload = payload;
          pending.authControllerToken = createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: await hash(fields),
            identifiersHash: await hash(payload.identifiers),
          });
        },
      },
      {
        name: 'a non-null register identifier',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'register';
          pending.payload = {
            recoverySecret: bytesToHex(SECRET),
            identifiers: [PASSKEY],
          };
          pending.identifier = PASSKEY;
        },
      },
      {
        name: 'a non-zero register expectedVersion',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'register';
          mutation.expectedVersion = 1;
          mutation.newVersion = 2;
          pending.identifier = null;
          pending.payload = {
            identifiers: IDENTIFIERS,
            recoverySecret: bytesToHex(SECRET),
          };
        },
      },
      {
        name: 'a null update identifier',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.identifier = null;
        },
      },
      {
        name: 'an unknown identifier type',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.identifier = {
            type: 'unknown',
            namespace: 'example.com',
            value: 'unknown',
            verifier: null,
          };
        },
      },
      {
        name: 'a non-consecutive version',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.expectedVersion = 4;
          mutation.newVersion = 6;
        },
      },
      {
        name: 'a mismatched payload hash',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.payloadHash = '0xwrong-payload-hash';
        },
      },
      {
        name: 'a mismatched mutation request hash',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.requestHash = '0xwrong-request-hash';
        },
      },
      {
        name: 'an out-of-order audience list',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.audiences = ['escrow-b', 'escrow-a'];
        },
      },
      {
        name: 'an invalid AuthController token',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.authControllerToken = createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: '0xwrong-token-request-hash',
            aal: 2,
          });
        },
      },
      {
        name: 'a malformed AuthController token',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.authControllerToken = null;
        },
      },
      {
        name: 'an AuthController token with invalid fields',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.authControllerToken = {};
        },
      },
      {
        name: 'an AuthController token without step-up assurance',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          pending.authControllerToken = createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash as string,
          });
        },
      },
      {
        name: 'malformed approved identifiers',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.approvedIdentifiers = [{}];
        },
      },
      {
        name: 'an invalid receipt array',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.receipts = null;
        },
      },
      {
        name: 'a receipt with invalid fields',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.receipts = [{}];
        },
      },
      {
        name: 'duplicate receipts',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          const receipt = {
            mutationId: mutation.id,
            requestHash: mutation.requestHash,
            escrowId: 'escrow-a',
            version: mutation.newVersion,
            receiptKeyId: '0xreceipt',
            signature: '0xsignature',
          };
          pending.receipts = [receipt, receipt];
        },
      },
    ])(
      'rejects persisted state with $name before external calls',
      async ({ mutate }) => {
        await withController(async ({ escrowA, escrowB, options }) => {
          const pending = JSON.parse(
            JSON.stringify(await getValidWritingPending(options.escrows)),
          ) as Record<string, unknown>;
          await mutate(pending);
          const auth = vi.spyOn(
            options.authProvider,
            'authorizeRecoveryRequest',
          );
          const availabilityA = vi.spyOn(escrowA, 'isAvailable');
          const availabilityB = vi.spyOn(escrowB, 'isAvailable');
          const applyA = vi.spyOn(escrowA, 'applyMutation');
          const applyB = vi.spyOn(escrowB, 'applyMutation');
          const controller = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger()),
            state: { pendingOperation: JSON.stringify(pending) },
          });

          await expect(controller.resume()).rejects.toThrow(/./u);

          expect(auth).not.toHaveBeenCalled();
          expect(availabilityA).not.toHaveBeenCalled();
          expect(availabilityB).not.toHaveBeenCalled();
          expect(applyA).not.toHaveBeenCalled();
          expect(applyB).not.toHaveBeenCalled();
        });
      },
    );
  });

  describe('identifier registry', () => {
    it('rejects unknown identifier types', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.register(SECRET, [
            { type: 'unknown', namespace: 'x', value: 'y', verifier: null },
            PASSKEY,
          ]),
        ).rejects.toThrow('Unknown identifier type');
      });
    });

    it.each(['emailOtp', 'smsOtp'])(
      'rejects %s until escrow-challenge OTP is implemented',
      async (type) => {
        await withController(async ({ controller }) => {
          await expect(
            controller.register(SECRET, [
              { type, namespace: 'x', value: 'y', verifier: null },
              PASSKEY,
            ]),
          ).rejects.toThrow('Unknown identifier type');
        });
      },
    );

    it.each([
      { ...WALLET, namespace: 'example.com:2' },
      { ...WALLET, verifier: undefined },
      ...[
        {},
        { domain: 1, chainId: 1 },
        { domain: '', chainId: 1 },
        { domain: 'example.com' },
        { domain: 'example.com', chainId: '1' },
        { domain: 'example.com', chainId: -1 },
        { domain: 'example.com', chainId: 1.5 },
        { domain: 'example.com', chainId: NaN },
        { domain: 'example.com', chainId: Infinity },
        { domain: 'example.com', chainId: Number.MAX_SAFE_INTEGER + 1 },
      ].map((verifier) => ({
        ...WALLET,
        verifier,
        namespace: `${String(verifier.domain)}:${String(verifier.chainId)}`,
      })),
    ])(
      'rejects a SIWE identifier with an invalid verifier or namespace',
      async (wallet) => {
        await withController(async ({ controller, authProvider }) => {
          const authorize = vi.spyOn(authProvider, 'authorizeRecoveryRequest');
          await expect(
            controller.register(SECRET, [PASSKEY, wallet]),
          ).rejects.toMatchObject({ code: 'invalid_identifier' });
          await expect(
            controller.updateIdentifiers(PASSKEY, [PASSKEY, wallet], 0),
          ).rejects.toMatchObject({ code: 'invalid_identifier' });
          expect(authorize).not.toHaveBeenCalled();
          expect(controller.state.pendingOperation).toBeNull();
        });
      },
    );

    it.each([
      { domain: 'localhost:3010', chainId: 1 },
      { domain: 'example.com', chainId: 0 },
      { domain: 'example.com', chainId: Number.MAX_SAFE_INTEGER },
    ])('accepts valid SIWE verifier %j', async (verifier) => {
      await withController(async ({ controller }) => {
        const wallet = {
          ...WALLET,
          verifier,
          namespace: `${verifier.domain}:${verifier.chainId}`,
        };
        expect(
          await controller.register(SECRET, [PASSKEY, wallet]),
        ).toBeUndefined();
      });
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MfaRecoveryControllerMessenger>,
  MessengerEvents<MfaRecoveryControllerMessenger>
>;

type WithControllerCallback<ReturnValue> = (payload: {
  controller: MfaRecoveryController;
  authProvider: StubAuthProvider;
  rootMessenger: RootMessenger;
  controllerMessenger: MfaRecoveryControllerMessenger;
  escrowA: StubEscrowProvider;
  escrowB: StubEscrowProvider;
  options: ReturnType<typeof getOptions>;
}) => Promise<ReturnValue> | ReturnValue;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getMessenger(
  rootMessenger: RootMessenger,
): MfaRecoveryControllerMessenger {
  return new Messenger({
    namespace: 'MfaRecoveryController',
    parent: rootMessenger,
  });
}

function getOptions(
  escrowA: StubEscrowProvider,
  escrowB: StubEscrowProvider,
): MfaRecoveryControllerOptions & { authProvider: StubAuthProvider } {
  return {
    messenger: getMessenger(getRootMessenger()),
    authProvider: new StubAuthProvider(IDENTIFIERS),
    identifierAuthProvider: new StubIdentifierAuthProvider(),
    escrows: [escrowA, escrowB],
    pendingOperationEncryptor: passthroughEncryptor,
  };
}

async function recover(
  controller: MfaRecoveryController,
  identifier: Identifier,
): Promise<RecoveredSecret> {
  const { session } = await controller.authenticateIdentifier(identifier);
  return await controller.getRecoverySecret(session);
}

async function getValidWritingPending(
  escrows: RecoveryEscrowProvider[],
  expectedVersion = 1,
): Promise<WritingPendingOperation> {
  const payload = {
    recoverySecret: bytesToHex(SECRET_2),
  };
  const payloadHash = await hash(payload);
  const fields = {
    id: '0xvalid-pending',
    profileId: 'profile-1',
    operation: 'updateRecoverySecret' as const,
    expectedVersion,
    newVersion: expectedVersion + 1,
    payloadHash,
    audiences: escrows.map((escrow) => escrow.id),
  };
  return {
    phase: 'writing',
    mutation: {
      ...fields,
      requestHash: await hash(fields),
    },
    authControllerToken: createAuthControllerToken({
      sub: 'profile-1',
      exp: unixNow() + 60,
      requestHash: await hash(fields),
      aal: 2,
    }),
    approvedIdentifiers: IDENTIFIERS,
    payload,
    identifier: PASSKEY,
    receipts: [],
  };
}

type WithControllerOptions = {
  identifierAuthProvider?: RecoveryIdentifierAuthProvider;
};

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ identifierAuthProvider }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const replicaIds = ['escrow-a', 'escrow-b'];
  const escrowA = new StubEscrowProvider(
    'escrow-a',
    await generateWrapKey(),
    await generateSigningKey(),
    replicaIds,
  );
  const escrowB = new StubEscrowProvider(
    'escrow-b',
    await generateWrapKey(),
    await generateSigningKey(),
    replicaIds,
  );
  const defaultOptions = getOptions(escrowA, escrowB);
  const options = {
    ...defaultOptions,
    identifierAuthProvider:
      identifierAuthProvider ?? defaultOptions.identifierAuthProvider,
    messenger: controllerMessenger,
  };
  const controller = new MfaRecoveryController(options);
  return await testFunction({
    controller,
    authProvider: options.authProvider,
    rootMessenger,
    controllerMessenger,
    escrowA,
    escrowB,
    options,
  });
}
