// src/getUniqueId.ts
var MAX = 4294967295;
var idCounter = Math.floor(Math.random() * MAX);
function getUniqueId() {
  idCounter = (idCounter + 1) % MAX;
  return idCounter;
}

export {
  getUniqueId
};
//# sourceMappingURL=chunk-6XXPTZV6.mjs.map