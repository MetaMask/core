import { add0x } from '@metamask/utils';

import type { UserOperation, UserOperationV07 } from '../types';

// eslint-disable-next-line jsdoc/require-jsdoc
export function toUserOperationV07(
  userOperation: UserOperation,
): UserOperationV07 {
  const newUserOperation = { ...userOperation } as unknown as UserOperationV07;

  if (userOperation.initCode && userOperation.initCode !== '0x') {
    newUserOperation.factory = userOperation.initCode.slice(0, 42);
    newUserOperation.factoryData = add0x(userOperation.initCode.slice(42));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (newUserOperation as any).initCode;
  }

  return newUserOperation;
}
