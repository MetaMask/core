import {
  SIWEJwtBearerAuth
} from "./chunk-BDO3VJEU.mjs";
import {
  SRPJwtBearerAuth
} from "./chunk-DRD22DR5.mjs";
import {
  getNonce,
  pairIdentifiers
} from "./chunk-WB6MUIML.mjs";
import {
  PairError,
  UnsupportedAuthTypeError
} from "./chunk-TFFQFIJV.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-U5UIDVOO.mjs";

// src/sdk/authentication.ts
var _type, _env, _sdk, _assertSIWE, assertSIWE_fn;
var JwtBearerAuth = class {
  constructor(...args) {
    __privateAdd(this, _assertSIWE);
    __privateAdd(this, _type, void 0);
    __privateAdd(this, _env, void 0);
    __privateAdd(this, _sdk, void 0);
    __privateSet(this, _type, args[0].type);
    __privateSet(this, _env, args[0].env);
    if (args[0].type === "SRP" /* SRP */) {
      __privateSet(this, _sdk, new SRPJwtBearerAuth(args[0], args[1]));
      return;
    }
    if (args[0].type === "SiWE" /* SiWE */) {
      __privateSet(this, _sdk, new SIWEJwtBearerAuth(args[0], args[1]));
      return;
    }
    throw new UnsupportedAuthTypeError("unsupported auth type");
  }
  async getAccessToken() {
    return await __privateGet(this, _sdk).getAccessToken();
  }
  async getUserProfile() {
    return await __privateGet(this, _sdk).getUserProfile();
  }
  async getIdentifier() {
    return await __privateGet(this, _sdk).getIdentifier();
  }
  async signMessage(message) {
    return await __privateGet(this, _sdk).signMessage(message);
  }
  async pairIdentifiers(pairing) {
    const profile = await this.getUserProfile();
    const n = await getNonce(profile.profileId, __privateGet(this, _env));
    const logins = await Promise.all(
      pairing.map(async (p) => {
        try {
          const raw = `metamask:${n.nonce}:${p.identifier}`;
          const sig = await p.signMessage(raw);
          return {
            signature: sig,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            raw_message: raw,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            encrypted_storage_key: p.encryptedStorageKey,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            identifier_type: p.identifierType
          };
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
          throw new PairError(
            `failed to sign pairing message: ${errorMessage}`
          );
        }
      })
    );
    const accessToken = await this.getAccessToken();
    await pairIdentifiers(n.nonce, logins, accessToken, __privateGet(this, _env));
  }
  prepare(signer) {
    __privateMethod(this, _assertSIWE, assertSIWE_fn).call(this, __privateGet(this, _type), __privateGet(this, _sdk));
    __privateGet(this, _sdk).prepare(signer);
  }
};
_type = new WeakMap();
_env = new WeakMap();
_sdk = new WeakMap();
_assertSIWE = new WeakSet();
assertSIWE_fn = function(type, sdk) {
  if (type === "SiWE" /* SiWE */) {
    return;
  }
  throw new UnsupportedAuthTypeError(
    "This method is only available via SIWE auth type"
  );
};

export {
  JwtBearerAuth
};
//# sourceMappingURL=chunk-JFVONPMM.mjs.map