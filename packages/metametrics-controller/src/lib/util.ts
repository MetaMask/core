/**
 * Checks if an alarm with the given name exists in the alarm list.
 *
 * @param alarmList - The list of alarms to check.
 * @param alarmName - The name of the alarm to search for.
 * @returns Returns true if the alarm exists, false otherwise.
 */
export function checkAlarmExists(
  alarmList: { name: string }[],
  alarmName: string,
) {
  return alarmList.some((alarm) => alarm.name === alarmName);
}

// Taken from https://stackoverflow.com/a/1349426/3696652
const characters =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const generateRandomId = () => {
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < 20; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export const isValidDate = (d: Date | number) => {
  return d instanceof Date;
};
