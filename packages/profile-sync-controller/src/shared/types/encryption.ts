export declare type NativeScrypt = (
  passwd: string,
  salt: Uint8Array,
  N: number,
  r: number,
  p: number,
  size: number,
) => Promise<Uint8Array>;
