/**
 * Local CubeSigner probe for the `cubist_secret_escrow` function.
 *
 * Requires a CubeSigner user session on disk (`defaultUserSessionManager`).
 *
 * Usage:
 *   yarn workspace @metamask/mfa-recovery-controller run cubesigner:invoke-escrow
 */
import { C2FInvocation, CubeSignerClient } from '@cubist-labs/cubesigner-sdk';
import { defaultUserSessionManager } from '@cubist-labs/cubesigner-sdk-fs-storage';

const client = await CubeSignerClient.create(defaultUserSessionManager());

const result = new C2FInvocation(
  await client.apiClient.policyInvoke(
    'cubist_secret_escrow', // or "NamedPolicy#…"
    'latest', // or "v0"
    { request: { cmd: 'generateChallenge' } }, // or applyMutation or getSecret
  ),
);

console.log(result.response);
console.log(new TextDecoder().decode(result.stdoutBytes));
