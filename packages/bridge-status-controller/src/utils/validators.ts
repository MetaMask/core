import { BRIDGE_STATUS_BASE_URL } from '../constants';
import {
  type BridgeId,
  type SrcChainStatus,
  type Asset,
  type Validator,
  StatusTypes,
} from '../types';

export const truthyString = (string: string) => Boolean(string?.length);

export const validateResponse = <ExpectedResponse, DataToValidate>(
  validators: Validator<ExpectedResponse, DataToValidate>[],
  data:
    | Record<keyof ExpectedResponse, DataToValidate>
    | null
    | undefined
    | unknown,
  urlUsed: string,
): boolean => {
  return validateData(validators, data as Record<string, unknown>, urlUsed);
};

const assetValidators = [
  {
    property: 'chainId',
    type: 'number',
    validator: (v: unknown): v is number => typeof v === 'number',
  },
  {
    property: 'address',
    type: 'string',
    validator: (v: unknown): v is string => truthyString(v as string),
  },
  {
    property: 'symbol',
    type: 'string',
    validator: (v: unknown): v is string => typeof v === 'string',
  },
  {
    property: 'name',
    type: 'string',
    validator: (v: unknown): v is string => typeof v === 'string',
  },
  {
    property: 'decimals',
    type: 'number',
    validator: (v: unknown): v is number => typeof v === 'number',
  },
  {
    property: 'icon',
    // typeof null === 'object'
    type: 'string|undefined|object',
    validator: (v: unknown): v is string | undefined | object =>
      v === undefined || v === null || typeof v === 'string',
  },
];

const assetValidator = (v: Record<keyof Asset, unknown>): boolean =>
  validateResponse<Asset, unknown>(assetValidators, v, BRIDGE_STATUS_BASE_URL);

const srcChainStatusValidators = [
  {
    property: 'chainId',
    // For some reason, API returns destChain.chainId as a string, it's a number everywhere else
    type: 'number|string',
    validator: (v: unknown): v is number | string =>
      typeof v === 'number' || typeof v === 'string',
  },
  {
    property: 'txHash',
    type: 'string',
    validator: (v: unknown): v is string => truthyString(v as string),
  },
  {
    property: 'amount',
    type: 'string|undefined',
    validator: (v: unknown): v is string | undefined =>
      v === undefined || typeof v === 'string',
  },
  {
    property: 'token',
    type: 'object|undefined',
    validator: (v: unknown): boolean =>
      v === undefined ||
      (v && typeof v === 'object' && Object.keys(v).length === 0) ||
      assetValidator(v as Record<keyof Asset, unknown>),
  },
];

const srcChainStatusValidator = (
  v: Record<string | number, Record<keyof Asset, unknown>>,
): boolean =>
  validateResponse<SrcChainStatus, unknown>(
    srcChainStatusValidators,
    v,
    BRIDGE_STATUS_BASE_URL,
  );

const destChainStatusValidators = [
  {
    property: 'chainId',
    // For some reason, API returns destChain.chainId as a string, it's a number everywhere else
    type: 'number|string',
    validator: (v: unknown): v is number | string =>
      typeof v === 'number' || typeof v === 'string',
  },
  {
    property: 'amount',
    type: 'string|undefined',
    validator: (v: unknown): v is string | undefined =>
      v === undefined || typeof v === 'string',
  },
  {
    property: 'txHash',
    type: 'string|undefined',
    validator: (v: unknown): v is string | undefined =>
      v === undefined || typeof v === 'string',
  },
  {
    property: 'token',
    type: 'object|undefined',
    validator: (v: Record<keyof Asset, unknown>) =>
      v === undefined ||
      (v && typeof v === 'object' && Object.keys(v).length === 0) ||
      assetValidator(v),
  },
];

const destChainStatusValidator = (
  v: Record<string | number, unknown>,
): boolean =>
  validateResponse(destChainStatusValidators, v, BRIDGE_STATUS_BASE_URL);

export const availableValidators = [
  {
    property: 'status',
    type: 'string',
    validator: (v: unknown): boolean =>
      Object.values(StatusTypes).includes(v as StatusTypes),
  },
  {
    property: 'srcChain',
    type: 'object',
    validator: srcChainStatusValidator,
  },
  {
    property: 'destChain',
    type: 'object|undefined',
    validator: (v: Record<string | number, unknown>): boolean =>
      v === undefined || destChainStatusValidator(v),
  },
  {
    property: 'bridge',
    type: 'string|undefined',
    validator: (v: unknown): v is BridgeId | undefined =>
      v === undefined || typeof v === 'string',
  },
  {
    property: 'isExpectedToken',
    type: 'boolean|undefined',
    validator: (v: unknown): v is boolean | undefined =>
      v === undefined || typeof v === 'boolean',
  },
  {
    property: 'isUnrecognizedRouterAddress',
    type: 'boolean|undefined',
    validator: (v: unknown): v is boolean | undefined =>
      v === undefined || typeof v === 'boolean',
  }
];

/**
 * Validates the response from the API.
 *
 * @param validators - Validators to use for validation
 * @param object - Object to validate
 * @param urlUsed - string
 * @param logError - boolean to log errors
 * @returns boolean[]
 */
export function validateData<T, U>(
  validators: Validator<T, U>[],
  object: Record<string, unknown>,
  urlUsed: string,
  logError = true,
) {
  return validators.every(({ property, type, validator }) => {
    const types = type.split('|');

    if (!object) {
      if (logError) {
        console.error(
          `response to GET ${urlUsed} invalid for property ${property as string}; value was:`,
          object,
          '| type was: ',
          typeof object,
        );
      }

      return false;
    }

    const key = object[property as keyof object] as U;

    const valid =
      types.some((_type) => typeof key === _type) &&
      (!validator || validator(key));
    if (!valid && logError) {
      console.error(
        `response to GET ${urlUsed} invalid for property ${property as string}; value was:`,
        key,
        '| type was: ',
        typeof key,
      );
    }
    return valid;
  });
}
