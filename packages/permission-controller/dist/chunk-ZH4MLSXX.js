"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/Permission.ts
var _nanoid = require('nanoid');
function constructPermission(options) {
  const { caveats = null, invoker, target } = options;
  return {
    id: _nanoid.nanoid.call(void 0, ),
    parentCapability: target,
    invoker,
    caveats,
    date: (/* @__PURE__ */ new Date()).getTime()
  };
}
function findCaveat(permission, caveatType) {
  return permission.caveats?.find((caveat) => caveat.type === caveatType);
}
var PermissionType = /* @__PURE__ */ ((PermissionType2) => {
  PermissionType2["RestrictedMethod"] = "RestrictedMethod";
  PermissionType2["Endowment"] = "Endowment";
  return PermissionType2;
})(PermissionType || {});
function hasSpecificationType(specification, expectedType) {
  return specification.permissionType === expectedType;
}






exports.constructPermission = constructPermission; exports.findCaveat = findCaveat; exports.PermissionType = PermissionType; exports.hasSpecificationType = hasSpecificationType;
//# sourceMappingURL=chunk-ZH4MLSXX.js.map