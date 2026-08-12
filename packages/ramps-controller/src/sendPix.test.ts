import type { Hex } from '@metamask/utils';

import {
  SEND_PIX_SOURCE_CURRENCY_CHAIN,
  SEND_PIX_SOURCE_CURRENCY_CODE,
  assertPixAddressRegistered,
  buildAutorampQuoteQuery,
  buildCreateAutorampBody,
  buildRegisterPixAddressBody,
  deriveSendPixIds,
  executeSendPix,
  isSendPixEnabled,
  parseAndAssertAutorampQuote,
  parseMusdAmountInRaw,
  parsePixAddressResponse,
  requireIronDepositAddress,
  validateSendPixRequest,
  type SendPixDeps,
  type SendPixRequest,
} from './sendPix.js';

const MONEY_ACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;

function baseRequest(
  overrides: Partial<SendPixRequest> = {},
): SendPixRequest {
  return {
    amountOut: '100.00',
    destinationCurrencyCode: 'BRL',
    moneyAccountAddress: MONEY_ACCOUNT,
    customerId: 'cust-1',
    clientRequestId: 'client-req-1',
    pix: {
      keyType: 'CPF',
      key: '12345678901',
      taxId: '12345678901',
      recipient: {
        type: 'Individual',
        givenName: 'Ada',
        familyName: 'Lovelace',
      },
    },
    ...overrides,
  };
}

describe('sendPix helpers', () => {
  describe('validateSendPixRequest', () => {
    it('accepts a valid request', () => {
      expect(() => validateSendPixRequest(baseRequest())).not.toThrow();
    });

    it('accepts a valid CNPJ Business recipient', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              keyType: 'CNPJ',
              key: '12345678000199',
              taxId: '12345678000199',
              recipient: { type: 'Business', name: 'Acme Ltd' },
            },
          }),
        ),
      ).not.toThrow();
    });

    it('rejects empty amountOut', () => {
      expect(() =>
        validateSendPixRequest(baseRequest({ amountOut: '' })),
      ).toThrow(/amountOut/u);
    });

    it('rejects non-positive amountOut', () => {
      expect(() =>
        validateSendPixRequest(baseRequest({ amountOut: '0' })),
      ).toThrow(/amountOut/u);
    });

    it('rejects non-decimal amountOut', () => {
      expect(() =>
        validateSendPixRequest(baseRequest({ amountOut: 'ten' })),
      ).toThrow(/amountOut/u);
    });

    it('rejects unsupported destination currency', () => {
      expect(() =>
        validateSendPixRequest(baseRequest({ destinationCurrencyCode: 'USD' })),
      ).toThrow(/BRL/u);
    });

    it('rejects invalid moneyAccountAddress', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({ moneyAccountAddress: 'not-hex' as Hex }),
        ),
      ).toThrow(/moneyAccountAddress/u);
    });

    it('rejects missing customerId', () => {
      expect(() =>
        validateSendPixRequest(baseRequest({ customerId: '' })),
      ).toThrow(/customerId/u);
    });

    it('rejects missing clientRequestId', () => {
      expect(() =>
        validateSendPixRequest(baseRequest({ clientRequestId: '  ' })),
      ).toThrow(/clientRequestId/u);
    });

    it('rejects unsupported pix keyType', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              ...baseRequest().pix,
              keyType: 'BANK_DETAILS' as never,
            },
          }),
        ),
      ).toThrow(/keyType/u);
    });

    it('rejects missing taxId', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: { ...baseRequest().pix, taxId: '' },
          }),
        ),
      ).toThrow(/taxId/u);
    });

    it('rejects CPF with Business recipient', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              ...baseRequest().pix,
              keyType: 'CPF',
              recipient: { type: 'Business', name: 'Acme' },
            },
          }),
        ),
      ).toThrow(/Individual/u);
    });

    it('accepts CNPJ with Business recipient', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              keyType: 'CNPJ',
              key: '12345678000199',
              taxId: '12345678000199',
              recipient: { type: 'Business', name: 'Acme Ltd' },
            },
          }),
        ),
      ).not.toThrow();
    });

    it('rejects unknown recipient type', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              ...baseRequest().pix,
              recipient: { type: 'Unknown' } as never,
            },
          }),
        ),
      ).toThrow(/Individual or Business/u);
    });

    it('rejects missing pix key', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: { ...baseRequest().pix, key: '  ' },
          }),
        ),
      ).toThrow(/pix.key/u);
    });

    it('rejects Individual missing names', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              ...baseRequest().pix,
              recipient: {
                type: 'Individual',
                givenName: '',
                familyName: 'Lovelace',
              },
            },
          }),
        ),
      ).toThrow(/givenName/u);
    });

    it('rejects CNPJ with Individual recipient', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              keyType: 'CNPJ',
              key: '12345678000199',
              taxId: '12345678000199',
              recipient: {
                type: 'Individual',
                givenName: 'Ada',
                familyName: 'Lovelace',
              },
            },
          }),
        ),
      ).toThrow(/Business/u);
    });

    it('rejects Business missing name', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              keyType: 'CNPJ',
              key: '12345678000199',
              taxId: '12345678000199',
              recipient: { type: 'Business', name: '' },
            },
          }),
        ),
      ).toThrow(/name/u);
    });

    it('rejects missing recipient object', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              ...baseRequest().pix,
              recipient: undefined as never,
            },
          }),
        ),
      ).toThrow(/recipient is required/u);
    });

    it('rejects unknown recipient type', () => {
      expect(() =>
        validateSendPixRequest(
          baseRequest({
            pix: {
              ...baseRequest().pix,
              recipient: { type: 'Trust' } as never,
            },
          }),
        ),
      ).toThrow(/Individual or Business/u);
    });
  });

  describe('isSendPixEnabled', () => {
    it('requires both Pix send and withdraw flags', () => {
      expect(
        isSendPixEnabled({
          remoteFeatureFlags: {
            moneyAccount: {
              moneyAccountPixSendEnabled: true,
              moneyAccountWithdrawEnabled: true,
            },
          },
        }),
      ).toBe(true);
      expect(
        isSendPixEnabled({
          remoteFeatureFlags: {
            moneyAccount: {
              moneyAccountPixSendEnabled: true,
              moneyAccountWithdrawEnabled: false,
            },
          },
        }),
      ).toBe(false);
      expect(isSendPixEnabled({ remoteFeatureFlags: {} })).toBe(false);
    });
  });

  describe('buildRegisterPixAddressBody', () => {
    it('maps camelCase Individual recipient to Iron snake_case', () => {
      expect(buildRegisterPixAddressBody(baseRequest())).toStrictEqual({
        customer_id: 'cust-1',
        recipient: {
          tax_id: '12345678901',
          recipient: {
            type: 'Individual',
            given_name: 'Ada',
            family_name: 'Lovelace',
          },
          account: { type: 'CPF', key: '12345678901' },
        },
      });
    });

    it('maps Business recipient', () => {
      const request = baseRequest({
        pix: {
          keyType: 'CNPJ',
          key: '12345678000199',
          taxId: '12345678000199',
          recipient: { type: 'Business', name: 'Acme Ltd' },
          label: 'Work',
        },
      });
      expect(buildRegisterPixAddressBody(request)).toMatchObject({
        label: 'Work',
        recipient: {
          recipient: { type: 'Business', name: 'Acme Ltd' },
          account: { type: 'CNPJ', key: '12345678000199' },
        },
      });
    });
  });

  describe('buildAutorampQuoteQuery', () => {
    it('sends amount_out only with fixed source constants', () => {
      const query = buildAutorampQuoteQuery(baseRequest(), 'pix-1');
      expect(query).toMatchObject({
        customer_id: 'cust-1',
        recipient_account_id: 'pix-1',
        amount_out: '100.00',
        destination_currency_code: 'BRL',
        source_currency_code: SEND_PIX_SOURCE_CURRENCY_CODE,
        source_currency_chain: SEND_PIX_SOURCE_CURRENCY_CHAIN,
        is_third_party: false,
        rate_expiry_policy: 'Return',
        expiry_in_hours: 1,
      });
      expect(query).not.toHaveProperty('amount_in');
    });
  });

  describe('buildCreateAutorampBody', () => {
    it('wraps signature as signed_quote per #9851 fixture shape (Q3 assumption)', () => {
      // ASSUMPTION: Matt / proxy may still require verbatim signed quote JSON;
      // adapter matches NeoBankService #9851 fixtures until confirmed.
      const quote = { signature: 'sig', amount_in: { amount: '1' } };
      expect(buildCreateAutorampBody(quote, 'cust-1')).toStrictEqual({
        signed_quote: 'sig',
        customer_id: 'cust-1',
      });
    });

    it('prefers explicit signed_quote field when present', () => {
      expect(
        buildCreateAutorampBody(
          { signed_quote: 'from-field', signature: 'sig' },
          'cust-1',
        ),
      ).toStrictEqual({
        signed_quote: 'from-field',
        customer_id: 'cust-1',
      });
    });

    it('forwards non-object quote payloads as signed_quote', () => {
      expect(buildCreateAutorampBody('opaque-sig', 'cust-1')).toStrictEqual({
        signed_quote: 'opaque-sig',
        customer_id: 'cust-1',
      });
    });
  });

  describe('parseAndAssertAutorampQuote', () => {
    const future = new Date(Date.now() + 60_000).toISOString();

    it('parses a valid signed quote', () => {
      const parsed = parseAndAssertAutorampQuote(
        {
          id: 'q-1',
          signature: 'sig',
          valid_until: future,
          amount_in: {
            amount: '12.345678',
            currency_code: 'mUSD',
            chain: 'monad',
            decimals: 6,
          },
          amount_out: { amount: '100.00' },
          source_currency_code: 'mUSD',
          source_currency_chain: 'monad',
        },
        Date.now(),
      );
      expect(parsed.amountInAmount).toBe('12.345678');
      expect(parsed.quoteId).toBe('q-1');
      expect(parsed.validUntil).toBe(future);
    });

    it('throws when quote is malformed', () => {
      expect(() => parseAndAssertAutorampQuote(null)).toThrow(/malformed/u);
      expect(() => parseAndAssertAutorampQuote([])).toThrow(/malformed/u);
    });

    it('throws when amount_in.amount is missing', () => {
      expect(() =>
        parseAndAssertAutorampQuote({ signature: 'sig' }),
      ).toThrow(/amount_in/u);
    });

    it('throws on source chain mismatch', () => {
      expect(() =>
        parseAndAssertAutorampQuote({
          signature: 'sig',
          amount_in: { amount: '1.0', chain: 'ethereum' },
        }),
      ).toThrow(/source chain/u);
    });

    it('throws when signature is missing', () => {
      expect(() =>
        parseAndAssertAutorampQuote({
          amount_in: { amount: '1.0' },
        }),
      ).toThrow(/signature/u);
    });

    it('throws when quote is expired', () => {
      expect(() =>
        parseAndAssertAutorampQuote(
          {
            signature: 'sig',
            valid_until: new Date(Date.now() - 1000).toISOString(),
            amount_in: { amount: '1.0' },
          },
          Date.now(),
        ),
      ).toThrow(/expired/u);
    });

    it('throws on source currency mismatch', () => {
      expect(() =>
        parseAndAssertAutorampQuote({
          signature: 'sig',
          amount_in: { amount: '1.0', currency_code: 'USDC' },
        }),
      ).toThrow(/source currency/u);
    });

    it('throws on decimals mismatch', () => {
      expect(() =>
        parseAndAssertAutorampQuote({
          signature: 'sig',
          amount_in: { amount: '1.0', decimals: 18 },
        }),
      ).toThrow(/decimals/u);
    });
  });

  describe('parseMusdAmountInRaw', () => {
    it('converts six-decimal amount_in to base units', () => {
      expect(parseMusdAmountInRaw('12.345678')).toBe('12345678');
      expect(parseMusdAmountInRaw('1')).toBe('1000000');
    });

    it('rejects excess precision', () => {
      expect(() => parseMusdAmountInRaw('1.1234567')).toThrow(/decimal/u);
    });

    it('rejects non-numeric', () => {
      expect(() => parseMusdAmountInRaw('abc')).toThrow(/decimal/u);
    });

    it('rejects zero amount', () => {
      expect(() => parseMusdAmountInRaw('0')).toThrow(/greater than zero/u);
      expect(() => parseMusdAmountInRaw('0.000000')).toThrow(
        /greater than zero/u,
      );
    });
  });

  describe('pix status + deposit helpers', () => {
    it('parses Registered Pix response', () => {
      expect(
        parsePixAddressResponse({ id: 'pix-1', status: 'Registered' }),
      ).toStrictEqual({ id: 'pix-1', status: 'Registered' });
    });

    it('rejects malformed Pix responses', () => {
      expect(() => parsePixAddressResponse(null)).toThrow(/malformed/u);
      expect(() => parsePixAddressResponse({ id: 'pix-1' })).toThrow(
        /missing id or status/u,
      );
    });

    it('throws PixDestinationNotReady on RegistrationPending', () => {
      expect(() =>
        assertPixAddressRegistered('RegistrationPending', 'pix-1'),
      ).toThrow(/RegistrationPending/u);
    });

    it('throws on RegistrationFailed', () => {
      expect(() =>
        assertPixAddressRegistered('RegistrationFailed', 'pix-1'),
      ).toThrow(/failed/u);
    });

    it('throws on unexpected Pix status', () => {
      expect(() =>
        assertPixAddressRegistered('Suspended', 'pix-1'),
      ).toThrow(/Suspended/u);
    });

    it('requires Hex deposit address', () => {
      expect(
        requireIronDepositAddress(
          '0x1111111111111111111111111111111111111111',
        ),
      ).toBe('0x1111111111111111111111111111111111111111');
      expect(() => requireIronDepositAddress(undefined)).toThrow(
        /deposit Hex/u,
      );
    });
  });

  describe('deriveSendPixIds', () => {
    it('derives stable NeoBank and withdraw ids', () => {
      expect(deriveSendPixIds('abc')).toStrictEqual({
        pixIdempotencyKey: 'abc:pix',
        autorampIdempotencyKey: 'abc:autoramp',
        withdrawRequestId: 'abc',
      });
    });
  });
});

describe('executeSendPix', () => {
  const DEPOSIT = '0x1111111111111111111111111111111111111111' as Hex;
  const BATCH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
  const future = () => new Date(Date.now() + 120_000).toISOString();

  function mockDeps(overrides: Partial<SendPixDeps> = {}): SendPixDeps & {
    registerPixAddress: jest.Mock;
    getAutorampQuote: jest.Mock;
    createAutoramp: jest.Mock;
    addAutoramp: jest.Mock;
    submitMoneyAccountVaultWithdraw: jest.Mock;
  } {
    const deps = {
      getFeatureFlagState: () => ({
        remoteFeatureFlags: {
          moneyAccount: {
            moneyAccountPixSendEnabled: true,
            moneyAccountWithdrawEnabled: true,
          },
        },
      }),
      registerPixAddress: jest.fn().mockResolvedValue({
        id: 'pix-1',
        status: 'Registered',
      }),
      getAutorampQuote: jest.fn().mockResolvedValue({
        id: 'q-1',
        signature: 'sig',
        valid_until: future(),
        amount_in: {
          amount: '12.345678',
          currency_code: 'mUSD',
          chain: 'monad',
          decimals: 6,
        },
        amount_out: { amount: '100.00' },
        source_currency_code: 'mUSD',
        source_currency_chain: 'monad',
      }),
      createAutoramp: jest.fn().mockResolvedValue({
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: DEPOSIT,
        status: 'Approved',
      }),
      addAutoramp: jest.fn().mockImplementation((input) => input),
      submitMoneyAccountVaultWithdraw: jest
        .fn()
        .mockResolvedValue({ batchId: BATCH }),
      ...overrides,
    };
    return deps as typeof deps & {
      registerPixAddress: jest.Mock;
      getAutorampQuote: jest.Mock;
      createAutoramp: jest.Mock;
      addAutoramp: jest.Mock;
      submitMoneyAccountVaultWithdraw: jest.Mock;
    };
  }

  it('runs register → quote → create → withdraw and returns result', async () => {
    const deps = mockDeps();
    const result = await executeSendPix(baseRequest(), deps);

    expect(deps.registerPixAddress).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'cust-1' }),
      { idempotencyKey: 'client-req-1:pix' },
    );
    expect(deps.getAutorampQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_account_id: 'pix-1',
        amount_out: '100.00',
      }),
    );
    expect(deps.createAutoramp).toHaveBeenCalledWith(
      { signed_quote: 'sig', customer_id: 'cust-1' },
      { idempotencyKey: 'client-req-1:autoramp' },
    );
    expect(deps.addAutoramp).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ar-1',
        walletAddress: DEPOSIT,
      }),
    );
    expect(deps.submitMoneyAccountVaultWithdraw).toHaveBeenCalledWith({
      amountInRaw: '12345678',
      moneyAccountAddress: MONEY_ACCOUNT,
      recipient: DEPOSIT,
      requestId: 'client-req-1',
    });
    const withdrawArg = deps.submitMoneyAccountVaultWithdraw.mock.calls[0][0];
    expect(withdrawArg).not.toHaveProperty('pix');
    expect(withdrawArg).not.toHaveProperty('destinationCurrencyCode');
    expect(withdrawArg).not.toHaveProperty('quoteId');

    expect(result).toMatchObject({
      pixAddressId: 'pix-1',
      autorampId: 'ar-1',
      ironDepositAddress: DEPOSIT,
      amountInRaw: '12345678',
      batchId: BATCH,
      withdrawRequestId: 'client-req-1',
      destinationCurrencyCode: 'BRL',
    });
  });

  it('does not call NeoBank when flags are off', async () => {
    const deps = mockDeps({
      getFeatureFlagState: () => ({
        remoteFeatureFlags: {
          moneyAccount: {
            moneyAccountPixSendEnabled: false,
            moneyAccountWithdrawEnabled: true,
          },
        },
      }),
    });
    await expect(executeSendPix(baseRequest(), deps)).rejects.toThrow(
      /disabled/u,
    );
    expect(deps.registerPixAddress).not.toHaveBeenCalled();
    expect(deps.submitMoneyAccountVaultWithdraw).not.toHaveBeenCalled();
  });

  it('does not quote when Pix registration failed', async () => {
    const deps = mockDeps({
      registerPixAddress: jest.fn().mockResolvedValue({
        id: 'pix-1',
        status: 'RegistrationFailed',
      }),
    });
    await expect(executeSendPix(baseRequest(), deps)).rejects.toThrow(
      /registration failed/u,
    );
    expect(deps.getAutorampQuote).not.toHaveBeenCalled();
  });

  it('does not withdraw when deposit Hex is missing', async () => {
    const deps = mockDeps({
      createAutoramp: jest.fn().mockResolvedValue({
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: undefined,
        status: 'Approved',
      }),
    });
    await expect(executeSendPix(baseRequest(), deps)).rejects.toThrow(
      /deposit Hex/u,
    );
    expect(deps.submitMoneyAccountVaultWithdraw).not.toHaveBeenCalled();
  });

  it('surfaces withdraw failures after autoramp exists', async () => {
    const deps = mockDeps({
      submitMoneyAccountVaultWithdraw: jest
        .fn()
        .mockRejectedValue(new Error('user rejected')),
    });
    await expect(executeSendPix(baseRequest(), deps)).rejects.toThrow(
      /user rejected/u,
    );
    expect(deps.addAutoramp).toHaveBeenCalled();
  });

  it('calls NeoBank steps in order before withdraw', async () => {
    const order: string[] = [];
    const deps = mockDeps({
      registerPixAddress: jest.fn().mockImplementation(async () => {
        order.push('register');
        return { id: 'pix-1', status: 'Registered' };
      }),
      getAutorampQuote: jest.fn().mockImplementation(async () => {
        order.push('quote');
        return {
          id: 'q-1',
          signature: 'sig',
          valid_until: future(),
          amount_in: { amount: '1.0', currency_code: 'mUSD', chain: 'monad' },
          amount_out: { amount: '100.00' },
        };
      }),
      createAutoramp: jest.fn().mockImplementation(async () => {
        order.push('create');
        return {
          id: 'ar-1',
          customerId: 'cust-1',
          walletAddress: DEPOSIT,
          status: 'Approved',
        };
      }),
      submitMoneyAccountVaultWithdraw: jest
        .fn()
        .mockImplementation(async () => {
          order.push('withdraw');
          return { batchId: BATCH };
        }),
    });
    await executeSendPix(baseRequest(), deps);
    expect(order).toStrictEqual(['register', 'quote', 'create', 'withdraw']);
  });
});
