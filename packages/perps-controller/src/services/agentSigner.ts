import type {
  HyperLiquidCredentials,
  PerpsAgentAccount,
  PerpsAgentSigner,
} from '../types/index.js';
import { hasErrorInCauseChain } from './causeChain.js';

/**
 * A HyperLiquid agent could not be resolved or could not sign. Like a locked
 * keyring, it is retryable: the next L1 action tries again.
 */
export class AgentSignerUnavailableError extends Error {
  constructor(cause: unknown) {
    super('HyperLiquid agent signer unavailable', { cause });
    this.name = 'AgentSignerUnavailableError';
  }
}

/**
 * Whether an error, or any error in its cause chain, is an
 * AgentSignerUnavailableError. The SDK wraps wallet failures in its own error.
 *
 * @param error - The caught error.
 * @returns True when the agent signer was unavailable.
 */
export function isAgentSignerUnavailableError(error: unknown): boolean {
  return hasErrorInCauseChain(
    error,
    (current) => current instanceof AgentSignerUnavailableError,
  );
}

/**
 * Explicit HyperLiquid agent bindings per network and main account, in front
 * of the host's `getAgentSigner`: a binding wins, and null pins the main
 * account. The owner keeps them across provider instances and drops the
 * agents a provider already resolved whenever they change.
 */
export class AgentBindings {
  readonly #bindings = new Map<string, PerpsAgentSigner | null>();

  readonly #getAgentSigner: HyperLiquidCredentials['getAgentSigner'];

  constructor(getAgentSigner: HyperLiquidCredentials['getAgentSigner']) {
    this.#getAgentSigner = getAgentSigner;
  }

  /**
   * Bind an agent to a main account and network, or pin that account to the
   * main wallet with null.
   *
   * @param account - The main account and network.
   * @param agentSigner - The agent, or null to pin the main account.
   */
  set(account: PerpsAgentAccount, agentSigner: PerpsAgentSigner | null): void {
    this.#bindings.set(this.#getKey(account), agentSigner);
  }

  /** Forget every binding, so `getAgentSigner` answers again. */
  clear(): void {
    this.#bindings.clear();
  }

  /**
   * Resolve the agent for an L1 action: the binding when there is one, else
   * the host's `getAgentSigner` answer.
   *
   * @param account - The main account and network of the L1 action.
   * @returns The agent, or null to sign with the main account.
   */
  readonly resolve = async (
    account: PerpsAgentAccount,
  ): Promise<PerpsAgentSigner | null> => {
    const key = this.#getKey(account);
    if (this.#bindings.has(key)) {
      return this.#bindings.get(key) ?? null;
    }
    return this.#getAgentSigner ? await this.#getAgentSigner(account) : null;
  };

  #getKey(account: PerpsAgentAccount): string {
    return `${account.isTestnet ? 'testnet' : 'mainnet'}:${account.mainAddress.toLowerCase()}`;
  }
}
