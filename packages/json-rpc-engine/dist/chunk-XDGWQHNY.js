"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/getUniqueId.ts
var MAX = 4294967295;
var idCounter = Math.floor(Math.random() * MAX);
function getUniqueId() {
  idCounter = (idCounter + 1) % MAX;
  return idCounter;
}



exports.getUniqueId = getUniqueId;
//# sourceMappingURL=chunk-XDGWQHNY.js.map