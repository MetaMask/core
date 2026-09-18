const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const MAX_DAYS = 30;

export const shouldAutoExpire = (oldDate: Date): boolean => {
  const differenceInTime = Date.now() - oldDate.getTime();
  const differenceInDays = differenceInTime / ONE_DAY_MS;
  return differenceInDays >= MAX_DAYS;
};
