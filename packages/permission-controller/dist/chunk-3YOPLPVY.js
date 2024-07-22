"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkFYADAA2Gjs = require('./chunk-FYADAA2G.js');

// src/Caveat.ts
var _utils = require('@metamask/utils');
function isRestrictedMethodCaveatSpecification(specification) {
  return _utils.hasProperty.call(void 0, specification, "decorator");
}
function decorateWithCaveats(methodImplementation, permission, caveatSpecifications) {
  const { caveats } = permission;
  if (!caveats) {
    return methodImplementation;
  }
  let decorated = async (args) => methodImplementation(args);
  for (const caveat of caveats) {
    const specification = caveatSpecifications[caveat.type];
    if (!specification) {
      throw new (0, _chunkFYADAA2Gjs.UnrecognizedCaveatTypeError)(caveat.type);
    }
    if (!isRestrictedMethodCaveatSpecification(specification)) {
      throw new (0, _chunkFYADAA2Gjs.CaveatSpecificationMismatchError)(
        specification,
        "RestrictedMethod" /* RestrictedMethod */
      );
    }
    decorated = specification.decorator(decorated, caveat);
  }
  return decorated;
}




exports.isRestrictedMethodCaveatSpecification = isRestrictedMethodCaveatSpecification; exports.decorateWithCaveats = decorateWithCaveats;
//# sourceMappingURL=chunk-3YOPLPVY.js.map