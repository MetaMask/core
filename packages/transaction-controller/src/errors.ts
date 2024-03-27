import type { Hex } from '@metamask/utils';

import { SimulationErrorCode } from './types';

export class SimulationError extends Error {
  code?: string | number;

  constructor(message?: string, code?: string | number) {
    super(message ?? 'Simulation failed');

    this.code = code;
  }
}

export class SimulationChainNotSupportedError extends SimulationError {
  constructor(chainId: Hex) {
    super(
      `Chain is not supported: ${chainId}`,
      SimulationErrorCode.ChainNotSupported,
    );
  }
}

export class SimulationInvalidResponseError extends SimulationError {
  constructor() {
    super(
      'Invalid response from simulation API',
      SimulationErrorCode.InvalidResponse,
    );
  }
}

export class SimulationRevertedError extends SimulationError {
  constructor() {
    super('Transaction was reverted', SimulationErrorCode.Reverted);
  }
}
