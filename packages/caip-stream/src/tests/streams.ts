import { createDeferredPromise } from '@metamask/utils';
import type { Duplex } from 'readable-stream';

export const writeToStream = async (stream: Duplex, message: unknown) => {
  const { promise: isWritten, resolve: writeCallback } =
    createDeferredPromise();

  stream.write(message, () => writeCallback());
  await isWritten;
};

export const onData = (stream: Duplex): unknown[] => {
  const chunks: unknown[] = [];
  stream.on('data', (chunk: unknown) => {
    chunks.push(chunk);
  });

  return chunks;
};
