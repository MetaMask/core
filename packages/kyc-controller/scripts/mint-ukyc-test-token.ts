/**
 * CLI to mint a UKYC `storage_access_token` for testing UKYC Storage.
 *
 * All real logic lives in the tested `mintUkycTestToken`; this is a thin
 * argument-parsing wrapper that prints the result as JSON.
 *
 * Usage (from the package root, via the `mint:ukyc-token` script):
 *   yarn workspace @metamask/kyc-controller run mint:ukyc-token -- \
 *     --operations read,write --expires-in 4h [--secret <hex>] \
 *     [--presenter client|idos-relay] [--session-id <id>]
 *
 * Reuse the printed `localUserSecret` (pass it back via --secret) to keep the
 * same `storageId` and controlling key across runs.
 */
import process from 'node:process';

import type {
  UkycStorageOperation,
  UkycTokenPresenter,
} from '../src/ukyc/storageAccessToken.js';
import { mintUkycTestToken } from '../src/ukyc/testToken.js';
import type { MintUkycTestTokenParams } from '../src/ukyc/testToken.js';

/**
 * Parses `--flag value` and `--flag=value` pairs into a map. Flags without a
 * following value are treated as booleans (`"true"`).
 *
 * @param argv - Raw CLI arguments (typically `process.argv.slice(2)`).
 * @returns The parsed flags keyed by name (without the leading `--`).
 */
function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      i += 1;
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      i += 1;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      i += 2;
    } else {
      flags[body] = 'true';
      i += 1;
    }
  }
  return flags;
}

/**
 * Parses a duration like `4h`, `30m`, `90s`, or a bare number of seconds.
 *
 * @param value - The duration string.
 * @returns The duration in milliseconds.
 */
function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)?$/u.exec(value);
  if (!match) {
    throw new Error(`invalid --expires-in duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * unitMs[(match[2] ?? 's') as keyof typeof unitMs];
}

const flags = parseFlags(process.argv.slice(2));

const params: MintUkycTestTokenParams = {};

if (flags.secret) {
  params.localUserSecret = flags.secret;
}
if (flags.operations) {
  params.operations = flags.operations
    .split(',')
    .map((op) => op.trim()) as UkycStorageOperation[];
}
if (flags.presenter) {
  params.presenter = flags.presenter as UkycTokenPresenter;
}
if (flags['session-id']) {
  params.sessionId = flags['session-id'];
}
if (flags['issued-at']) {
  params.issuedAt = new Date(flags['issued-at']);
}
if (flags['expires-at']) {
  params.expiresAt = new Date(flags['expires-at']);
} else if (flags['expires-in']) {
  const issuedAt = params.issuedAt ?? new Date();
  params.issuedAt = issuedAt;
  params.expiresAt = new Date(
    issuedAt.getTime() + parseDurationMs(flags['expires-in']),
  );
}

const result = mintUkycTestToken(params);

console.log(JSON.stringify(result, null, 2));
