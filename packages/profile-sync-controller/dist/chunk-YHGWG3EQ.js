"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/controllers/authentication/auth-snap-requests.ts
var snapId = "npm:@metamask/message-signing-snap";
function createSnapPublicKeyRequest() {
  return {
    snapId,
    origin: "",
    handler: "onRpcRequest",
    request: {
      method: "getPublicKey"
    }
  };
}
function createSnapSignMessageRequest(message) {
  return {
    snapId,
    origin: "",
    handler: "onRpcRequest",
    request: {
      method: "signMessage",
      params: { message }
    }
  };
}




exports.createSnapPublicKeyRequest = createSnapPublicKeyRequest; exports.createSnapSignMessageRequest = createSnapSignMessageRequest;
//# sourceMappingURL=chunk-YHGWG3EQ.js.map