"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/sdk/utils/eip-6963-metamask-provider.ts
var metamaskClientsRdns = {
  main: "io.metamask",
  flask: "io.metamask.flask",
  institutional: "io.metamask.mmi"
};
var providerCache = {};
function getMetaMaskProviderEIP6963(type = "any") {
  return new Promise((res) => {
    if (type !== "any" && metamaskClientsRdns[type] === void 0) {
      res(null);
      return;
    }
    const cachedProvider = providerCache[type];
    if (cachedProvider) {
      res(cachedProvider);
      return;
    }
    const providers = [];
    const handleProviderEvent = (event) => {
      const typedEvent = event;
      const providerDetail = typedEvent?.detail;
      if (providerDetail?.provider && providerDetail?.info?.rdns) {
        providers.push({
          rdns: providerDetail?.info?.rdns,
          provider: providerDetail?.provider
        });
      }
    };
    window.addEventListener("eip6963:announceProvider", handleProviderEvent);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handleProviderEvent
      );
      let provider;
      if (type === "any") {
        const metamaskClients = Object.values(metamaskClientsRdns);
        provider = providers.find((p) => metamaskClients.includes(p.rdns))?.provider ?? null;
      } else {
        const metamaskRdns = metamaskClientsRdns[type];
        provider = providers.find((p) => p.rdns === metamaskRdns)?.provider ?? null;
      }
      if (provider) {
        providerCache[type] = provider;
      }
      return res(provider);
    }, 100);
  });
}




exports.metamaskClientsRdns = metamaskClientsRdns; exports.getMetaMaskProviderEIP6963 = getMetaMaskProviderEIP6963;
//# sourceMappingURL=chunk-RG4II6WH.js.map