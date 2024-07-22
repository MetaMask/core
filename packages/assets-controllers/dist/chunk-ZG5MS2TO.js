"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/crypto-compare-service/crypto-compare.ts
var _controllerutils = require('@metamask/controller-utils');
var nativeSymbolOverrides = /* @__PURE__ */ new Map([["MNT", "MANTLE"]]);
var CRYPTO_COMPARE_DOMAIN = "https://min-api.cryptocompare.com";
function getPricingURL(currentCurrency, nativeCurrency, includeUSDRate) {
  nativeCurrency = nativeCurrency.toUpperCase();
  const fsym = nativeSymbolOverrides.get(nativeCurrency) ?? nativeCurrency;
  return `${CRYPTO_COMPARE_DOMAIN}/data/price?fsym=${fsym}&tsyms=${currentCurrency.toUpperCase()}${includeUSDRate && currentCurrency.toUpperCase() !== "USD" ? ",USD" : ""}`;
}
function getMultiPricingURL(fsyms, tsyms, includeUSDRate = false) {
  const updatedTsyms = includeUSDRate && !tsyms.includes("USD") ? `${tsyms},USD` : tsyms;
  const params = new URLSearchParams();
  params.append("fsyms", fsyms);
  params.append("tsyms", updatedTsyms);
  const url = new URL(`${CRYPTO_COMPARE_DOMAIN}/data/pricemulti`);
  url.search = params.toString();
  return url.toString();
}
function handleErrorResponse(json) {
  if (json.Response === "Error") {
    throw new Error(json.Message);
  }
}
async function fetchExchangeRate(currency, nativeCurrency, includeUSDRate) {
  const json = await _controllerutils.handleFetch.call(void 0, 
    getPricingURL(currency, nativeCurrency, includeUSDRate)
  );
  handleErrorResponse(json);
  const conversionRate = Number(json[currency.toUpperCase()]);
  const usdConversionRate = Number(json.USD);
  if (!Number.isFinite(conversionRate)) {
    throw new Error(
      `Invalid response for ${currency.toUpperCase()}: ${// TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      json[currency.toUpperCase()]}`
    );
  }
  if (includeUSDRate && !Number.isFinite(usdConversionRate)) {
    throw new Error(`Invalid response for usdConversionRate: ${json.USD}`);
  }
  return {
    conversionRate,
    usdConversionRate
  };
}
async function fetchMultiExchangeRate(fiatCurrency, cryptocurrencies, includeUSDRate) {
  const url = getMultiPricingURL(
    Object.values(cryptocurrencies).join(","),
    fiatCurrency,
    includeUSDRate
  );
  const response = await _controllerutils.handleFetch.call(void 0, url);
  handleErrorResponse(response);
  const rates = {};
  for (const [cryptocurrency, values] of Object.entries(response)) {
    rates[cryptocurrency.toLowerCase()] = {
      [fiatCurrency.toLowerCase()]: values[fiatCurrency.toUpperCase()],
      ...includeUSDRate && { usd: values.USD }
    };
  }
  return rates;
}




exports.fetchExchangeRate = fetchExchangeRate; exports.fetchMultiExchangeRate = fetchMultiExchangeRate;
//# sourceMappingURL=chunk-ZG5MS2TO.js.map