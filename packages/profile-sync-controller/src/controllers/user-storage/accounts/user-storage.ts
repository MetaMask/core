import { USER_STORAGE_VERSION_KEY, USER_STORAGE_VERSION } from './constants';

export type UserStorageAccountsListAccount = {
  /** the id 'i' of the account */
  i: string;
  /** the address 'a' of the account */
  a: string;
  /** the name 'n' of the account */
  n: string;
  /** the last updated timestamp 'lu' of the account */
  lu?: number;
};

export type UserStorageAccountsList = UserStorageAccountsListAccount[];

export type UserStorageAccountsListPayload = {
  /**
   * The Version 'v' of the User Storage.
   * NOTE - will allow us to support upgrade/downgrades in the future
   */
  [USER_STORAGE_VERSION_KEY]: typeof USER_STORAGE_VERSION;
  /** the list 'l' of UserStorageAccountsListAccount */
  l: UserStorageAccountsList;
};

/**
 * Creates a UserStorageAccountsListPayload from various params.
 *
 * @param accountsList - the UserStorageAccountsList to format
 * @returns the formatted UserStorageAccountsListPayload
 */
export const formatUserStorageAccountsListPayload = (
  accountsList: UserStorageAccountsListAccount[],
) => {
  return {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    l: accountsList,
  };
};

/**
 * Extracts the UserStorageAccountsList from a response string.
 *
 * @param response - the response string to extract the UserStorageAccountsList from
 * @returns the extracted UserStorageAccountsList
 */
export const extactUserStorageAccountsListFromResponse = (
  response: string | null,
) => {
  if (!response) {
    return null;
  }
  const userStorageContents = JSON.parse(
    response,
  ) as UserStorageAccountsListPayload;
  return userStorageContents.l;
};
