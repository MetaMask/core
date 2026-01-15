import { Slip44Service } from './Slip44Service';

export { Slip44Service };

// Re-export static methods as standalone functions for convenience
// getEvmSlip44: For EVM networks (eip155) - uses chainId lookup, defaults to 60
export const getEvmSlip44 = Slip44Service.getEvmSlip44.bind(Slip44Service);
// getSlip44BySymbol: For non-EVM networks (Bitcoin, Solana, Tron) - uses symbol lookup
export const getSlip44BySymbol =
  Slip44Service.getSlip44BySymbol.bind(Slip44Service);
