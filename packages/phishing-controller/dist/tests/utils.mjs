import "../chunk-XUI43LEZ.mjs";

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
export {
  formatHostnameToUrl
};
//# sourceMappingURL=utils.mjs.map