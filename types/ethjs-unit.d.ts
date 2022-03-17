declare module 'ethjs-unit' {
  import type BN from 'bn.js';

  // This type is derived from the logic within `number-to-bn` and represents an
  // object obtained via `bn.js` or `bignumber.js`.
  type BigNumberish = ({ mul: any } | { dividedToIntegerBy: any }) & {
    toString: (base: number) => string;
  };

  type AcceptableBNInput = string | number | BigNumberish;

  // This should be `keyof typeof unitMap` but really accepts anything
  type Unitish = string | null | undefined;

  type Numberish =
    | string
    | number
    | (({ toTwos: any } | { dividedToIntegerBy: any }) & {
        toPrecision?: () => string;
        toString: (base: number) => string | number;
      });

  export const unitMap: {
    noether: '0';
    wei: '1';
    kwei: '1000';
    Kwei: '1000';
    babbage: '1000';
    femtoether: '1000';
    mwei: '1000000';
    Mwei: '1000000';
    lovelace: '1000000';
    picoether: '1000000';
    gwei: '1000000000';
    Gwei: '1000000000';
    shannon: '1000000000';
    nanoether: '1000000000';
    nano: '1000000000';
    szabo: '1000000000000';
    microether: '1000000000000';
    micro: '1000000000000';
    finney: '1000000000000000';
    milliether: '1000000000000000';
    milli: '1000000000000000';
    ether: '1000000000000000000';
    kether: '1000000000000000000000';
    grand: '1000000000000000000000';
    mether: '1000000000000000000000000';
    gether: '1000000000000000000000000000';
    tether: '1000000000000000000000000000000';
  };

  export function numberToString(arg: Numberish): string;

  export function getValueOfUnit(unitInput: Unitish): BN;

  export function fromWei(
    weiInput: AcceptableBNInput,
    unit: Unitish,
    optionsInput?: { pad?: boolean; commify?: boolean },
  ): string;

  export function toWei(etherInput: Numberish, unit: Unitish): BN;
}
