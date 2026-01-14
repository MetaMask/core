import { Slip44Service } from './Slip44Service';

export { Slip44Service };
export type { Slip44Entry } from './Slip44Service';

// Re-export static methods as standalone functions for convenience
export const getSlip44BySymbol =
  Slip44Service.getSlip44BySymbol.bind(Slip44Service);
export const getSlip44ByChainId =
  Slip44Service.getSlip44ByChainId.bind(Slip44Service);
