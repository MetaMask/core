// src/NotificationServicesPushController/utils/get-notification-data.ts
import { BigNumber } from "bignumber.js";
var defaultFormatOptions = {
  decimalPlaces: 4
};
function calcTokenAmount(value, decimals) {
  const multiplier = Math.pow(10, Number(decimals || 0));
  return new BigNumber(String(value)).div(multiplier);
}
var getLeadingZeroCount = (num) => {
  const numToString = new BigNumber(num, 10).toString(10);
  const fractionalPart = numToString.split(".")[1] ?? "";
  return fractionalPart.match(/^0*/u)?.[0]?.length || 0;
};
var formatAmount = (numericAmount, opts) => {
  const options = { ...defaultFormatOptions, ...opts };
  const leadingZeros = getLeadingZeroCount(numericAmount);
  const isDecimal = numericAmount.toString().includes(".") || leadingZeros > 0;
  const isLargeNumber = numericAmount > 999;
  const handleShouldEllipse = (decimalPlaces) => Boolean(options?.shouldEllipse) && leadingZeros >= decimalPlaces;
  if (isLargeNumber) {
    return Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2
    }).format(numericAmount);
  }
  if (isDecimal) {
    const ellipse = handleShouldEllipse(options.decimalPlaces);
    const formattedValue = Intl.NumberFormat("en-US", {
      minimumFractionDigits: ellipse ? options.decimalPlaces : void 0,
      maximumFractionDigits: options.decimalPlaces
    }).format(numericAmount);
    return ellipse ? `${formattedValue}...` : formattedValue;
  }
  return numericAmount.toString();
};
var getAmount = (amount, decimals, options) => {
  if (!amount || !decimals) {
    return "";
  }
  const numericAmount = calcTokenAmount(
    amount,
    parseFloat(decimals)
  ).toNumber();
  return formatAmount(numericAmount, options);
};

export {
  calcTokenAmount,
  getLeadingZeroCount,
  formatAmount,
  getAmount
};
//# sourceMappingURL=chunk-ODI2BTKS.mjs.map