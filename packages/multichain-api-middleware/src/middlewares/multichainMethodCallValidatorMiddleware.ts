import { MultiChainOpenRPCDocument } from '@metamask/api-specs';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';
import { isObject } from '@metamask/utils';
import type { JsonRpcError, JsonRpcParams } from '@metamask/utils';
import type {
  ContentDescriptorObject,
  MethodObject,
  OpenrpcDocument,
  ReferenceObject,
} from '@open-rpc/meta-schema';
import dereferenceDocument from '@open-rpc/schema-utils-js/build/dereference-document';
import { makeCustomResolver } from '@open-rpc/schema-utils-js/build/parse-open-rpc-document';
import type { Schema, ValidationError } from 'jsonschema';
import { Validator } from 'jsonschema';

const transformError = (
  error: ValidationError,
  param: ContentDescriptorObject,
  got: unknown,
) => {
  // if there is a path, add it to the message
  const message = `${param.name}${
    error.path.length > 0 ? `.${error.path.join('.')}` : ''
  } ${error.message}`;

  return rpcErrors.invalidParams({
    message,
    data: {
      param: param.name,
      path: error.path,
      schema: error.schema,
      got,
    },
  });
};

const v = new Validator();

const dereffedPromise = dereferenceDocument(
  MultiChainOpenRPCDocument as unknown as OpenrpcDocument,
  makeCustomResolver({}),
);

/**
 * Helper that utilizes the Multichain method specifications from `@metamask/api-specs`
 * to validate the params of a Multichain request.
 *
 * @param method - The request's method.
 * @param params - The request's optional JsonRpcParams object.
 * @returns an array of error objects for each validation error or an empty array if no errors.
 */
const multichainMethodCallValidator = async (
  method: string,
  params: JsonRpcParams | undefined,
) => {
  const dereffed = await dereffedPromise;

  const methodToCheck = dereffed.methods.find(
    (m: MethodObject | ReferenceObject) => (m as MethodObject).name === method,
  ) as MethodObject | undefined;

  if (
    !methodToCheck ||
    !isObject(methodToCheck) ||
    !('params' in methodToCheck)
  ) {
    return [rpcErrors.methodNotFound({ data: { method } })] as JsonRpcError[];
  }

  const errors: JsonRpcError[] = [];
  for (const param of methodToCheck.params) {
    if (!isObject(params)) {
      return [rpcErrors.invalidParams()] as JsonRpcError[];
    }
    const p = param as ContentDescriptorObject;
    const paramToCheck = params[p.name];

    const result = v.validate(paramToCheck, p.schema as unknown as Schema, {
      required: p.required,
    });
    if (result.errors) {
      errors.push(
        ...result.errors.map((e) => {
          return transformError(e, p, paramToCheck) as JsonRpcError;
        }),
      );
    }
  }
  return errors;
};

/**
 * Middleware that validates the params of a Multichain method request
 * using the specifications from `@metamask/api-specs`.
 */
export const multichainMethodCallValidatorMiddleware = createAsyncMiddleware(
  async (request, _response, next) => {
    const errors = await multichainMethodCallValidator(
      request.method,
      request.params,
    );
    if (errors.length > 0) {
      throw rpcErrors.invalidParams<JsonRpcError[]>({ data: errors });
    }
    return await next();
  },
);
