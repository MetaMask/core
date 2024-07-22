import {
  CaveatSpecificationMismatchError,
  UnrecognizedCaveatTypeError
} from "./chunk-G4BWJ7EA.mjs";

// src/Caveat.ts
import { hasProperty } from "@metamask/utils";
function isRestrictedMethodCaveatSpecification(specification) {
  return hasProperty(specification, "decorator");
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
      throw new UnrecognizedCaveatTypeError(caveat.type);
    }
    if (!isRestrictedMethodCaveatSpecification(specification)) {
      throw new CaveatSpecificationMismatchError(
        specification,
        "RestrictedMethod" /* RestrictedMethod */
      );
    }
    decorated = specification.decorator(decorated, caveat);
  }
  return decorated;
}

export {
  isRestrictedMethodCaveatSpecification,
  decorateWithCaveats
};
//# sourceMappingURL=chunk-3WWJKO7P.mjs.map