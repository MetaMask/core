// src/Permission.ts
import { nanoid } from "nanoid";
function constructPermission(options) {
  const { caveats = null, invoker, target } = options;
  return {
    id: nanoid(),
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

export {
  constructPermission,
  findCaveat,
  PermissionType,
  hasSpecificationType
};
//# sourceMappingURL=chunk-HYMS7IGB.mjs.map