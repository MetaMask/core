export declare type NativeScrypt = (
  passwd: Uint8Array,
  salt: Uint8Array,
  N: number,
  r: number,
  p: number,
  size: number,
) => Promise<Uint8Array>;

export declare type NativeAesGcmEncryptProps = (
  key: Uint8Array,
  text: Uint8Array,
) => Promise<{
  content: Uint8Array;
  iv: string;
  tag: string;
}>;

export declare type NativeAesGcmDecryptProps = (
  key: Uint8Array,
  text: Uint8Array,
  iv: string,
  tag: string,
  isBinary: boolean,
) => Promise<Uint8Array>;
