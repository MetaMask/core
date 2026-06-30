import { mkdirSync } from 'node:fs';
import { chmod } from 'node:fs/promises';

/**
 * Create the daemon's data directory (if it does not exist) and restrict it to
 * the owning user.
 *
 * The mode is `0o700` (owner-only). The daemon exposes the full wallet
 * messenger over the socket inside this directory, so anyone who can traverse
 * the dir can also `connect()` to the socket. Restricting to the owning user is
 * the only access-control boundary. We `chmod` after `mkdir` because the `mode`
 * option is ignored when the directory already exists.
 *
 * @param dataDir - The data directory to create and lock down.
 */
export async function ensureOwnerOnlyDirectory(dataDir: string): Promise<void> {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  await chmod(dataDir, 0o700);
}
