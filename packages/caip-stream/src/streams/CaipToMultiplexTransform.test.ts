import { onData, writeToStream } from '../tests/streams';
import { CaipToMultiplexTransform } from './CaipToMultiplexTransform';

describe('CaipToMultiplexTransform', () => {
  it('drops non caip-x messages', async () => {
    const caipToMultiplexTransform = new CaipToMultiplexTransform();

    const streamChunks = onData(caipToMultiplexTransform);

    await writeToStream(caipToMultiplexTransform, { foo: 'bar' });
    await writeToStream(caipToMultiplexTransform, {
      type: 'caip-wrong',
      data: { foo: 'bar' },
    });

    expect(streamChunks).toStrictEqual([]);
  });

  it('rewraps caip-x messages into multiplexed `metamask-provider` messages', async () => {
    const caipToMultiplexTransform = new CaipToMultiplexTransform();

    const streamChunks = onData(caipToMultiplexTransform);

    await writeToStream(caipToMultiplexTransform, {
      type: 'caip-x',
      data: { foo: 'bar' },
    });

    expect(streamChunks).toStrictEqual([
      {
        name: 'metamask-provider',
        data: { foo: 'bar' },
      },
    ]);
  });
});
