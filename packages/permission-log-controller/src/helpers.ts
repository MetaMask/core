// helper functions

/**
 * Get a map from account addresses to the given time.
 *
 * @param accounts - An array of addresses.
 * @param time - A time, e.g. Date.now().
 * @returns A string:number map of addresses to time.
 */
export function getAccountToTimeMap(
  accounts: string[],
  time: number,
): Record<string, number> {
  return accounts.reduce(
    (acc, account) => ({
      ...acc,
      [account]: time,
    }),
    {},
  );
}
