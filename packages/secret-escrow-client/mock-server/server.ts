/**
 * File-backed mock secret-escrow HTTP server for local wipe/rehydration tests.
 *
 * Usage:
 *   yarn mock-server
 *   # or: node --import tsx mock-server/server.ts
 *
 * Persists to SECRET_ESCROW_MOCK_STORE (default: ./.secret-escrow-mock.json).
 * Listens on SECRET_ESCROW_MOCK_PORT (default: 8787).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { bytesToHex, hexToBytes } from '@metamask/utils';

import { MockSecretEscrowClient } from '../src/MockSecretEscrowClient.ts';
import type {
  EscrowEnrollmentMetadata,
  EscrowWrappedPassword,
  WebAuthnEscrowFactor,
} from '../src/types.ts';
import {
  SecretEscrowError,
  SecretEscrowErrorCode,
} from '../src/errors.ts';

type StoreFile = {
  snapshot: ReturnType<MockSecretEscrowClient['exportSnapshot']>;
  enrollments: Record<
    string,
    {
      factorId: string;
      factor: WebAuthnEscrowFactor;
      wrappedPassword: EscrowWrappedPassword;
      enrolledAt: number;
    }
  >;
};

const PORT = Number(process.env.SECRET_ESCROW_MOCK_PORT ?? 8787);
const STORE_PATH = resolve(
  process.env.SECRET_ESCROW_MOCK_STORE ??
    resolve(process.cwd(), '.secret-escrow-mock.json'),
);

const client = new MockSecretEscrowClient({
  getRandomBytes: (length) => new Uint8Array(randomBytes(length)),
});

let enrollments: StoreFile['enrollments'] = {};

function loadStore(): void {
  if (!existsSync(STORE_PATH)) {
    return;
  }
  const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as StoreFile;
  if (raw.snapshot) {
    client.importSnapshot(raw.snapshot);
  }
  enrollments = raw.enrollments ?? {};
  console.log(`[secret-escrow-mock] loaded store from ${STORE_PATH}`);
}

function saveStore(): void {
  const data: StoreFile = {
    snapshot: client.exportSnapshot(),
    enrollments,
  };
  writeFileSync(STORE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(
  res: ServerResponse,
  status: number,
  body?: unknown,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (body === undefined) {
    res.end();
    return;
  }
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof SecretEscrowError) {
    sendJson(res, 400, {
      code: error.code ?? SecretEscrowErrorCode.AssertionFailed,
      message: error.message,
    });
    return;
  }
  console.error('[secret-escrow-mock] error', error);
  sendJson(res, 500, {
    code: SecretEscrowErrorCode.AssertionFailed,
    message: error instanceof Error ? error.message : 'Internal error',
  });
}

loadStore();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    const { method } = req;

    if (method === 'OPTIONS') {
      sendJson(res, 204);
      return;
    }

    if (method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    const enrollmentMatch = url.pathname.match(
      /^\/v1\/users\/([^/]+)\/enrollment$/u,
    );

    if (method === 'GET' && enrollmentMatch) {
      const userId = decodeURIComponent(enrollmentMatch[1]);
      const enrollment = enrollments[userId];
      if (!enrollment || !client.hasUser(userId)) {
        sendJson(res, 404, {
          code: SecretEscrowErrorCode.NotRegistered,
          message: 'Not registered',
        });
        return;
      }
      const metadata: EscrowEnrollmentMetadata = {
        userId,
        factorId: enrollment.factorId,
        factor: enrollment.factor,
        wrappedPassword: enrollment.wrappedPassword,
        enrolledAt: enrollment.enrolledAt,
      };
      sendJson(res, 200, metadata);
      return;
    }

    if (method === 'PUT' && enrollmentMatch) {
      const userId = decodeURIComponent(enrollmentMatch[1]);
      const body = (await readJson(req)) as EscrowEnrollmentMetadata;
      if (!client.hasUser(userId)) {
        sendJson(res, 400, {
          code: SecretEscrowErrorCode.NotRegistered,
          message: 'Register before putting enrollment metadata',
        });
        return;
      }
      enrollments[userId] = {
        factorId: body.factorId,
        factor: body.factor,
        wrappedPassword: body.wrappedPassword,
        enrolledAt: body.enrolledAt ?? Date.now(),
      };
      saveStore();
      sendJson(res, 204);
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/register') {
      const body = (await readJson(req)) as {
        userId: string;
        factorId: string;
        factor: WebAuthnEscrowFactor;
        secretHex?: string;
      };
      const { secret } = await client.register({
        userId: body.userId,
        factorId: body.factorId,
        factor: body.factor,
        secret: body.secretHex ? hexToBytes(body.secretHex) : undefined,
      });
      saveStore();
      sendJson(res, 200, { secretHex: bytesToHex(secret) });
      secret.fill(0);
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/export_init') {
      const body = (await readJson(req)) as {
        userId: string;
        factorId: string;
      };
      const result = await client.exportInit(body);
      saveStore();
      sendJson(res, 200, result);
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/export_complete') {
      const body = (await readJson(req)) as {
        userId: string;
        factorId: string;
        assertion: {
          id: string;
          challenge: string;
          response?: Record<string, string>;
        };
      };
      const { secret } = await client.exportComplete(body);
      saveStore();
      sendJson(res, 200, { secretHex: bytesToHex(secret) });
      secret.fill(0);
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/revoke') {
      const body = (await readJson(req)) as { userId: string };
      await client.revoke(body);
      delete enrollments[body.userId];
      saveStore();
      sendJson(res, 204);
      return;
    }

    sendJson(res, 404, { message: 'Not found' });
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[secret-escrow-mock] listening on http://127.0.0.1:${PORT} (store: ${STORE_PATH})`,
  );
});
