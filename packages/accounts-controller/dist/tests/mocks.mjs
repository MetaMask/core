import "../chunk-ZNSHBDHA.mjs";

// src/tests/mocks.ts
import {
  BtcAccountType,
  BtcMethod,
  EthAccountType,
  EthMethod
} from "@metamask/keyring-api";
import { KeyringTypes } from "@metamask/keyring-controller";
import { v4 } from "uuid";
var createMockInternalAccount = ({
  id = v4(),
  address = "0x2990079bcdee240329a520d2444386fc119da21a",
  type = EthAccountType.Eoa,
  name = "Account 1",
  keyringType = KeyringTypes.hd,
  snap,
  importTime = Date.now(),
  lastSelected = Date.now()
} = {}) => {
  let methods;
  switch (type) {
    case EthAccountType.Eoa:
      methods = [
        EthMethod.PersonalSign,
        EthMethod.Sign,
        EthMethod.SignTransaction,
        EthMethod.SignTypedDataV1,
        EthMethod.SignTypedDataV3,
        EthMethod.SignTypedDataV4
      ];
      break;
    case EthAccountType.Erc4337:
      methods = [
        EthMethod.PatchUserOperation,
        EthMethod.PrepareUserOperation,
        EthMethod.SignUserOperation
      ];
      break;
    case BtcAccountType.P2wpkh:
      methods = [BtcMethod.SendMany];
      break;
    default:
      throw new Error(`Unknown account type: ${type}`);
  }
  return {
    id,
    address,
    options: {},
    methods,
    type,
    metadata: {
      name,
      keyring: { type: keyringType },
      importTime,
      lastSelected,
      snap
    }
  };
};
export {
  createMockInternalAccount
};
//# sourceMappingURL=mocks.mjs.map