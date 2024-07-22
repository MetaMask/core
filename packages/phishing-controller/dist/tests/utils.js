"use strict";Object.defineProperty(exports, "__esModule", {value: true});require('../chunk-Z4BLTVTB.js');

// src/tests/utils.ts
var formatHostnameToUrl = (hostname) => {
  let url = "";
  try {
    url = new URL(hostname).href;
  } catch (e) {
    url = new URL(["https://", hostname].join("")).href;
  }
  return url;
};


exports.formatHostnameToUrl = formatHostnameToUrl;
//# sourceMappingURL=utils.js.map