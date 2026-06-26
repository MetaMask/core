/**
 * Partial type definitions for `multiformats/cid`. This only covers the parts
 * used in the codebase.
 */
declare module 'multiformats/cid' {
  export class CID {
    static parse(cidString: string): CID;

    toV1(): CID;

    toString(): string;
  }
}
