"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkG4NU4KP7js = require('./chunk-G4NU4KP7.js');


var _chunkVD2IGTS3js = require('./chunk-VD2IGTS3.js');



var _chunkBOET676Pjs = require('./chunk-BOET676P.js');



var _chunkMBTBE4P5js = require('./chunk-MBTBE4P5.js');





var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/sdk/authentication.ts
var _type, _env, _sdk, _assertSIWE, assertSIWE_fn;
var JwtBearerAuth = class {
  constructor(...args) {
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _assertSIWE);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _type, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _env, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _sdk, void 0);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _type, args[0].type);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _env, args[0].env);
    if (args[0].type === "SRP" /* SRP */) {
      _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _sdk, new (0, _chunkVD2IGTS3js.SRPJwtBearerAuth)(args[0], args[1]));
      return;
    }
    if (args[0].type === "SiWE" /* SiWE */) {
      _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _sdk, new (0, _chunkG4NU4KP7js.SIWEJwtBearerAuth)(args[0], args[1]));
      return;
    }
    throw new (0, _chunkMBTBE4P5js.UnsupportedAuthTypeError)("unsupported auth type");
  }
  async getAccessToken() {
    return await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _sdk).getAccessToken();
  }
  async getUserProfile() {
    return await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _sdk).getUserProfile();
  }
  async getIdentifier() {
    return await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _sdk).getIdentifier();
  }
  async signMessage(message) {
    return await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _sdk).signMessage(message);
  }
  async pairIdentifiers(pairing) {
    const profile = await this.getUserProfile();
    const n = await _chunkBOET676Pjs.getNonce.call(void 0, profile.profileId, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _env));
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
          throw new (0, _chunkMBTBE4P5js.PairError)(
            `failed to sign pairing message: ${errorMessage}`
          );
        }
      })
    );
    const accessToken = await this.getAccessToken();
    await _chunkBOET676Pjs.pairIdentifiers.call(void 0, n.nonce, logins, accessToken, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _env));
  }
  prepare(signer) {
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertSIWE, assertSIWE_fn).call(this, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _type), _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _sdk));
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _sdk).prepare(signer);
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
  throw new (0, _chunkMBTBE4P5js.UnsupportedAuthTypeError)(
    "This method is only available via SIWE auth type"
  );
};



exports.JwtBearerAuth = JwtBearerAuth;
//# sourceMappingURL=chunk-KUTU3NNS.js.map