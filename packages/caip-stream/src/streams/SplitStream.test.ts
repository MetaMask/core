import { onData, writeToStream } from '../tests/streams';
import { SplitStream } from './SplitStream';

describe('SplitStream', () => {
  it('redirects writes from the main stream to the substream', async () => {
    const splitStream = new SplitStream();

    const outerStreamChunks = onData(splitStream);
    const innerStreamChunks = onData(splitStream.substream);

    await writeToStream(splitStream, { foo: 'bar' });

    expect(outerStreamChunks).toStrictEqual([]);
    expect(innerStreamChunks).toStrictEqual([{ foo: 'bar' }]);
  });

  it('redirects writes from the substream to the main stream', async () => {
    const splitStream = new SplitStream();

    const outerStreamChunks = onData(splitStream);
    const innerStreamChunks = onData(splitStream.substream);

    await writeToStream(splitStream.substream, { foo: 'bar' });

    expect(outerStreamChunks).toStrictEqual([{ foo: 'bar' }]);
    expect(innerStreamChunks).toStrictEqual([]);
  });
});
