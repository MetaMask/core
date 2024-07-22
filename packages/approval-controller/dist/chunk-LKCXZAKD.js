"use strict";Object.defineProperty(exports, "__esModule", {value: true});var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/errors.ts
var ApprovalRequestNotFoundError = class extends Error {
  constructor(id) {
    super(`Approval request with id '${id}' not found.`);
  }
};
var ApprovalRequestNoResultSupportError = class extends Error {
  constructor(id) {
    super(
      `Approval acceptance requested result but request with id '${id}' does not support it.`
    );
  }
};
var NoApprovalFlowsError = class extends Error {
  constructor() {
    super(`No approval flows found.`);
  }
};
var EndInvalidFlowError = class extends Error {
  constructor(id, flowIds) {
    super(
      `Attempted to end flow with id '${id}' which does not match current flow with id '${flowIds.slice(-1)[0]}'. All Flows: ${flowIds.join(", ")}`
    );
  }
};
var MissingApprovalFlowError = class extends Error {
  constructor(id) {
    super(`No approval flows found with id '${id}'.`);
  }
};











exports.__privateGet = __privateGet; exports.__privateAdd = __privateAdd; exports.__privateSet = __privateSet; exports.__privateMethod = __privateMethod; exports.ApprovalRequestNotFoundError = ApprovalRequestNotFoundError; exports.ApprovalRequestNoResultSupportError = ApprovalRequestNoResultSupportError; exports.NoApprovalFlowsError = NoApprovalFlowsError; exports.EndInvalidFlowError = EndInvalidFlowError; exports.MissingApprovalFlowError = MissingApprovalFlowError;
//# sourceMappingURL=chunk-LKCXZAKD.js.map