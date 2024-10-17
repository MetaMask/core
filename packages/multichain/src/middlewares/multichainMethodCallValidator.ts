import { MultiChainOpenRPCDocument } from '@metamask/api-specs';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';
import { isObject } from '@metamask/utils';
import type { Json, JsonRpcParams } from '@metamask/utils';
import type {
  ContentDescriptorObject,
  MethodObject,
  OpenrpcDocument,
} from '@open-rpc/meta-schema';
import dereferenceDocument from '@open-rpc/schema-utils-js/build/dereference-document';
import { makeCustomResolver } from '@open-rpc/schema-utils-js/build/parse-open-rpc-document';
import type { Schema, ValidationError } from 'jsonschema';
import { Validator } from 'jsonschema';

export type MethodCallValidationSchemaError = {
  message: string;
  param: string;
  path: (string | number)[];
  schema: string | Schema;
  got: unknown;
};

export type MethodCallValidatorNoSchemaError = {
  message: string;
  expected?: Json;
  got: unknown;
};

export type MethodCallValidationError =
  | MethodCallValidationSchemaError
  | MethodCallValidatorNoSchemaError;

const transformError = (
  error: ValidationError,
  param: ContentDescriptorObject,
  got: unknown,
): MethodCallValidationError => {
  // if there is a path, add it to the message
  const message = `${
    param.name + (error.path.length > 0 ? `.${error.path.join('.')}` : '')
  } ${error.message}`;

  return {
    message,
    param: param.name,
    path: error.path,
    schema: error.schema,
    got,
  };
};

const checkForInvalidParams = (
  params: JsonRpcParams | undefined,
  paramsToCheck: ContentDescriptorObject[],
) => {
  const errors: MethodCallValidationError[] = [];
  const numRequiredParams = (paramsToCheck as ContentDescriptorObject[]).filter(
    (p) => p.required,
  ).length;

  let paramsLength = 0;
  if (Array.isArray(params)) {
    paramsLength = params.length;
  } else if (isObject(params)) {
    paramsLength = Object.keys(params).length;
  }

  if (numRequiredParams > paramsLength && numRequiredParams > 0) {
    errors.push({
      message: `Invalid number of parameters.`,
      expected: numRequiredParams,
      got: params,
    });
  } else if (paramsLength > paramsToCheck.length) {
    errors.push({
      message: `Invalid number of parameters.`,
      expected: paramsToCheck.length,
      got: params,
    });
  }

  return errors;
};

const v = new Validator();

const dereffedPromise = dereferenceDocument(
  MultiChainOpenRPCDocument as unknown as OpenrpcDocument,
  makeCustomResolver({}),
);
export const multichainMethodCallValidator = async (
  method: string,
  params: JsonRpcParams | undefined,
) => {
  const dereffed = await dereffedPromise;
  const methodToCheck = dereffed.methods.find(
    (m) => (m as unknown as ContentDescriptorObject).name === method,
  );
  const errors: MethodCallValidationError[] = [];

  const paramsToCheck = (methodToCheck as unknown as MethodObject).params;

  // check each param and aggregate errors
  paramsToCheck.forEach((param, i) => {
    let paramToCheck: Json | undefined;
    const p = param as ContentDescriptorObject;
    if (isObject(params)) {
      paramToCheck = params[p.name];
    } else if (params && Array.isArray(params)) {
      paramToCheck = params[i];
    } else {
      paramToCheck = undefined;
    }
    const result = v.validate(paramToCheck, p.schema as unknown as Schema, {
      required: p.required,
    });
    if (result.errors) {
      errors.push(
        ...result.errors.map((e) => {
          return transformError(e, p, paramToCheck);
        }),
      );
    }
  });

  const invalidParamsErrors = checkForInvalidParams(
    params,
    paramsToCheck as ContentDescriptorObject[],
  );

  if (invalidParamsErrors.length > 0) {
    errors.push(...invalidParamsErrors);
  }

  if (errors.length > 0) {
    return errors;
  }

  // feels like this should return true to indicate that its valid but i'd rather check the falsy value since errors
  // would be an array and return true if it's empty
  return false;
};

export const multichainMethodCallValidatorMiddleware: JsonRpcMiddleware<
  JsonRpcParams,
  Json
> = function (request, _response, next, end) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  multichainMethodCallValidator(request.method, request.params).then(
    (errors) => {
      if (errors) {
        return end(
          rpcErrors.invalidParams({
            data: errors as Json[],
          }),
        );
      }
      return next();
    },
  );
};
