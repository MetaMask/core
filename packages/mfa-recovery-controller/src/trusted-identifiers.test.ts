import { encodeCBOR } from '@levischuck/tiny-cbor';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { bytesToHex, stringToBytes } from '@metamask/utils';
import { sha256 } from '@noble/hashes/sha2';
import { describe, expect, it } from 'vitest';

import type { UserStorageTrustedIdentifierStoreMessenger } from './trusted-identifiers.js';
import {
  isTrustedIdentifier,
  toTrustedIdentifier,
  UserStorageTrustedIdentifierStore,
} from './trusted-identifiers.js';
import type { Identifier, TrustedIdentifier } from './types.js';

const RP_ID_HASH = sha256(stringToBytes('metamask.io'));
const CREDENTIAL_ID = new Uint8Array([0xaa, 0xbb]);
const COSE_KEY = encodeCBOR(
  new Map<number, number | Uint8Array>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, new Uint8Array(32).fill(1)],
    [-3, new Uint8Array(32).fill(2)],
  ]),
);

/**
 * @param flags - Authenticator data flags.
 * @returns A base64url `attestationObject` for {@link CREDENTIAL_ID} and
 * {@link COSE_KEY}.
 */
function attestationObject(flags = 0x45): string {
  const authData = new Uint8Array([
    ...RP_ID_HASH,
    flags,
    ...new Uint8Array(4 + 16),
    0,
    CREDENTIAL_ID.length,
    ...CREDENTIAL_ID,
    ...COSE_KEY,
  ]);
  return Buffer.from(
    encodeCBOR(
      new Map<string, string | Uint8Array | Map<string, never>>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, never>()],
        ['authData', authData],
      ]),
    ),
  ).toString('base64url');
}

const TRUSTED_PASSKEY: TrustedIdentifier = {
  type: 'passkey',
  rpIdHash: bytesToHex(RP_ID_HASH),
  credentialId: bytesToHex(CREDENTIAL_ID),
  publicKey: bytesToHex(COSE_KEY),
};

const PASSKEY: Identifier = {
  type: 'passkey',
  namespace: 'metamask.io',
  value: Buffer.from(CREDENTIAL_ID).toString('base64url'),
  verifier: {
    rpId: 'metamask.io',
    origins: ['https://metamask.io'],
    credentialId: Buffer.from(CREDENTIAL_ID).toString('base64url'),
    publicKey: { cose: Buffer.from(COSE_KEY).toString('base64url') },
  },
};

// keccak256('user@example.com')
const EMAIL_HASH =
  'cfb15ca7270395d72219fd758f75a0c95e3f0a61d959222402f24051d08e9b32';

describe('toTrustedIdentifier', () => {
  it('reads the RP ID hash, credential ID and COSE public key from a passkey attestation', () => {
    expect(
      toTrustedIdentifier({
        type: 'passkey',
        attestationObject: attestationObject(),
      }),
    ).toStrictEqual(TRUSTED_PASSKEY);
  });

  it.each([
    ['has no attested credential', attestationObject(0x05)],
    ['is not CBOR', 'AA'],
  ])('rejects an attestation that %s', (_name, attestation) => {
    expect(() =>
      toTrustedIdentifier({ type: 'passkey', attestationObject: attestation }),
    ).toThrow(expect.objectContaining({ code: 'invalid_witness' }));
  });

  it('hashes the lowercased social identity like the escrow', () => {
    expect(
      toTrustedIdentifier({
        type: 'social',
        namespace: 'https://accounts.google.com/',
        identity: 'User@Example.com',
      }),
    ).toStrictEqual({
      type: 'social',
      namespace: 'https://accounts.google.com',
      value: EMAIL_HASH,
    });
  });
});

describe('isTrustedIdentifier', () => {
  const social: TrustedIdentifier = {
    type: 'social',
    namespace: 'https://accounts.google.com',
    value: EMAIL_HASH,
  };

  it('accepts identifiers matching a trusted entry', () => {
    const trusted = [TRUSTED_PASSKEY, social];
    expect(isTrustedIdentifier(PASSKEY, trusted)).toBe(true);
    expect(
      isTrustedIdentifier(
        {
          type: 'social',
          namespace: 'https://accounts.google.com/',
          value: EMAIL_HASH,
        },
        trusted,
      ),
    ).toBe(true);
  });

  it.each([
    [
      'a swapped passkey public key',
      {
        ...PASSKEY,
        verifier: {
          ...(PASSKEY.verifier as object),
          publicKey: { cose: 'AQ' },
        },
      },
    ],
    [
      'another RP ID',
      {
        ...PASSKEY,
        verifier: { ...(PASSKEY.verifier as object), rpId: 'other.example' },
      },
    ],
    [
      'a passkey without RP ID',
      {
        ...PASSKEY,
        verifier: { ...(PASSKEY.verifier as object), rpId: undefined },
      },
    ],
    [
      'another credential ID',
      {
        ...PASSKEY,
        verifier: { ...(PASSKEY.verifier as object), credentialId: 'AQ' },
      },
    ],
    ['a passkey without verifier', { ...PASSKEY, verifier: undefined }],
    [
      'a passkey with a malformed key',
      {
        ...PASSKEY,
        verifier: { ...(PASSKEY.verifier as object), publicKey: { cose: '%' } },
      },
    ],
    [
      'another social identity',
      { type: 'social', namespace: social.namespace, value: 'other' },
    ],
    [
      'another social issuer',
      {
        type: 'social',
        namespace: 'https://appleid.apple.com',
        value: EMAIL_HASH,
      },
    ],
  ])('rejects %s', (_name, identifier) => {
    expect(isTrustedIdentifier(identifier, [TRUSTED_PASSKEY, social])).toBe(
      false,
    );
  });
});

describe('UserStorageTrustedIdentifierStore', () => {
  type RootMessenger = Messenger<
    MockAnyNamespace,
    MessengerActions<UserStorageTrustedIdentifierStoreMessenger>,
    MessengerEvents<UserStorageTrustedIdentifierStoreMessenger>
  >;

  /**
   * @returns A store backed by an in-memory UserStorageController.
   */
  function setup(): {
    store: UserStorageTrustedIdentifierStore;
    storage: Map<string, string>;
  } {
    const storage = new Map<string, string>();
    const rootMessenger: RootMessenger = new Messenger({
      namespace: MOCK_ANY_NAMESPACE,
    });
    const messenger: UserStorageTrustedIdentifierStoreMessenger = new Messenger(
      {
        namespace: 'UserStorageTrustedIdentifierStore',
        parent: rootMessenger,
      },
    );
    rootMessenger.delegate({
      actions: [
        'UserStorageController:performGetStorageAllFeatureEntries',
        'UserStorageController:performSetStorage',
      ],
      events: [],
      messenger,
    });
    rootMessenger.registerActionHandler(
      'UserStorageController:performGetStorageAllFeatureEntries',
      async (feature) => {
        const values = [...storage]
          .filter(([path]) => path.startsWith(`${feature}.`))
          .map(([, value]) => value);
        return values.length > 0 ? values : null;
      },
    );
    rootMessenger.registerActionHandler(
      'UserStorageController:performSetStorage',
      async (path, value) => {
        storage.set(path, value);
      },
    );
    return {
      store: new UserStorageTrustedIdentifierStore({ messenger }),
      storage,
    };
  }

  it('reads an empty list when nothing is stored', async () => {
    const { store } = setup();
    expect(await store.get()).toStrictEqual([]);
  });

  it('stores each identifier under its own key, once', async () => {
    const { store, storage } = setup();
    const social: TrustedIdentifier = {
      type: 'social',
      namespace: 'https://accounts.google.com',
      value: EMAIL_HASH,
    };
    await store.add(TRUSTED_PASSKEY);
    await store.add(social);
    await store.add(TRUSTED_PASSKEY);
    expect([...storage.keys()]).toStrictEqual([
      expect.stringMatching(/^mfaRecoveryTrustedIdentifiers\.[0-9a-f]{64}$/u),
      expect.stringMatching(/^mfaRecoveryTrustedIdentifiers\.[0-9a-f]{64}$/u),
    ]);
    expect(await store.get()).toStrictEqual([TRUSTED_PASSKEY, social]);
  });
});
