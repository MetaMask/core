import type {
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

import type {
  Caip27Params,
  Caip285Params,
  Caip319Params,
} from '../scope/types';
import { multichainMethodCallValidatorMiddleware } from './multichainMethodCallValidator';

describe('multichainMethodCallValidatorMiddleware', () => {
  const mockNext = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('"wallet_invokeMethod" request', () => {
    it('should pass validation for a "wallet_invokeMethod" request and call next', async () => {
      const request: JsonRpcRequest<Caip27Params> = {
        id: 1,
        jsonrpc: '2.0',
        method: 'wallet_invokeMethod',
        params: {
          scope: 'test',
          request: {
            method: 'test_method',
            params: {
              test: 'test',
            },
          },
        },
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
    it('should throw an error for a a "wallet_invokeMethod" request with no scope', async () => {
      const request: JsonRpcRequest<Caip27Params> = {
        id: 1,
        jsonrpc: '2.0',
        method: 'wallet_invokeMethod',
        // @ts-expect-error test
        params: {
          request: {
            method: 'test_method',
            params: {
              test: 'test',
            },
          },
        },
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            try {
              expect(error).toBeDefined();
              expect((error as JsonRpcError).message).toBe(
                'Invalid method parameter(s).',
              );
              expect((error as JsonRpcError).code).toBe(-32602);
              expect((error as JsonRpcError).data).toStrictEqual([
                {
                  code: -32602,
                  message: 'scope is required, but is undefined',
                  data: {
                    param: 'scope',
                    path: [],
                    schema: {
                      pattern: '[-a-z0-9]{3,8}(:[-_a-zA-Z0-9]{1,32})?',
                      type: 'string',
                    },
                    got: undefined,
                  },
                },
              ]);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).not.toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
    it('should throw an error for a "wallet_invokeMethod" request without a nested request object', async () => {
      const request: JsonRpcRequest<Caip27Params> = {
        id: 1,
        jsonrpc: '2.0',
        method: 'wallet_invokeMethod',
        // @ts-expect-error test
        params: {
          scope: 'test',
        },
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            try {
              expect(error).toBeDefined();
              expect((error as JsonRpcError).message).toBe(
                'Invalid method parameter(s).',
              );
              expect((error as JsonRpcError).code).toBe(-32602);
              expect((error as JsonRpcError).data).toStrictEqual([
                {
                  code: -32602,
                  data: {
                    got: undefined,
                    param: 'request',
                    path: [],
                    schema: {
                      properties: {
                        method: {
                          type: 'string',
                        },
                        params: true,
                      },
                      type: 'object',
                    },
                  },
                  message: 'request is required, but is undefined',
                },
              ]);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).not.toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

  describe('"wallet_notify" request', () => {
    it('should pass validation for a "wallet_notify" request and call next', async () => {
      const request: JsonRpcRequest<Caip319Params> = {
        id: 2,
        jsonrpc: '2.0',
        method: 'wallet_notify',
        params: {
          scope: 'test_scope',
          notification: {
            method: 'test_method',
            params: {
              data: {
                key: 'value',
              },
            },
          },
        },
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });

    it('should throw an error for a "wallet_notify" request with invalid params', async () => {
      const request: JsonRpcRequest<Caip27Params> = {
        id: 2,
        jsonrpc: '2.0',
        method: 'wallet_notify',
        params: {
          // Missing required parameters or invalid structure
          scope: 'test_scope',
          request: {
            // @ts-expect-error test
            event: '',
            data: {},
          },
        },
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            try {
              expect(error).toBeDefined();
              expect((error as JsonRpcError).code).toBe(-32602);
              expect((error as JsonRpcError).message).toBe(
                'Invalid method parameter(s).',
              );
              expect((error as JsonRpcError).data).toStrictEqual([
                {
                  code: -32602,
                  data: {
                    got: undefined,
                    param: 'notification',
                    path: [],
                    schema: {
                      properties: {
                        method: {
                          type: 'string',
                        },
                        params: true,
                      },
                      type: 'object',
                    },
                  },
                  message: 'notification is required, but is undefined',
                },
              ]);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).not.toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

  describe('"wallet_revokeSession" request', () => {
    it('should pass validation for a "wallet_revokeSession" request and call next', async () => {
      const request: JsonRpcRequest<Caip285Params> = {
        id: 3,
        jsonrpc: '2.0',
        method: 'wallet_revokeSession',
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

  describe('"wallet_getSession" request', () => {
    it('should pass validation for a "wallet_getSession" request and call next', async () => {
      const request: JsonRpcRequest<Caip285Params> = {
        id: 5,
        jsonrpc: '2.0',
        method: 'wallet_getSession',
        // @ts-expect-error TODO figure out why this type is not working
        params: {},
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

  it('should throw an error is passed an unknown method', async () => {
    const request: JsonRpcRequest<Caip27Params> = {
      id: 1,
      jsonrpc: '2.0',
      method: 'unknown_method',
      // @ts-expect-error test
      params: {
        request: {
          method: 'test_method',
          params: {
            test: 'test',
          },
        },
      },
    };
    const response = {} as JsonRpcResponse<typeof request>;

    await new Promise<void>((resolve, reject) => {
      multichainMethodCallValidatorMiddleware(
        request,
        response,
        mockNext,
        (error) => {
          try {
            expect(error).toBeDefined();
            console.log('error in test', error);
            expect((error as JsonRpcError).message).toBe(
              'Invalid method parameter(s).',
            );
            expect((error as JsonRpcError).code).toBe(-32602);
            expect((error as JsonRpcError).data).toStrictEqual([
              {
                code: -32601,
                message: 'The method does not exist / is not available.',
                data: {
                  method: 'unknown_method',
                },
              },
            ]);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      );

      process.nextTick(() => {
        try {
          expect(mockNext).not.toHaveBeenCalled();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });
});
