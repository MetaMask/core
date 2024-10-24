import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';

import { multicallOrFallback } from './multicall';
import type { TokensControllerStateChangeEvent } from './TokensController';

const DEFAULT_INTERVAL = 180000;

const controllerName = 'TokenBalancesController';

const metadata = {
  tokenBalances: { persist: true, anonymous: false },
};

/**
 * Token balances controller options
 * @property interval - Polling interval used to fetch new token balances.
 * @property messenger - A controller messenger.
 * @property state - Initial state for the controller.
 */
type TokenBalancesControllerOptions = {
  interval?: number;
  messenger: TokenBalancesControllerMessenger;
  state?: Partial<TokenBalancesControllerState>;
};

/**
 * A mapping from account address to chain id to token address to balance.
 */
type TokenBalances = Record<Hex, Record<Hex, Record<Hex, Hex>>>;

/**
 * Token balances controller state
 * @property tokenBalances - A mapping from account address to chain id to token address to balance.
 */
export type TokenBalancesControllerState = {
  tokenBalances: TokenBalances;
};

export type TokenBalancesControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenBalancesControllerState
>;

export type TokenBalancesControllerActions =
  TokenBalancesControllerGetStateAction;

export type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

export type TokenBalancesControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    TokenBalancesControllerState
  >;

export type TokenBalancesControllerEvents =
  TokenBalancesControllerStateChangeEvent;

export type AllowedEvents = TokensControllerStateChangeEvent;

export type TokenBalancesControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenBalancesControllerActions | AllowedActions,
  TokenBalancesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Get the default TokenBalancesController state.
 *
 * @returns The default TokenBalancesController state.
 */
export function getDefaultTokenBalancesState(): TokenBalancesControllerState {
  return {
    tokenBalances: {},
  };
}

/** The input to start polling for the {@link TokenBalancesController} */
export type TokenBalancesPollingInput = {
  networkClientId: NetworkClientId;
  tokensPerAccount: Record<Hex, Hex[]>;
};

/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the TokensController
 */
export class TokenBalancesController extends StaticIntervalPollingController<TokenBalancesPollingInput>()<
  typeof controllerName,
  TokenBalancesControllerState,
  TokenBalancesControllerMessenger
> {
  /**
   * Construct a Token Balances Controller.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new token balances.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller restricted messenger.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    messenger,
    state = {},
  }: TokenBalancesControllerOptions) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultTokenBalancesState(),
        ...state,
      },
    });

    this.setIntervalLength(interval);
  }

  /**
   * Polls for erc20 token balances.
   * @param input - The input for the poll.
   * @param input.networkClientId - The network client id to poll with.
   * @param input.tokensPerAccount - A mapping from account addresses to token addresses to poll.
   */
  async _executePoll({
    networkClientId,
    tokensPerAccount,
  }: TokenBalancesPollingInput): Promise<void> {
    const networkClient = this.messagingSystem.call(
      `NetworkController:getNetworkClientById`,
      networkClientId,
    );

    const { chainId } = networkClient.configuration;
    const provider = new Web3Provider(networkClient.provider);

    const accountTokenPairs = Object.entries(tokensPerAccount).flatMap(
      ([accountAddress, tokenAddresses]) =>
        tokenAddresses.map((tokenAddress) => ({
          accountAddress: accountAddress as Hex,
          tokenAddress,
        })),
    );

    const calls = accountTokenPairs.map(({ accountAddress, tokenAddress }) => ({
      contract: new Contract(tokenAddress, abiERC20, provider),
      functionSignature: 'balanceOf(address)',
      arguments: [accountAddress],
    }));

    const results = await multicallOrFallback(calls, chainId, provider);

    this.update((state) => {
      for (let i = 0; i < results.length; i++) {
        const { success, value } = results[i];

        if (success) {
          const { accountAddress, tokenAddress } = accountTokenPairs[i];
          ((state.tokenBalances[accountAddress] ??= {})[chainId] ??= {})[
            tokenAddress
          ] = toHex(value as BN);
        }
      }
    });
  }
}

export default TokenBalancesController;
