import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';

import type { CurrencyRateState } from '../CurrencyRateController';
import type { MultichainAssetsRatesControllerState } from '../MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from '../MultichainBalancesController';
import type { TokenBalancesControllerState } from '../TokenBalancesController';
import type { TokenRatesControllerState } from '../TokenRatesController';
import type { TokensControllerState } from '../TokensController';

/**
 * Normalized controller state interface for assets-controllers selectors
 * This contains the extracted controller state that selectors expect to work with
 */
export type AssetsSelectorState = {
  AccountTreeController: AccountTreeControllerState;
  AccountsController: AccountsControllerState;
  TokenBalancesController: TokenBalancesControllerState;
  TokenRatesController: TokenRatesControllerState;
  MultichainAssetsRatesController: MultichainAssetsRatesControllerState;
  MultichainBalancesController: MultichainBalancesControllerState;
  TokensController: TokensControllerState;
  CurrencyRateController: CurrencyRateState;
};

/**
 * Universal controller state extractor that works with any state structure
 * Supports mobile, extension, and flat state structures
 *
 * @param state - The actual application state (mobile, extension, or flat structure)
 * @param state.engine - Mobile state structure with engine.backgroundState
 * @param state.engine.backgroundState - Mobile controller states
 * @param state.metamask - Extension state structure with metamask namespace
 * @returns Normalized controller state that the selectors expect
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const extractControllerStates = (state: any): AssetsSelectorState => {
  // Try mobile structure first: state.engine.backgroundState.ControllerName
  if (state?.engine?.backgroundState) {
    return {
      AccountTreeController: state.engine.backgroundState.AccountTreeController,
      AccountsController: state.engine.backgroundState.AccountsController,
      TokenBalancesController:
        state.engine.backgroundState.TokenBalancesController,
      TokenRatesController: state.engine.backgroundState.TokenRatesController,
      MultichainAssetsRatesController:
        state.engine.backgroundState.MultichainAssetsRatesController,
      MultichainBalancesController:
        state.engine.backgroundState.MultichainBalancesController,
      TokensController: state.engine.backgroundState.TokensController,
      CurrencyRateController:
        state.engine.backgroundState.CurrencyRateController,
    };
  }

  // Try extension structure: state.metamask.ControllerName
  if (state.metamask) {
    return {
      AccountTreeController: state.metamask.AccountTreeController,
      AccountsController: state.metamask.AccountsController,
      TokenBalancesController: state.metamask.TokenBalancesController,
      TokenRatesController: state.metamask.TokenRatesController,
      MultichainAssetsRatesController:
        state.metamask.MultichainAssetsRatesController,
      MultichainBalancesController: state.metamask.MultichainBalancesController,
      TokensController: state.metamask.TokensController,
      CurrencyRateController: state.metamask.CurrencyRateController,
    };
  }

  // Fallback to flat structure (default assets-controllers structure)
  return state as AssetsSelectorState;
};
