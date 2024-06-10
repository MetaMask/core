import { createDeferredPromise } from '@metamask/utils';
import { PassThrough } from 'readable-stream';

import { createCaipStream } from './createCaipStream';
import { SplitStream } from './streams/SplitStream';
import { onData, writeToStream } from './tests/streams';

describe('createCaipStream', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('pipes a caip-x message from source stream to the substream as a multiplexed `metamask-provider` message', async () => {
    const sourceStream = new PassThrough({ objectMode: true });

    const sourceStreamChunks = onData(sourceStream);

    const providerStream = createCaipStream(sourceStream);
    const providerStreamChunks = onData(providerStream);

    await writeToStream(sourceStream, {
      type: 'caip-x',
      data: { foo: 'bar' },
    });

    expect(sourceStreamChunks).toStrictEqual([
      { type: 'caip-x', data: { foo: 'bar' } },
    ]);
    expect(providerStreamChunks).toStrictEqual([
      { name: 'metamask-provider', data: { foo: 'bar' } },
    ]);
  });

  it('pipes a multiplexed `metamask-provider` message from the substream to the source stream as a caip-x message', async () => {
    // using a SplitStream here instead of PassThrough to prevent a loop
    // when sourceStream gets written to at the end of the CAIP pipeline
    const sourceStream = new SplitStream();
    const innerStreamChunks = onData(sourceStream.substream);

    const providerStream = createCaipStream(sourceStream);

    await writeToStream(providerStream, {
      name: 'metamask-provider',
      data: { foo: 'bar' },
    });

    // Note that it's not possible to verify the output side of the internal SplitStream
    // instantiated inside createCaipStream as only the substream is actually exported
    expect(innerStreamChunks).toStrictEqual([
      { type: 'caip-x', data: { foo: 'bar' } },
    ]);
  });

  it('calls the logger with an error when the pipeline ends', async () => {
    const { promise: isFinished, resolve: loggerCallback } =
      createDeferredPromise();
    const logger = jest.fn().mockImplementation(() => {
      loggerCallback();
    });

    const sourceStream = new SplitStream();
    createCaipStream(sourceStream, logger);
    sourceStream.destroy();

    await isFinished;

    expect(logger).toHaveBeenCalledWith(
      'MetaMask CAIP stream',
      expect.any(Error),
    );
  });
});
