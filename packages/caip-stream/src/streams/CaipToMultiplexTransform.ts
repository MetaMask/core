import { isObject } from '@metamask/utils';
import { Transform } from 'readable-stream';

export class CaipToMultiplexTransform extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  _write(
    value: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    if (isObject(value) && value.type === 'caip-x') {
      this.push({
        name: 'metamask-provider',
        data: value.data,
      });
    }
    callback();
  }
}
