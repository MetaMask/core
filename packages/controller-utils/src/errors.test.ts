import { JsonRpcError } from '@metamask/rpc-errors';
import { InvalidResponseFromEndpointError } from './errors';

describe('InvalidResponseFromEndpointError', () => {
  it('should be an instance of JsonRpcError', () => {
    expect(
      new InvalidResponseFromEndpointError({ response: {} }),
    ).toBeInstanceOf(JsonRpcError);
  });

  it('should expose the response', () => {
    const response = { result: null };
    const error = new InvalidResponseFromEndpointError({ response });
    expect(error.data?.response).toBe(response);
  });
});
