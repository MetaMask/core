/* eslint-disable import-x/no-nodejs-modules */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';

export async function downloadFileFromUrl(
  url: string,
  destination: string,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await pipeline(
    await openDownloadStream(new URL(url)),
    createWriteStream(destination),
  );
}

export async function openDownloadStream(
  url: URL,
  redirectsRemaining = 5,
): Promise<NodeJS.ReadableStream> {
  const request = url.protocol === 'http:' ? requestHttp : requestHttps;

  return await new Promise((resolvePromise, rejectPromise) => {
    const req = request(url, (response) => {
      const { headers, statusCode, statusMessage } = response;

      if (
        statusCode &&
        statusCode >= 300 &&
        statusCode < 400 &&
        headers.location
      ) {
        response.resume();
        if (redirectsRemaining <= 0) {
          rejectPromise(new Error(`Too many redirects downloading ${url}`));
          return;
        }

        openDownloadStream(
          new URL(headers.location, url),
          redirectsRemaining - 1,
        )
          .then(resolvePromise)
          .catch(rejectPromise);
        return;
      }

      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        response.resume();
        rejectPromise(
          new Error(
            `Request to ${url} failed with ${statusCode ?? 'unknown'} ${
              statusMessage ?? ''
            }`.trim(),
          ),
        );
        return;
      }

      resolvePromise(response);
    });

    req.on('error', rejectPromise);
    req.end();
  });
}
