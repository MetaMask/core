/**
 * Local CubeSigner probe for the `cubist_secret_escrow` function.
 *
 * Requires a CubeSigner user session on disk (`defaultUserSessionManager`).
 *
 * Usage:
 *   yarn workspace @metamask/mfa-recovery-controller run cubesigner:invoke-escrow
 */
import { CubeSignerClient } from '@cubist-labs/cubesigner-sdk';
import { defaultUserSessionManager } from '@cubist-labs/cubesigner-sdk-fs-storage';

const client = await CubeSignerClient.create(defaultUserSessionManager());
const fn = await client.org().getFunction('cubist_secret_escrow');
// or: getFunction("NamedPolicy#e0a26d77-6b47-4507-abc5-ab9a3485e22f")

const result = await fn.invoke(
  undefined,
  'latest', // or "v0"
  { cmd: 'generateChallenge' }, // or applyMutation or getSecret
);

console.log(result.response);
console.log(new TextDecoder().decode(result.stdoutBytes));
