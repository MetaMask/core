// src/utils.ts
import { toBuffer } from "@ethereumjs/util";
import { isCustodyKeyring, KeyringTypes } from "@metamask/keyring-controller";
import { sha256 } from "ethereum-cryptography/sha256";
import { v4 as uuid } from "uuid";
function keyringTypeToName(keyringType) {
  if (isCustodyKeyring(keyringType)) {
    return "Custody";
  }
  switch (keyringType) {
    case KeyringTypes.simple: {
      return "Account";
    }
    case KeyringTypes.hd: {
      return "Account";
    }
    case KeyringTypes.trezor: {
      return "Trezor";
    }
    case KeyringTypes.ledger: {
      return "Ledger";
    }
    case KeyringTypes.lattice: {
      return "Lattice";
    }
    case KeyringTypes.qr: {
      return "QR";
    }
    case KeyringTypes.snap: {
      return "Snap Account";
    }
    default: {
      throw new Error(`Unknown keyring ${keyringType}`);
    }
  }
}
function getUUIDOptionsFromAddressOfNormalAccount(address) {
  const v4options = {
    random: sha256(toBuffer(address)).slice(0, 16)
  };
  return v4options;
}
function getUUIDFromAddressOfNormalAccount(address) {
  return uuid(getUUIDOptionsFromAddressOfNormalAccount(address));
}
function isNormalKeyringType(keyringType) {
  return keyringType !== KeyringTypes.snap;
}

export {
  keyringTypeToName,
  getUUIDOptionsFromAddressOfNormalAccount,
  getUUIDFromAddressOfNormalAccount,
  isNormalKeyringType
};
//# sourceMappingURL=chunk-Y2QVUNIA.mjs.map