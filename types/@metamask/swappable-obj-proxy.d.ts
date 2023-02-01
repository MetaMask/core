declare module '@metamask/swappable-obj-proxy' {
  import EventEmitter from 'events';

  export type SwappableProxy<T> = T & {
    setTarget: (newTarget: T) => void;
  };

  export function createEventEmitterProxy<T extends EventEmitter>(
    initialTarget: T,
    options?: {
      eventFilter?: ((eventName: string) => boolean) | 'skipInternal';
    },
  ): SwappableProxy<T>;

  export function createSwappableProxy<T>(initialTarget: T): SwappableProxy<T>;
}
