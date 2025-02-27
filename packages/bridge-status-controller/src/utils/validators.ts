import { isValidHexAddress } from '@metamask/controller-utils';

import { BRIDGE_STATUS_BASE_URL } from './bridge-status';
import type { DestChainStatus, SrcChainStatus, Asset } from '../types';
import { BridgeId, StatusTypes } from '../types';

type Validator<ExpectedResponse, DataToValidate> = {
  property: keyof ExpectedResponse | string;
  type: string;
  validator: (value: DataToValidate) => boolean;
};

export const validHex = (value: unknown) =>
  typeof value === 'string' && Boolean(value.match(/^0x[a-f0-9]+$/u));
const isValidObject = (v: unknown): v is object =>
  typeof v === 'object' && v !== null;

export const validateData = <ExpectedResponse, DataToValidate>(
  validators: Validator<ExpectedResponse, DataToValidate>[],
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

export const validateResponse = <ExpectedResponse, DataToValidate>(
  validators: Validator<ExpectedResponse, DataToValidate>[],
  data: unknown,
  urlUsed: string,
): data is ExpectedResponse => {
  if (data === null || data === undefined) {
    return false;
  }
  return validateData(validators, data, urlUsed);
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
    validator: (v: unknown): v is string => isValidHexAddress(v as string),
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

const assetValidator = (v: unknown): v is Asset =>
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
    validator: validHex,
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
    validator: (v: unknown): v is object | undefined =>
      v === undefined ||
      (v && typeof v === 'object' && Object.keys(v).length === 0) ||
      assetValidator(v),
  },
];

const srcChainStatusValidator = (v: unknown): v is SrcChainStatus =>
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
    validator: (v: unknown): v is Asset | undefined =>
      v === undefined ||
      (v && typeof v === 'object' && Object.keys(v).length === 0) ||
      assetValidator(v),
  },
];

const destChainStatusValidator = (v: unknown): v is DestChainStatus =>
  validateResponse<DestChainStatus, unknown>(
    destChainStatusValidators,
    v,
    BRIDGE_STATUS_BASE_URL,
  );

export const validators = [
  {
    property: 'status',
    type: 'string',
    validator: (v: unknown): v is StatusTypes =>
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
    validator: (v: unknown): v is object | unknown =>
      v === undefined || destChainStatusValidator(v),
  },
  {
    property: 'bridge',
    type: 'string|undefined',
    validator: (v: unknown): v is BridgeId | undefined =>
      v === undefined || Object.values(BridgeId).includes(v as BridgeId),
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
  },
  // TODO: add refuel validator
  // {
  //   property: 'refuel',
  //   type: 'object',
  //   validator: (v: unknown) => Object.values(RefuelStatusResponse).includes(v),
  // },
];
