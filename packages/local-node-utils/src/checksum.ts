/* eslint-disable import-x/no-nodejs-modules */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export async function verifyFileChecksum(
  filePath: string,
  expectedChecksum: string,
  label: string,
): Promise<void> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  const checksum = hash.digest('hex');

  if (checksum !== expectedChecksum) {
    throw new Error(
      `${label} checksum mismatch. Expected ${expectedChecksum}, got ${checksum}.`,
    );
  }
}
