import type { Json } from '@metamask/utils';
import { hasProperty } from '@metamask/utils';

import {
  CaveatSpecificationMismatchError,
  UnrecognizedCaveatTypeError,
} from './errors';
import type {
  AsyncRestrictedMethod,
  RestrictedMethod,
  PermissionConstraint,
  RestrictedMethodParameters,
} from './Permission';
import { PermissionType } from './Permission';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { PermissionController } from './PermissionController';

export type CaveatConstraint = {
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
export type Caveat<Type extends string, Value extends Json> = {
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

// Next, we define types used for specifying caveats at the consumer layer,
// and a function for applying caveats to a restricted method request. This is
// Accomplished by decorating the restricted method implementation with the
// the corresponding caveat functions.

/**
 * A function for applying caveats to a restricted method request.
 *
 * @template ParentCaveat - The caveat type associated with this decorator.
 * @param decorated - The restricted method implementation to be decorated.
 * The method may have already been decorated with other caveats.
 * @param caveat - The caveat object.
 * @returns The decorated restricted method implementation.
 */
export type CaveatDecorator<ParentCaveat extends CaveatConstraint> = (
  decorated: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
  caveat: ParentCaveat,
) => AsyncRestrictedMethod<RestrictedMethodParameters, Json>;

/**
 * Extracts a caveat value type from a caveat decorator.
 *
 * @template Decorator - The {@link CaveatDecorator} to extract a caveat value
 * type from.
 */
type ExtractCaveatValueFromDecorator<
  Decorator extends CaveatDecorator<CaveatConstraint>,
> = Decorator extends (
  decorated: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
  caveat: infer ParentCaveat,
) => AsyncRestrictedMethod<RestrictedMethodParameters, Json>
  ? ParentCaveat extends CaveatConstraint
    ? ParentCaveat['value']
    : never
  : never;

/**
 * A function for validating caveats of a particular type.
 *
 * @see `validator` in {@link CaveatSpecificationBase} for more details.
 * @template ParentCaveat - The caveat type associated with this validator.
 * @param caveat - The caveat object to validate.
 * @param origin - The origin associated with the parent permission.
 * @param target - The target of the parent permission.
 */
export type CaveatValidator<ParentCaveat extends CaveatConstraint> = (
  caveat: { type: ParentCaveat['type']; value: unknown },
  origin?: string,
  target?: string,
) => void;

/**
 * A map of caveat type strings to {@link CaveatDiff} values.
 */
export type CaveatDiffMap<ParentCaveat extends CaveatConstraint> = {
  [CaveatType in ParentCaveat['type']]: ParentCaveat['value'];
};

/**
 * A function that merges two caveat values of the same type. The values must be
 * merged in the fashion of a right-biased union.
 *
 * @see `ARCHITECTURE.md` for more details.
 * @template Value - The type of the values to merge.
 * @param leftValue - The left-hand value.
 * @param rightValue - The right-hand value.
 * @returns `[newValue, diff]`, i.e. the merged value and the diff between the left value
 * and the new value. The diff must be expressed in the same type as the value itself.
 */
export type CaveatValueMerger<Value extends Json> = (
  leftValue: Value,
  rightValue: Value,
) => [Value, Value] | [];

export type CaveatSpecificationBase = {
  /**
   * The string type of the caveat.
   */
  type: string;

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
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validator?: CaveatValidator<any>;

  /**
   * The merger function used to merge a pair of values of the associated caveat type
   * during incremental permission requests. The values must be merged in the fashion
   * of a right-biased union.
   *
   * @see `ARCHITECTURE.md` for more details.
   */
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  merger?: CaveatValueMerger<any>;
};

export type RestrictedMethodCaveatSpecificationConstraint =
  CaveatSpecificationBase & {
    /**
     * The decorator function used to apply the caveat to restricted method
     * requests.
     */
    decorator: CaveatDecorator<CaveatConstraint>;
  };

export type EndowmentCaveatSpecificationConstraint = CaveatSpecificationBase;

/**
 * The constraint for caveat specification objects. Every {@link Caveat}
 * supported by a {@link PermissionController} must have an associated
 * specification, which is the source of truth for all caveat-related types.
 * In addition, a caveat specification may include a decorator function used
 * to apply the caveat's attenuation to a restricted method. It may also include
 * a validator function specified by the consumer.
 *
 * See the README for more details.
 */
export type CaveatSpecificationConstraint =
  | RestrictedMethodCaveatSpecificationConstraint
  | EndowmentCaveatSpecificationConstraint;

/**
 * Options for {@link CaveatSpecificationBuilder} functions.
 */
type CaveatSpecificationBuilderOptions<
  DecoratorHooks extends Record<string, unknown>,
  ValidatorHooks extends Record<string, unknown>,
> = {
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
export type CaveatSpecificationBuilder<
  Options extends CaveatSpecificationBuilderOptions<
    Record<string, unknown>,
    Record<string, unknown>
  >,
  Specification extends CaveatSpecificationConstraint,
> = (options: Options) => Specification;

/**
 * A caveat specification export object, containing the
 * {@link CaveatSpecificationBuilder} function and "hook name" objects.
 */
export type CaveatSpecificationBuilderExportConstraint = {
  specificationBuilder: CaveatSpecificationBuilder<
    CaveatSpecificationBuilderOptions<
      Record<string, unknown>,
      Record<string, unknown>
    >,
    CaveatSpecificationConstraint
  >;
  decoratorHookNames?: Record<string, true>;
  validatorHookNames?: Record<string, true>;
};

/**
 * The specifications for all caveats supported by a particular
 * {@link PermissionController}.
 *
 * @template Specifications - The union of all {@link CaveatSpecificationConstraint} types.
 */
export type CaveatSpecificationMap<
  CaveatSpecification extends CaveatSpecificationConstraint,
> = Record<CaveatSpecification['type'], CaveatSpecification>;

/**
 * Extracts the union of all caveat types specified by the given
 * {@link CaveatSpecificationConstraint} type.
 *
 * @template CaveatSpecification - The {@link CaveatSpecificationConstraint} to extract a
 * caveat type union from.
 */
export type ExtractCaveats<
  CaveatSpecification extends CaveatSpecificationConstraint,
> = CaveatSpecification extends RestrictedMethodCaveatSpecificationConstraint
  ? Caveat<
      CaveatSpecification['type'],
      ExtractCaveatValueFromDecorator<
        RestrictedMethodCaveatSpecificationConstraint['decorator']
      >
    >
  : Caveat<CaveatSpecification['type'], Json>;

/**
 * Extracts the type of a specific {@link Caveat} from a union of caveat
 * specifications.
 *
 * @template CaveatSpecifications - The union of all caveat specifications.
 * @template CaveatType - The type of the caveat to extract.
 */
export type ExtractCaveat<
  CaveatSpecifications extends CaveatSpecificationConstraint,
  CaveatType extends string,
> = Extract<ExtractCaveats<CaveatSpecifications>, { type: CaveatType }>;

/**
 * Extracts the value type of a specific {@link Caveat} from a union of caveat
 * specifications.
 *
 * @template CaveatSpecifications - The union of all caveat specifications.
 * @template CaveatType - The type of the caveat whose value to extract.
 */
export type ExtractCaveatValue<
  CaveatSpecifications extends CaveatSpecificationConstraint,
  CaveatType extends string,
> = ExtractCaveat<CaveatSpecifications, CaveatType>['value'];

/**
 * Determines whether a caveat specification is a restricted method caveat specification.
 *
 * @param specification - The caveat specification.
 * @returns True if the caveat specification is a restricted method caveat specification, otherwise false.
 */
export function isRestrictedMethodCaveatSpecification(
  specification: CaveatSpecificationConstraint,
): specification is RestrictedMethodCaveatSpecificationConstraint {
  return hasProperty(specification, 'decorator');
}

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
export function decorateWithCaveats<
  CaveatSpecifications extends CaveatSpecificationConstraint,
>(
  methodImplementation: RestrictedMethod<RestrictedMethodParameters, Json>,
  permission: Readonly<PermissionConstraint>, // bound to the requesting origin
  caveatSpecifications: CaveatSpecificationMap<CaveatSpecifications>, // all caveat implementations
): RestrictedMethod<RestrictedMethodParameters, Json> {
  const { caveats } = permission;
  if (!caveats) {
    return methodImplementation;
  }

  let decorated = async (
    args: Parameters<RestrictedMethod<RestrictedMethodParameters, Json>>[0],
  ) => methodImplementation(args);

  for (const caveat of caveats) {
    const specification =
      caveatSpecifications[caveat.type as CaveatSpecifications['type']];
    if (!specification) {
      throw new UnrecognizedCaveatTypeError(caveat.type);
    }

    if (!isRestrictedMethodCaveatSpecification(specification)) {
      throw new CaveatSpecificationMismatchError(
        specification,
        PermissionType.RestrictedMethod,
      );
    }
    decorated = specification.decorator(decorated, caveat);
  }

  return decorated;
}
