export declare type NativeScrypt = (
  passwd: Uint8Array,
  salt: Uint8Array,
  N: number,
  r: number,
  p: number,
  size: number,
) => Promise<Uint8Array>;
