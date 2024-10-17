import type {
  MethodCallValidationError,
  MethodCallValidatorNoSchemaError,
} from './multichainMethodCallValidator';
import { multichainMethodCallValidator } from './multichainMethodCallValidator';

describe('multichainMethodCallValidator', () => {
  it('should validate method calls with no params', async () => {
    const errors = await multichainMethodCallValidator('wallet_getSession', {});
    expect(errors).toBe(false);
  });

  it('should validate method calls with invalid params when required and return errors', async () => {
    const errors = await multichainMethodCallValidator('wallet_createSession', {
      requiredScopes: true,
    });
    expect(errors).toHaveLength(1);
    expect((errors as MethodCallValidationError[])[0].message).toBe(
      'requiredScopes is not of a type(s) object',
    );
  });

  it('should have no errors when params are valid', async () => {
    const errors = await multichainMethodCallValidator('wallet_createSession', {
      requiredScopes: {
        'eip155:1337': {
          methods: ['eth_sendTransaction'],
          notifications: [],
        },
      },
      optionalScopes: {
        'eip155:1337': {
          methods: ['eth_sendTransaction'],
          notifications: [],
        },
      },
    });
    expect(errors).toBe(false);
  });

  describe('invalid number of params', () => {
    it('should validate method calls with invalid number of params when required and return errors', async () => {
      const errors = await multichainMethodCallValidator(
        'wallet_createSession',
        {
          chainId: 'eip155:1',
          accountAddress: '0x0',
          foo: 'bar',
          baz: 'potato',
        },
      );
      expect(errors).toHaveLength(1);
      expect((errors as MethodCallValidationError[])[0].message).toBe(
        'Invalid number of parameters.',
      );
      expect((errors as MethodCallValidatorNoSchemaError[])[0].expected).toBe(
        3,
      );
      expect((errors as MethodCallValidationError[])[0].got).toStrictEqual({
        chainId: 'eip155:1',
        accountAddress: '0x0',
        foo: 'bar',
        baz: 'potato',
      });
    });
  });
});
