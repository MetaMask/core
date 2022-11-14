"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decorateWithCaveats = exports.isRestrictedMethodCaveatSpecification = void 0;
const controller_utils_1 = require("@metamask/controller-utils");
const errors_1 = require("./errors");
const Permission_1 = require("./Permission");
/**
 * Determines whether a caveat specification is a restricted method caveat specification.
 *
 * @param specification - The caveat specification.
 * @returns True if the caveat specification is a restricted method caveat specification, otherwise false.
 */
function isRestrictedMethodCaveatSpecification(specification) {
    return (0, controller_utils_1.hasProperty)(specification, 'decorator');
}
exports.isRestrictedMethodCaveatSpecification = isRestrictedMethodCaveatSpecification;
/**
 * Decorate a restricted method implementation with its caveats.
 *
 * Note that all caveat functions (i.e. the argument and return value of the
 * decorator) must be awaited.
 *
 * @param methodImplementation - The restricted method implementation
 * @param permission - The origin's potential permission
 * @param caveatSpecifications - All caveat implementations
 * @returns The decorated method implementation
 */
function decorateWithCaveats(methodImplementation, permission, // bound to the requesting origin
caveatSpecifications) {
    const { caveats } = permission;
    if (!caveats) {
        return methodImplementation;
    }
    let decorated = (args) => __awaiter(this, void 0, void 0, function* () { return methodImplementation(args); });
    for (const caveat of caveats) {
        const specification = caveatSpecifications[caveat.type];
        if (!specification) {
            throw new errors_1.UnrecognizedCaveatTypeError(caveat.type);
        }
        if (!isRestrictedMethodCaveatSpecification(specification)) {
            throw new errors_1.CaveatSpecificationMismatchError(specification, Permission_1.PermissionType.RestrictedMethod);
        }
        decorated = specification.decorator(decorated, caveat);
    }
    return decorated;
}
exports.decorateWithCaveats = decorateWithCaveats;
//# sourceMappingURL=Caveat.js.map