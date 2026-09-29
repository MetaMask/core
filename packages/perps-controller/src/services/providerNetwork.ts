import { PROVIDER_CONFIG } from '../constants/perpsConfig.js';
import type { PerpsProviderType } from '../types/index.js';

/**
 * Whether a provider runs on testnet. Lighter stays on testnet while
 * `LIGHTER_TESTNET_ONLY` is set; every other provider follows the
 * controller's network.
 *
 * @param providerId - The provider.
 * @param isTestnet - The controller's network, when known.
 * @returns True on testnet, false on mainnet, and undefined when the
 * provider follows a network that is not known.
 */
export function isProviderOnTestnet<IsTestnet extends boolean | undefined>(
  providerId: PerpsProviderType,
  isTestnet: IsTestnet,
): true | IsTestnet {
  return providerId === 'lighter' && PROVIDER_CONFIG.LIGHTER_TESTNET_ONLY
    ? true
    : isTestnet;
}
