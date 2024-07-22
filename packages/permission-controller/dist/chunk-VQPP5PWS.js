"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/utils.ts
var MethodNames = /* @__PURE__ */ ((MethodNames2) => {
  MethodNames2["RequestPermissions"] = "wallet_requestPermissions";
  MethodNames2["GetPermissions"] = "wallet_getPermissions";
  MethodNames2["RevokePermissions"] = "wallet_revokePermissions";
  return MethodNames2;
})(MethodNames || {});
function collectUniqueAndPairedCaveats(leftPermission, rightPermission) {
  const leftCaveats = leftPermission?.caveats?.slice() ?? [];
  const rightCaveats = rightPermission.caveats?.slice() ?? [];
  const leftUniqueCaveats = [];
  const caveatPairs = [];
  leftCaveats.forEach((leftCaveat) => {
    const rightCaveatIndex = rightCaveats.findIndex(
      (rightCaveat) => rightCaveat.type === leftCaveat.type
    );
    if (rightCaveatIndex === -1) {
      leftUniqueCaveats.push(leftCaveat);
    } else {
      caveatPairs.push([leftCaveat, rightCaveats[rightCaveatIndex]]);
      rightCaveats.splice(rightCaveatIndex, 1);
    }
  });
  return {
    caveatPairs,
    leftUniqueCaveats,
    rightUniqueCaveats: [...rightCaveats]
  };
}




exports.MethodNames = MethodNames; exports.collectUniqueAndPairedCaveats = collectUniqueAndPairedCaveats;
//# sourceMappingURL=chunk-VQPP5PWS.js.map