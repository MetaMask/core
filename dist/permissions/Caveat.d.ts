import { Json } from '@metamask/types';
import { AsyncRestrictedMethod, RestrictedMethod, PermissionConstraint, RestrictedMethodParameters } from './Permission';
export declare type CaveatConstraint = {
    /**
     * The type of the caveat. The type is presumed to be meaningful in the
     * context of the capability it is associated with.
     *
     * In MetaMask, every permission can only have one caveat of each type.
     */
    readonly type: string;
    /**
     * Any additional data necessary to enforce the caveat.
     */
    readonly value: Json;
};
/**
 * A `ZCAP-LD`-like caveat object. A caveat is associated with a particular
 * permission, and stored in its `caveats` array. Conceptually, a caveat is
 * an arbitrary attenuation of the authority granted by its associated
 * permission. It is the responsibility of the host to interpret and apply
 * the restriction represented by a caveat.
 *
 * @template Type - The type of the caveat.
 * @template Value - The value associated with the caveat.
 */
export declare type Caveat<Type extends string, Value extends Json> = {
    /**
     * The type of the caveat. The type is presumed to be meaningful in the
     * context of the capability it is associated with.
     *
     * In MetaMask, every permission can only have one caveat of each type.
     */
    readonly type: Type;
    /**
     * Any additional data necessary to enforce the caveat.
     */
    readonly value: Value;
};
/**
 * A function for applying caveats to a restricted method request.
 *
 * @template ParentCaveat - The caveat type associated with this decorator.
 * @param decorated - The restricted method implementation to be decorated.
 * The method may have already been decorated with other caveats.
 * @param caveat - The caveat object.
 * @returns The decorated restricted method implementation.
 */
export declare type CaveatDecorator<ParentCaveat extends CaveatConstraint> = (decorated: AsyncRestrictedMethod<RestrictedMethodParameters, Json>, caveat: ParentCaveat) => AsyncRestrictedMethod<RestrictedMethodParameters, Json>;
/**
 * Extracts a caveat value type from a caveat decorator.
 *
 * @template Decorator - The {@link CaveatDecorator} to extract a caveat value
 * type from.
 */
declare type ExtractCaveatValueFromDecorator<Decorator extends CaveatDecorator<any>> = Decorator extends (decorated: any, caveat: infer ParentCaveat) => AsyncRestrictedMethod<any, any> ? ParentCaveat extends CaveatConstraint ? ParentCaveat['value'] : never : never;
/**
 * A function for validating caveats of a particular type.
 *
 * @template ParentCaveat - The caveat type associated with this validator.
 * @param caveat - The caveat object to validate.
 * @param origin - The origin associated with the parent permission.
 * @param target - The target of the parent permission.
 */
export declare type CaveatValidator<ParentCaveat extends CaveatConstraint> = (caveat: {
    type: ParentCaveat['type'];
    value: unknown;
}, origin?: string, target?: string) => void;
/**
 * The constraint for caveat specification objects. Every {@link Caveat}
 * supported by a {@link PermissionController} must have an associated
 * specification, which is the source of truth for all caveat-related types.
 * In addition, a caveat specification includes the decorator function used
 * to apply the caveat's attenuation to a restricted method, and any validator
 * function specified by the consumer.
 *
 * See the README for more details.
 */
export declare type CaveatSpecificationConstraint = {
    /**
     * The string type of the caveat.
     */
    type: string;
    /**
     * The decorator function used to apply the caveat to restricted method
     * requests.
     */
    decorator: CaveatDecorator<any>;
    /**
     * The validator function used to validate caveats of the associated type
     * whenever they are instantiated. Caveat are instantiated whenever they are
     * created or mutated.
     *
     * The validator should throw an appropriate JSON-RPC error if validation fails.
     *
     * If no validator is specified, no validation of caveat values will be
     * performed. Although caveats can also be validated by permission validators,
     * validating caveat values separately is strongly recommended.
     */
    validator?: CaveatValidator<any>;
};
/**
 * Options for {@link CaveatSpecificationBuilder} functions.
 */
declare type CaveatSpecificationBuilderOptions<DecoratorHooks extends Record<string, unknown>, ValidatorHooks extends Record<string, unknown>> = {
    type?: string;
    decoratorHooks?: DecoratorHooks;
    validatorHooks?: ValidatorHooks;
};
/**
 * A function that builds caveat specifications. Modules that specify caveats
 * for external consumption should make this their primary / default export so
 * that host applications can use them to generate concrete specifications
 * tailored to their requirements.
 */
export declare type CaveatSpecificationBuilder<Options extends CaveatSpecificationBuilderOptions<any, any>, Specification extends CaveatSpecificationConstraint> = (options: Options) => Specification;
/**
 * A caveat specification export object, containing the
 * {@link CaveatSpecificationBuilder} function and "hook name" objects.
 */
export declare type CaveatSpecificationBuilderExportConstraint = {
    specificationBuilder: CaveatSpecificationBuilder<CaveatSpecificationBuilderOptions<any, any>, CaveatSpecificationConstraint>;
    decoratorHookNames?: Record<string, true>;
    validatorHookNames?: Record<string, true>;
};
/**
 * The specifications for all caveats supported by a particular
 * {@link PermissionController}.
 *
 * @template Specifications - The union of all {@link CaveatSpecificationConstraint} types.
 */
export declare type CaveatSpecificationMap<CaveatSpecification extends CaveatSpecificationConstraint> = Record<CaveatSpecification['type'], CaveatSpecification>;
/**
 * Extracts the union of all caveat types specified by the given
 * {@link CaveatSpecificationConstraint} type.
 *
 * @template CaveatSpecification - The {@link CaveatSpecificationConstraint} to extract a
 * caveat type union from.
 */
export declare type ExtractCaveats<CaveatSpecification extends CaveatSpecificationConstraint> = CaveatSpecification extends any ? Caveat<CaveatSpecification['type'], ExtractCaveatValueFromDecorator<CaveatSpecification['decorator']>> : never;
/**
 * Extracts the type of a specific {@link Caveat} from a union of caveat
 * specifications.
 *
 * @template CaveatSpecifications - The union of all caveat specifications.
 * @template CaveatType - The type of the caveat to extract.
 */
export declare type ExtractCaveat<CaveatSpecifications extends CaveatSpecificationConstraint, CaveatType extends string> = Extract<ExtractCaveats<CaveatSpecifications>, {
    type: CaveatType;
}>;
/**
 * Extracts the value type of a specific {@link Caveat} from a union of caveat
 * specifications.
 *
 * @template CaveatSpecifications - The union of all caveat specifications.
 * @template CaveatType - The type of the caveat whose value to extract.
 */
export declare type ExtractCaveatValue<CaveatSpecifications extends CaveatSpecificationConstraint, CaveatType extends string> = ExtractCaveat<CaveatSpecifications, CaveatType>['value'];
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
export declare function decorateWithCaveats<CaveatSpecifications extends CaveatSpecificationConstraint>(methodImplementation: RestrictedMethod<RestrictedMethodParameters, Json>, permission: Readonly<PermissionConstraint>, // bound to the requesting origin
caveatSpecifications: CaveatSpecificationMap<CaveatSpecifications>): RestrictedMethod<RestrictedMethodParameters, Json>;
export {};
