import { extractControllerStates } from './stateAdapter';

describe('stateAdapter', () => {
  describe('extractControllerStates', () => {
    it('extracts controller states from mobile state structure', () => {
      const mobileState = {
        engine: {
          backgroundState: {
            AccountTreeController: {
              accountTree: { selectedAccountGroup: 'test' },
            },
            AccountsController: { internalAccounts: { accounts: {} } },
            TokenBalancesController: { balances: {} },
            TokenRatesController: { rates: {} },
            MultichainAssetsRatesController: { rates: {} },
            MultichainBalancesController: { balances: {} },
            TokensController: { allTokens: {} },
            CurrencyRateController: { currentCurrency: 'USD' },
          },
        },
      };

      const result = extractControllerStates(mobileState);

      expect(result.AccountTreeController).toStrictEqual({
        accountTree: { selectedAccountGroup: 'test' },
      });
      expect(result.AccountsController).toStrictEqual({
        internalAccounts: { accounts: {} },
      });
      expect(result.TokenBalancesController).toStrictEqual({ balances: {} });
      expect(result.TokenRatesController).toStrictEqual({ rates: {} });
      expect(result.MultichainAssetsRatesController).toStrictEqual({
        rates: {},
      });
      expect(result.MultichainBalancesController).toStrictEqual({
        balances: {},
      });
      expect(result.TokensController).toStrictEqual({ allTokens: {} });
      expect(result.CurrencyRateController).toStrictEqual({
        currentCurrency: 'USD',
      });
    });

    it('extracts controller states from extension state structure', () => {
      const extensionState = {
        metamask: {
          AccountTreeController: {
            accountTree: { selectedAccountGroup: 'test' },
          },
          AccountsController: { internalAccounts: { accounts: {} } },
          TokenBalancesController: { balances: {} },
          TokenRatesController: { rates: {} },
          MultichainAssetsRatesController: { rates: {} },
          MultichainBalancesController: { balances: {} },
          TokensController: { allTokens: {} },
          CurrencyRateController: { currentCurrency: 'USD' },
        },
      };

      const result = extractControllerStates(extensionState);

      expect(result.AccountTreeController).toStrictEqual({
        accountTree: { selectedAccountGroup: 'test' },
      });
      expect(result.AccountsController).toStrictEqual({
        internalAccounts: { accounts: {} },
      });
      expect(result.TokenBalancesController).toStrictEqual({ balances: {} });
      expect(result.TokenRatesController).toStrictEqual({ rates: {} });
      expect(result.MultichainAssetsRatesController).toStrictEqual({
        rates: {},
      });
      expect(result.MultichainBalancesController).toStrictEqual({
        balances: {},
      });
      expect(result.TokensController).toStrictEqual({ allTokens: {} });
      expect(result.CurrencyRateController).toStrictEqual({
        currentCurrency: 'USD',
      });
    });

    it('falls back to flat state structure when neither mobile nor extension structure is found', () => {
      const flatState = {
        AccountTreeController: {
          accountTree: { selectedAccountGroup: 'test' },
        },
        AccountsController: { internalAccounts: { accounts: {} } },
        TokenBalancesController: { balances: {} },
        TokenRatesController: { rates: {} },
        MultichainAssetsRatesController: { rates: {} },
        MultichainBalancesController: { balances: {} },
        TokensController: { allTokens: {} },
        CurrencyRateController: { currentCurrency: 'USD' },
      };

      const result = extractControllerStates(flatState);

      expect(result.AccountTreeController).toStrictEqual({
        accountTree: { selectedAccountGroup: 'test' },
      });
      expect(result.AccountsController).toStrictEqual({
        internalAccounts: { accounts: {} },
      });
      expect(result.TokenBalancesController).toStrictEqual({ balances: {} });
      expect(result.TokenRatesController).toStrictEqual({ rates: {} });
      expect(result.MultichainAssetsRatesController).toStrictEqual({
        rates: {},
      });
      expect(result.MultichainBalancesController).toStrictEqual({
        balances: {},
      });
      expect(result.TokensController).toStrictEqual({ allTokens: {} });
      expect(result.CurrencyRateController).toStrictEqual({
        currentCurrency: 'USD',
      });
    });
  });
});
