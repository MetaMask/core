// src/sdk/env.ts
var Env = /* @__PURE__ */ ((Env2) => {
  Env2["DEV"] = "dev";
  Env2["UAT"] = "uat";
  Env2["PRD"] = "prd";
  return Env2;
})(Env || {});
var Platform = /* @__PURE__ */ ((Platform2) => {
  Platform2["MOBILE"] = "mobile";
  Platform2["EXTENSION"] = "extension";
  Platform2["PORTFOLIO"] = "portfolio";
  Platform2["INFURA"] = "infura";
  return Platform2;
})(Platform || {});
var ENV_URLS = {
  dev: {
    authApiUrl: "https://authentication.dev-api.cx.metamask.io",
    oidcApiUrl: "https://oidc.dev-api.cx.metamask.io",
    userStorageApiUrl: "https://user-storage.dev-api.cx.metamask.io"
  },
  uat: {
    authApiUrl: "https://authentication.uat-api.cx.metamask.io",
    oidcApiUrl: "https://oidc.uat-api.cx.metamask.io",
    userStorageApiUrl: "https://user-storage.uat-api.cx.metamask.io"
  },
  prd: {
    authApiUrl: "https://authentication.api.cx.metamask.io",
    oidcApiUrl: "https://oidc.api.cx.metamask.io",
    userStorageApiUrl: "https://user-storage.api.cx.metamask.io"
  }
};
function getEnvUrls(env) {
  if (!ENV_URLS[env]) {
    throw new Error("invalid environment configuration");
  }
  return ENV_URLS[env];
}
function getOidcClientId(env, platform) {
  const clientIds = {
    ["dev" /* DEV */]: {
      ["portfolio" /* PORTFOLIO */]: "c7ca94a0-5d52-4635-9502-1a50a9c410cc",
      ["mobile" /* MOBILE */]: "e83c7cc9-267d-4fb4-8fec-f0e3bbe5ae8e",
      ["extension" /* EXTENSION */]: "f1a963d7-50dc-4cb5-8d81-f1f3654f0df3",
      ["infura" /* INFURA */]: "bd887006-0d55-481a-a395-5ff9a0dc52c9"
    },
    ["uat" /* UAT */]: {
      ["portfolio" /* PORTFOLIO */]: "8f2dd4ac-db07-4819-9ba5-1ee0ec1b56d1",
      ["mobile" /* MOBILE */]: "c3cfdcd2-51d6-4fae-ad2c-ff238c8fef53",
      ["extension" /* EXTENSION */]: "a9de167c-c9a6-43d8-af39-d301fd44c485",
      ["infura" /* INFURA */]: "01929890-7002-4c97-9913-8f6c09a6d674"
    },
    ["prd" /* PRD */]: {
      ["portfolio" /* PORTFOLIO */]: "35e1cd62-49c5-4be8-8b6e-a5212f2d2cfb",
      ["mobile" /* MOBILE */]: "75fa62a3-9ca0-4b91-9fe5-76bec86b0257",
      ["extension" /* EXTENSION */]: "1132f10a-b4e5-4390-a5f2-d9c6022db564",
      ["infura" /* INFURA */]: ""
      // unset
    }
  };
  if (!clientIds[env]) {
    throw new Error(`invalid env ${env}: cannot determine oidc client id`);
  }
  if (!clientIds[env][platform]) {
    throw new Error(
      `invalid env ${env} and platform ${platform} combination: cannot determine oidc client id`
    );
  }
  return clientIds[env][platform];
}

export {
  Env,
  Platform,
  getEnvUrls,
  getOidcClientId
};
//# sourceMappingURL=chunk-FQ5SDMRE.mjs.map