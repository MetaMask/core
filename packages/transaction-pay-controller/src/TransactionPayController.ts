import { BaseController } from '@metamask/base-controller';

import type {
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
} from './types';
import { controllerName } from './types';

const stateMetadata = {
  transactionData: { persist: false, anonymous: false },
};

const getDefaultState = () => ({
  transactionData: {},
});

export class TransactionPayController extends BaseController<
  typeof controllerName,
  TransactionPayControllerState,
  TransactionPayControllerMessenger
> {
  constructor({ messenger, state }: TransactionPayControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });
  }
}
