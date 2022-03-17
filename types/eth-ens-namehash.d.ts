declare module 'eth-ens-namehash' {
  export function hash(inputName?: string | null): `0x${string}`;
  export function normalize(name?: string | null): string;
}
