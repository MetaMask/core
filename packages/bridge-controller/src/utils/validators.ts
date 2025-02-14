import { isValidHexAddress as isValidHexAddress_ } from '@metamask/controller-utils';
import { isStrictHexString } from '@metamask/utils';

import type { SwapsTokenObject } from '../constants/tokens';
import type {
  FeatureFlagResponse,
  FeeData,
  Quote,
  QuoteResponse,
  TxData,
} from '../types';
import { BridgeFlag } from '../types';

export const truthyString = (string: string) => Boolean(string?.length);
export const truthyDigitString = (string: string) =>
  truthyString(string) && Boolean(string.match(/^\d+$/u));

export const isValidNumber = (v: unknown): v is number => typeof v === 'number';
const isValidObject = (v: unknown): v is object =>
  typeof v === 'object' && v !== null;
const isValidString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;
const isValidHexAddress = (v: unknown) =>
  isValidString(v) && isValidHexAddress_(v, { allowNonPrefixed: false });

type Validator<ExpectedResponse> = {
  property: keyof ExpectedResponse;
  type: string;
  validator?: (value: unknown) => boolean;
};

export const validateData = <ExpectedResponse>(
  validators: Validator<ExpectedResponse>[],
  object: unknown,
  urlUsed: string,
  logError = true,
): object is ExpectedResponse => {
  return validators.every(({ property, type, validator }) => {
    const types = type.split('|');
    const propertyString = String(property);

    const valid =
      isValidObject(object) &&
      types.some(
        (_type) =>
          typeof object[propertyString as keyof typeof object] === _type,
      ) &&
      (!validator || validator(object[propertyString as keyof typeof object]));

    if (!valid && logError) {
      const value = isValidObject(object)
        ? object[propertyString as keyof typeof object]
        : undefined;
      const typeString = isValidObject(object)
        ? typeof object[propertyString as keyof typeof object]
        : 'undefined';

      console.error(
        `response to GET ${urlUsed} invalid for property ${String(property)}; value was:`,
        value,
        '| type was: ',
        typeString,
      );
    }
    return valid;
  });
};

export const validateResponse = <ExpectedResponse>(
  validators: Validator<ExpectedResponse>[],
  data: unknown,
  urlUsed: string,
  logError = true,
): data is ExpectedResponse => {
  return validateData(validators, data, urlUsed, logError);
};

export const FEATURE_FLAG_VALIDATORS = [
  {
    property: BridgeFlag.EXTENSION_CONFIG,
    type: 'object',
    validator: (
      v: unknown,
    ): v is Pick<FeatureFlagResponse, BridgeFlag.EXTENSION_CONFIG> =>
      isValidObject(v) &&
      'refreshRate' in v &&
      isValidNumber(v.refreshRate) &&
      'maxRefreshCount' in v &&
      isValidNumber(v.maxRefreshCount) &&
      'chains' in v &&
      isValidObject(v.chains) &&
      Object.values(v.chains).every((chain) => isValidObject(chain)) &&
      Object.values(v.chains).every(
        (chain) =>
          'isActiveSrc' in chain &&
          'isActiveDest' in chain &&
          typeof chain.isActiveSrc === 'boolean' &&
          typeof chain.isActiveDest === 'boolean',
      ),
  },
];

export const TOKEN_AGGREGATOR_VALIDATORS = [
  {
    property: 'aggregators',
    type: 'object',
    validator: (v: unknown): v is number[] =>
      isValidObject(v) && Object.values(v).every(isValidString),
  },
];

export const TOKEN_VALIDATORS: Validator<SwapsTokenObject>[] = [
  { property: 'decimals', type: 'number' },
  { property: 'address', type: 'string', validator: isValidHexAddress },
  {
    property: 'symbol',
    type: 'string',
    validator: (v: unknown) => isValidString(v) && v.length <= 12,
  },
];

export const QUOTE_RESPONSE_VALIDATORS: Validator<QuoteResponse>[] = [
  { property: 'quote', type: 'object', validator: isValidObject },
  { property: 'estimatedProcessingTimeInSeconds', type: 'number' },
  {
    property: 'approval',
    type: 'object|undefined',
    validator: (v: unknown) => v === undefined || isValidObject(v),
  },
  { property: 'trade', type: 'object', validator: isValidObject },
];

export const QUOTE_VALIDATORS: Validator<Quote>[] = [
  { property: 'requestId', type: 'string' },
  { property: 'srcTokenAmount', type: 'string' },
  { property: 'destTokenAmount', type: 'string' },
  { property: 'bridgeId', type: 'string' },
  { property: 'bridges', type: 'object', validator: isValidObject },
  { property: 'srcChainId', type: 'number' },
  { property: 'destChainId', type: 'number' },
  { property: 'srcAsset', type: 'object', validator: isValidObject },
  { property: 'destAsset', type: 'object', validator: isValidObject },
  { property: 'feeData', type: 'object', validator: isValidObject },
];

export const FEE_DATA_VALIDATORS: Validator<FeeData>[] = [
  {
    property: 'amount',
    type: 'string',
    validator: (v: unknown) => truthyDigitString(String(v)),
  },
  { property: 'asset', type: 'object', validator: isValidObject },
];

export const TX_DATA_VALIDATORS: Validator<TxData>[] = [
  { property: 'chainId', type: 'number' },
  { property: 'value', type: 'string', validator: isStrictHexString },
  { property: 'gasLimit', type: 'number' },
  { property: 'to', type: 'string', validator: isValidHexAddress },
  { property: 'from', type: 'string', validator: isValidHexAddress },
  { property: 'data', type: 'string', validator: isStrictHexString },
];
