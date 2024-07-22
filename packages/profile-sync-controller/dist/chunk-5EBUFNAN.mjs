// src/sdk/utils/messaging-signing-snap-requests.ts
var SNAP_ORIGIN = "npm:@metamask/message-signing-snap";
var foundSnap = (snap) => snap.id === SNAP_ORIGIN;
async function connectSnap(provider) {
  const result = await provider.request({
    method: "wallet_requestSnaps",
    params: {
      [SNAP_ORIGIN]: {}
    }
  });
  return result;
}
async function getSnaps(provider) {
  const result = await provider.request({
    method: "wallet_getSnaps"
  });
  return result;
}
async function getSnap(provider) {
  try {
    const snaps = await getSnaps(provider);
    return Object.values(snaps ?? {}).find((snap) => foundSnap(snap));
  } catch (e) {
    console.error("Failed to obtain installed snap", e);
    return void 0;
  }
}
var MESSAGE_SIGNING_SNAP = {
  async getPublicKey(provider) {
    const publicKey = await provider.request({
      method: "wallet_invokeSnap",
      params: { snapId: SNAP_ORIGIN, request: { method: "getPublicKey" } }
    });
    return publicKey;
  },
  async signMessage(provider, message) {
    const signedMessage = await provider?.request({
      method: "wallet_invokeSnap",
      params: {
        snapId: SNAP_ORIGIN,
        request: { method: "signMessage", params: { message } }
      }
    });
    return signedMessage;
  }
};

export {
  SNAP_ORIGIN,
  connectSnap,
  getSnaps,
  getSnap,
  MESSAGE_SIGNING_SNAP
};
//# sourceMappingURL=chunk-5EBUFNAN.mjs.map