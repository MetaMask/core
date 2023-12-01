/* eslint-disable jest/expect-expect */

import { cloneDeep } from 'lodash';

import {
  validateAddUserOperatioOptions,
  validateAddUserOperationRequest,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse,
} from './validation';

const ADD_USER_OPERATION_REQUEST_MOCK = {
  data: '0x1',
  to: '0x2',
  value: '0x3',
  maxFeePerGas: '0x4',
  maxPriorityFeePerGas: '0x5',
};

const ADD_USER_OPERATION_OPTIONS_MOCK = {
  chainId: '0x1',
  smartContractAccount: {
    prepareUserOperation: jest.fn(),
    updateUserOperation: jest.fn(),
    signUserOperation: jest.fn(),
  },
};

const PREPARE_USER_OPERATION_RESPONSE_MOCK = {
  bundler: 'http://test.com',
  callData: '0x1',
  dummyPaymasterAndData: '0x2',
  dummySignature: '0x3',
  gas: {
    callGasLimit: '0x4',
    preVerificationGas: '0x5',
    verificationGasLimit: '0x6',
  },
  initCode: '0x7',
  nonce: '0x8',
  sender: '0x9',
};

const UPDATE_USER_OPERATION_RESPONSE_MOCK = {
  paymasterAndData: '0x1',
};

const SIGN_USER_OPERATION_RESPONSE_MOCK = {
  signature: '0x1',
};

/**
 * Copy an object and set a property path to a given value.
 * @param object - The object to copy.
 * @param pathString - The property path to set.
 * @param value - The value to set.
 * @returns The copied object with the property path set to the given value.
 */
function setPropertyPath(object: any, pathString: string, value: any): any {
  const copy = cloneDeep(object);
  const path = pathString.split('.');
  const lastKey = path.pop();
  let currentObject = copy;

  for (const key of path) {
    currentObject = currentObject[key];
  }

  currentObject[lastKey as any] = value;

  return copy;
}

/**
 * Expect a validation error to be thrown.
 * @param validateFunction - The validation function to call.
 * @param input - The input to validate.
 * @param propertyName - The property name to set.
 * @param value - The value to set.
 * @param expectedMainError - The primary error.
 * @param expectedInternalError - The specific validation error.
 * @param rootPropertyName - The name of the root input.
 */
function expectValidationError(
  validateFunction: any,
  input: any,
  propertyName: string,
  value: any,
  expectedMainError: string,
  expectedInternalError: string,
  rootPropertyName: string,
) {
  const isRootTest = propertyName === rootPropertyName;

  const request = isRootTest
    ? value
    : setPropertyPath(input, propertyName, value);

  expect(() => validateFunction(request)).toThrow(
    `${expectedMainError}\n${
      isRootTest ? '' : `${propertyName} - `
    }${expectedInternalError}`,
  );
}

describe('validation', () => {
  describe('validateAddUserOperationRequest', () => {
    it.each([
      [
        'request',
        'missing',
        undefined,
        'Expected an object, but received: undefined',
      ],
      ['request', 'wrong type', 123, 'Expected an object, but received: 123'],
      [
        'maxFeePerGas',
        'missing',
        undefined,
        'Expected a value of type `Hex`, but received: `undefined`',
      ],
      [
        'maxPriorityFeePerGas',
        'missing',
        undefined,
        'Expected a value of type `Hex`, but received: `undefined`',
      ],
      [
        'data',
        'wrong type',
        123,
        'Expected a value of type `HexOrEmptyBytes`, but received: `123`',
      ],
      [
        'maxFeePerGas',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'maxPriorityFeePerGas',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'to',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'value',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
    ])(
      'throws if %s is %s',
      (propertyName, _valueDecription, value, expectedError) => {
        expectValidationError(
          validateAddUserOperationRequest,
          ADD_USER_OPERATION_REQUEST_MOCK,
          propertyName,
          value,
          'Invalid request to add user operation',
          expectedError,
          'request',
        );
      },
    );
  });

  describe('validateAddUserOperationOptions', () => {
    it.each([
      [
        'options',
        'missing',
        undefined,
        'Expected an object, but received: undefined',
      ],
      ['options', 'wrong type', 123, 'Expected an object, but received: 123'],
      [
        'chainId',
        'missing',
        undefined,
        'Expected a value of type `Hex`, but received: `undefined`',
      ],
      [
        'smartContractAccount',
        'missing',
        undefined,
        'Expected an object, but received: undefined',
      ],
      [
        'smartContractAccount.prepareUserOperation',
        'missing',
        undefined,
        'Expected a function, but received: undefined',
      ],
      [
        'smartContractAccount.updateUserOperation',
        'missing',
        undefined,
        'Expected a function, but received: undefined',
      ],
      [
        'smartContractAccount.signUserOperation',
        'missing',
        undefined,
        'Expected a function, but received: undefined',
      ],
      [
        'chainId',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'smartContractAccount',
        'wrong type',
        123,
        'Expected an object, but received: 123',
      ],
      [
        'smartContractAccount.prepareUserOperation',
        'wrong type',
        123,
        'Expected a function, but received: 123',
      ],
      [
        'smartContractAccount.updateUserOperation',
        'wrong type',
        123,
        'Expected a function, but received: 123',
      ],
      [
        'smartContractAccount.signUserOperation',
        'wrong type',
        123,
        'Expected a function, but received: 123',
      ],
    ])(
      'throws if %s is %s',
      (propertyName, _valueDecription, value, expectedError) => {
        expectValidationError(
          validateAddUserOperatioOptions,
          ADD_USER_OPERATION_OPTIONS_MOCK,
          propertyName,
          value,
          'Invalid options to add user operation',
          expectedError,
          'options',
        );
      },
    );
  });

  describe('validatePrepareUserOperationResponse', () => {
    it.each([
      [
        'response',
        'missing',
        undefined,
        'Expected an object, but received: undefined',
      ],
      ['response', 'wrong type', 123, 'Expected an object, but received: 123'],
      [
        'bundler',
        'missing',
        undefined,
        'Expected a string, but received: undefined',
      ],
      [
        'callData',
        'missing',
        undefined,
        'Expected a value of type `Hex`, but received: `undefined`',
      ],
      [
        'nonce',
        'missing',
        undefined,
        'Expected a value of type `Hex`, but received: `undefined`',
      ],
      [
        'sender',
        'missing',
        undefined,
        'Expected a value of type `Hex`, but received: `undefined`',
      ],
      ['bundler', 'wrong type', 123, 'Expected a string, but received: 123'],
      [
        'callData',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'dummyPaymasterAndData',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'dummySignature',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      ['gas', 'wrong type', 123, 'Expected an object, but received: 123'],
      [
        'initCode',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'nonce',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
      [
        'sender',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
    ])(
      'throws if %s is %s',
      (propertyName, _valueDecription, value, expectedError) => {
        expectValidationError(
          validatePrepareUserOperationResponse,
          PREPARE_USER_OPERATION_RESPONSE_MOCK,
          propertyName,
          value,
          'Invalid response when preparing user operation',
          expectedError,
          'response',
        );
      },
    );

    it('throws if no gas and no dummy signature', () => {
      const response = cloneDeep(PREPARE_USER_OPERATION_RESPONSE_MOCK);
      (response as any).gas = undefined;
      (response as any).dummySignature = undefined;

      expect(() => validatePrepareUserOperationResponse(response)).toThrow(
        'Invalid response when preparing user operation\nMust specify dummySignature if not specifying gas',
      );
    });
  });

  describe('validateUpdateUserOperationResponse', () => {
    it.each([
      ['response', 'wrong type', 123, 'Expected an object, but received: 123'],
      [
        'paymasterAndData',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
    ])(
      'throws if %s is %s',
      (propertyName, _valueDecription, value, expectedError) => {
        expectValidationError(
          validateUpdateUserOperationResponse,
          UPDATE_USER_OPERATION_RESPONSE_MOCK,
          propertyName,
          value,
          'Invalid response when updating user operation',
          expectedError,
          'response',
        );
      },
    );
  });

  describe('validateSignUserOperationResponse', () => {
    it.each([
      [
        'response',
        'missing',
        undefined,
        'Expected an object, but received: undefined',
      ],
      ['response', 'wrong type', 123, 'Expected an object, but received: 123'],
      [
        'signature',
        'missing',
        undefined,
        'Expected a value of type `Hex`, but received: `undefined`',
      ],
      [
        'signature',
        'wrong type',
        123,
        'Expected a value of type `Hex`, but received: `123`',
      ],
    ])(
      'throws if %s is %s',
      (propertyName, _valueDecription, value, expectedError) => {
        expectValidationError(
          validateSignUserOperationResponse,
          SIGN_USER_OPERATION_RESPONSE_MOCK,
          propertyName,
          value,
          'Invalid response when signing user operation',
          expectedError,
          'response',
        );
      },
    );
  });
});
