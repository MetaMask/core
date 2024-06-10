import { onData, writeToStream } from '../tests/streams';
import { MultiplexToCaipTransform } from './MultiplexToCaipTransform';

describe('multiplexToCaipTransform', () => {
  it('drops non multiplexed `metamask-provider` messages', async () => {
    const multiplexToCaipTransform = new MultiplexToCaipTransform();

    const streamChunks = onData(multiplexToCaipTransform);

    await writeToStream(multiplexToCaipTransform, { foo: 'bar' });
    await writeToStream(multiplexToCaipTransform, {
      name: 'wrong-multiplex',
      data: { foo: 'bar' },
    });

    expect(streamChunks).toStrictEqual([]);
  });

  it('rewraps multiplexed `metamask-provider` messages into caip-x messages', async () => {
    const multiplexToCaipTransform = new MultiplexToCaipTransform();

    const streamChunks = onData(multiplexToCaipTransform);

    await writeToStream(multiplexToCaipTransform, {
      name: 'metamask-provider',
      data: { foo: 'bar' },
    });

    expect(streamChunks).toStrictEqual([
      {
        type: 'caip-x',
        data: { foo: 'bar' },
      },
    ]);
  });
});
