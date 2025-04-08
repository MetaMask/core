import type {
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

import { multichainMethodCallValidatorMiddleware } from './multichainMethodCallValidatorMiddleware';
import { MultichainApiNotifications } from '../handlers/types';

describe('multichainMethodCallValidatorMiddleware', () => {
  const mockNext = jest.fn();

  describe('"wallet_invokeMethod" request', () => {
    it('should pass validation and call next when passed a valid "wallet_invokeMethod" request', async () => {
      const request: JsonRpcRequest = {
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
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });
    it('should throw an error when passed a "wallet_invokeMethod" request with no scope', async () => {
      const request: JsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0',
        method: 'wallet_invokeMethod',
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
              const rpcError = error as JsonRpcError & { data: JsonRpcError[] };
              expect(rpcError.message).toBe('Invalid method parameter(s).');
              expect(rpcError.code).toBe(-32602);
              expect(rpcError.data[0].data).toStrictEqual({
                got: undefined,
                param: 'scope',
                path: [],
                schema: {
                  pattern: '[-a-z0-9]{3,8}(:[-_a-zA-Z0-9]{1,32})?',
                  type: 'string',
                },
              });
              expect(rpcError.data[0].message).toBe(
                'scope is required, but is undefined',
              );
              resolve();
            } catch (e) {
              // This is okay; we'll get what we get.
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject(e);
            }
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).not.toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });
    it('should throw an error for a "wallet_invokeMethod" request without a nested request object', async () => {
      const request: JsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0',
        method: 'wallet_invokeMethod',
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
              const rpcError = error as JsonRpcError & { data: JsonRpcError[] };
              expect(rpcError.message).toBe('Invalid method parameter(s).');
              expect(rpcError.code).toBe(-32602);
              expect(rpcError.data[0].data).toStrictEqual({
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
              });
              expect(rpcError.data[0].message).toBe(
                'request is required, but is undefined',
              );
              resolve();
            } catch (e) {
              // This is okay; we'll get what we get.
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject(e);
            }
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).not.toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });
    it('should throw an error for an invalidly formatted "wallet_invokeMethod" request', async () => {
      const request: JsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0',
        method: 'wallet_invokeMethod',
        params: {
          scope: 'test',
          request: {
            method: {}, // expected to be a string
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
              const rpcError = error as JsonRpcError & { data: JsonRpcError[] };
              expect(rpcError.message).toBe('Invalid method parameter(s).');
              expect(rpcError.code).toBe(-32602);
              expect(rpcError.data[0].data).toStrictEqual({
                got: {
                  method: {},
                  params: {
                    test: 'test',
                  },
                },
                param: 'request',
                path: ['method'],
                schema: {
                  type: 'string',
                },
              });
              expect(rpcError.data[0].message).toBe(
                'request.method is not of a type(s) string',
              );
              resolve();
            } catch (e) {
              // This is okay; we'll get what we get.
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject(e);
            }
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).not.toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });
  });

  describe('"wallet_notify" request', () => {
    it('should pass validation for a "wallet_notify" request and call next', async () => {
      const request: JsonRpcRequest = {
        id: 2,
        jsonrpc: '2.0',
        method: MultichainApiNotifications.walletNotify,
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
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });

    it('should throw an error for a "wallet_notify" request with invalid params', async () => {
      const request: JsonRpcRequest = {
        id: 2,
        jsonrpc: '2.0',
        method: MultichainApiNotifications.walletNotify,
        params: {
          scope: 'test_scope',
          request: {
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
              const rpcError = error as JsonRpcError & { data: JsonRpcError[] };
              expect(rpcError.message).toBe('Invalid method parameter(s).');
              expect(rpcError.code).toBe(-32602);
              expect(rpcError.data[0].data).toStrictEqual({
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
              });
              expect(rpcError.data[0].message).toBe(
                'notification is required, but is undefined',
              );
              resolve();
            } catch (e) {
              // This is okay; we'll get what we get.
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject(e);
            }
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).not.toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });
  });

  describe('"wallet_revokeSession" request', () => {
    it('should pass validation and call next when passed a valid "wallet_revokeSession" request', async () => {
      const request: JsonRpcRequest = {
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
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });
  });

  describe('"wallet_getSession" request', () => {
    it('should pass validation and call next when passed a valid "wallet_getSession" request', async () => {
      const request: JsonRpcRequest = {
        id: 5,
        jsonrpc: '2.0',
        method: 'wallet_getSession',
        params: {},
      };
      const response = {} as JsonRpcResponse<typeof request>;

      await new Promise<void>((resolve, reject) => {
        multichainMethodCallValidatorMiddleware(
          request,
          response,
          mockNext,
          (error) => {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          },
        );

        process.nextTick(() => {
          try {
            expect(mockNext).toHaveBeenCalled();
            resolve();
          } catch (error) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          }
        });
      });
    });
  });

  it('should throw an error if the top level params are not an object', async () => {
    const request: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'wallet_invokeMethod',
      params: ['test'],
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
            resolve();
          } catch (e) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(e);
          }
        },
      );

      process.nextTick(() => {
        try {
          expect(mockNext).not.toHaveBeenCalled();
          resolve();
        } catch (error) {
          // This is okay; we'll get what we get.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        }
      });
    });
  });

  it('should throw an error when passed an unknown method at the top level', async () => {
    const request: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'unknown_method',
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
            const rpcError = error as JsonRpcError & { data: JsonRpcError[] };
            expect(rpcError.message).toBe('Invalid method parameter(s).');
            expect(rpcError.code).toBe(-32602);
            expect(rpcError.data[0].data).toStrictEqual({
              method: 'unknown_method',
            });
            expect(rpcError.data[0].message).toBe(
              'The method does not exist / is not available.',
            );
            resolve();
          } catch (e) {
            // This is okay; we'll get what we get.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(e);
          }
        },
      );

      process.nextTick(() => {
        try {
          expect(mockNext).not.toHaveBeenCalled();
          resolve();
        } catch (error) {
          // This is okay; we'll get what we get.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        }
      });
    });
  });
});
