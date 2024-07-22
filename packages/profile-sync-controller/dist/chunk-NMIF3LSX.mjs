// src/controllers/authentication/auth-snap-requests.ts
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

export {
  createSnapPublicKeyRequest,
  createSnapSignMessageRequest
};
//# sourceMappingURL=chunk-NMIF3LSX.mjs.map