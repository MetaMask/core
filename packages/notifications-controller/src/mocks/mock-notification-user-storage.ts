import { USER_STORAGE_VERSION_KEY } from '../constants/constants';
import { TriggerType } from '../constants/notification-schema';
import type { UserStorage } from '../types/user-storage/user-storage';
import { initializeUserStorage } from '../utils/utils';

export const MOCK_USER_STORAGE_ACCOUNT =
  '0x0000000000000000000000000000000000000000';
export const MOCK_USER_STORAGE_CHAIN = '1';

/**
 *
 * @param override
 */
export function createMockUserStorage(
  override?: Partial<UserStorage>,
): UserStorage {
  return {
    [USER_STORAGE_VERSION_KEY]: '1',
    [MOCK_USER_STORAGE_ACCOUNT]: {
      [MOCK_USER_STORAGE_CHAIN]: {
        '111-111-111-111': {
          k: TriggerType.Erc20Received,
          e: true,
        },
        '222-222-222-222': {
          k: TriggerType.Erc20Sent,
          e: true,
        },
      },
    },
    ...override,
  };
}

/**
 *
 * @param triggers
 */
export function createMockUserStorageWithTriggers(
  triggers: string[] | { id: string; e: boolean; k?: TriggerType }[],
): UserStorage {
  const userStorage: UserStorage = {
    [USER_STORAGE_VERSION_KEY]: '1',
    [MOCK_USER_STORAGE_ACCOUNT]: {
      [MOCK_USER_STORAGE_CHAIN]: {},
    },
  };

  // insert triggerIds
  triggers.forEach((t) => {
    let tId: string;
    let e: boolean;
    let k: TriggerType;
    if (typeof t === 'string') {
      tId = t;
      e = true;
      k = TriggerType.Erc1155Received;
    } else {
      tId = t.id;
      e = t.e;
      k = t.k ?? TriggerType.Erc20Received;
    }

    userStorage[MOCK_USER_STORAGE_ACCOUNT][MOCK_USER_STORAGE_CHAIN][tId] = {
      k,
      e,
    };
  });

  return userStorage;
}

/**
 *
 * @param props
 * @param props.triggersEnabled
 * @param props.address
 */
export function createMockFullUserStorage(
  props: { triggersEnabled?: boolean; address?: string } = {},
): UserStorage {
  return initializeUserStorage(
    [{ address: props.address ?? MOCK_USER_STORAGE_ACCOUNT }],
    props.triggersEnabled ?? true,
  );
}
