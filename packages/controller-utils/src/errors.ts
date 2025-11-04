import { JsonRpcError } from '@metamask/rpc-errors';
import type { Json } from '@metamask/utils';

import { CUSTOM_RPC_ERRORS } from './constants';

type Options = {
  message?: string;
  response: Json;
};

export class InvalidResponseFromEndpointError extends JsonRpcError<{
  response: Json;
}> {
  constructor({ message, response }: Options) {
    super(
      CUSTOM_RPC_ERRORS.invalidResponseFromEndpoint,
      message ?? 'Invalid response from endpoint',
    );
    this.data = { response };
  }
}
