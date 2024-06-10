import { Duplex } from 'readable-stream';

export class SplitStream extends Duplex {
  substream: Duplex;

  constructor(substream?: SplitStream) {
    super({ objectMode: true });
    this.substream = substream ?? new SplitStream(this);
  }

  _read() {
    return undefined;
  }

  _write(
    value: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.substream.push(value);
    callback();
  }
}
