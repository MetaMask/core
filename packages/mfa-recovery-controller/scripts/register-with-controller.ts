import { CubeSignerClient } from '@cubist-labs/cubesigner-sdk';
import type { Version } from '@cubist-labs/cubesigner-sdk';
import { defaultUserSessionManager } from '@cubist-labs/cubesigner-sdk-fs-storage';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { bytesToHex } from '@metamask/utils';
import { randomBytes } from 'node:crypto';
import process from 'node:process';

import { CubistEscrowProvider } from '../src/escrow-providers/cubist-escrow-provider.js';
import { MfaRecoveryController } from '../src/MfaRecoveryController.js';
import type { MfaRecoveryControllerMessenger } from '../src/MfaRecoveryController.js';
import type { Identifier } from '../src/types.js';
import {
  StubAuthProvider,
  StubIdentifierAuthProvider,
  passthroughEncryptor,
} from '../tests/stubs.js';

/**
 * Runs the MFA recovery controller against the live Cubist escrow C2F.
 *
 * Usage:
 *   yarn workspace @metamask/mfa-recovery-controller run cubesigner:register -- \
 *     --wrap-key '<p256-jwk-json>' \
 *     --receipt-key '<p256-jwk-json>' \
 *     [--function-id <name-or-id>] [--version latest|v0]
 */
const USAGE =
  'Usage: cubesigner:register --wrap-key <p256-jwk-json> --receipt-key <p256-jwk-json> [--function-id <name-or-id>] [--version latest|v0]';

const PASSKEY: Identifier = {
  type: 'passkey',
  namespace: 'example.com',
  value: 'cred-1',
  verifier: { publicKey: 'mock-passkey' },
};

const OIDC: Identifier = {
  type: 'oidc',
  namespace: 'https://accounts.google.com',
  value: 'sub-1',
  verifier: { auds: ['mock-client'] },
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MfaRecoveryControllerMessenger>,
  MessengerEvents<MfaRecoveryControllerMessenger>
>;

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  let index = 0;

  while (index < argv.length) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      index += 1;
      continue;
    }

    const body = argument.slice(2);
    const equalsIndex = body.indexOf('=');
    if (equalsIndex !== -1) {
      flags[body.slice(0, equalsIndex)] = body.slice(equalsIndex + 1);
      index += 1;
      continue;
    }

    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      index += 2;
    } else {
      flags[body] = 'true';
      index += 1;
    }
  }

  return flags;
}

function parseVersion(value: string | undefined): Version {
  if (value === undefined || value === 'latest') {
    return 'latest';
  }
  if (/^v\d+$/u.test(value)) {
    return value as Version;
  }
  throw new Error(`Invalid CubeSigner version: ${value}`);
}

function getControllerMessenger(): MfaRecoveryControllerMessenger {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  return new Messenger({
    namespace: 'MfaRecoveryController',
    parent: rootMessenger,
  });
}

async function main(flags: Record<string, string>): Promise<void> {
  const wrapPublicKey = flags['wrap-key'];
  const receiptPublicKey = flags['receipt-key'];
  if (wrapPublicKey === undefined || receiptPublicKey === undefined) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const client = await CubeSignerClient.create(defaultUserSessionManager());
  const escrow = new CubistEscrowProvider({
    client,
    wrapPublicKey,
    receiptPublicKey,
    ...(flags['function-id'] === undefined
      ? {}
      : { functionId: flags['function-id'] }),
    version: parseVersion(flags.version),
  });
  const controller = new MfaRecoveryController({
    messenger: getControllerMessenger(),
    authProvider: new StubAuthProvider(),
    identifierAuthProvider: new StubIdentifierAuthProvider(),
    escrows: [escrow],
    pendingOperationEncryptor: passthroughEncryptor,
  });

  const recoverySecret = new Uint8Array(randomBytes(32));
  await controller.register(recoverySecret, [PASSKEY, OIDC]);

  const identifierSession = await controller.authenticateIdentifier(PASSKEY);
  const recovered = await controller.getRecoverySecret(identifierSession);
  const registeredSecret = bytesToHex(recoverySecret);
  const recoveredSecret = bytesToHex(recovered.recoverySecret);

  console.log(
    JSON.stringify(
      {
        epoch: recovered.epoch,
        recoverySecret: recoveredSecret,
        matchesRegisteredSecret: recoveredSecret === registeredSecret,
      },
      null,
      2,
    ),
  );
}

await main(parseFlags(process.argv.slice(2)));
