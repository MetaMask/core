import { isObject } from '@metamask/utils';
import { Transform } from 'readable-stream';

export class MultiplexToCaipTransform extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  _write(
    value: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    if (isObject(value) && value.name === 'metamask-provider') {
      this.push({
        type: 'caip-x',
        data: value.data,
      });
    }
    callback();
  }
}
