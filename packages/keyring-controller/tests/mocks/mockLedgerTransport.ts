/* eslint-disable @typescript-eslint/no-unused-vars */
import type Transport from '@ledgerhq/hw-transport';
import { StatusCodes } from '@ledgerhq/hw-transport';
import { EventEmitter } from 'stream';

export class MockTransport implements Transport {
  exchangeTimeout = 30000;

  unresponsiveTimeout = 15000;

  deviceModel = null;

  _appAPIlock = null;

  send = async (
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: Buffer = Buffer.alloc(0),
    statusList: number[] = [StatusCodes.OK],
  ): Promise<Buffer> => {
    return Buffer.from([]);
  };

  exchangeAtomicImpl = async (
    f: () => Promise<Buffer | void>,
  ): Promise<Buffer | void> => {
    return Buffer.from([]);
  };

  // eslint-disable-next-line consistent-this
  decorateAppAPIMethods(
    self: Record<string, any>,
    methods: string[],
    scrambleKey: string,
  ) {
    // do nothing
  }

  decorateAppAPIMethod<R, A extends any[]>(
    methodName: string,
    f: (...args: A) => Promise<R>,
    ctx: any,
    scrambleKey: string,
  ): (...args: A) => Promise<R> {
    return (...args: A) => {
      return f(...args);
    };
  }

  setScrambleKey(_key: string): void {
    // do nothing
  }

  _events = new EventEmitter();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(eventName: string, cb: (...args: any[]) => any): void {
    //  nothing
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  off(eventName: string, cb: (...args: any[]) => any): void {
    //  nothing
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  emit(event: string, ...args: any): void {
    //  nothing
  }

  setDebugMode(): void {
    //  nothing
  }

  setExchangeTimeout(exchangeTimeout: number): void {
    this.exchangeTimeout = exchangeTimeout;
  }

  setExchangeUnresponsiveTimeout(unresponsiveTimeout: number): void {
    this.unresponsiveTimeout = unresponsiveTimeout;
  }

  exchangeBusyPromise: Promise<void> | null | undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async exchange(apdu: Uint8Array): Promise<Buffer> {
    return Buffer.from(apdu);
  }

  async close(): Promise<void> {
    // do nothing
  }
}
