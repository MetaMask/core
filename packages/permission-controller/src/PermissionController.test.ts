import type {
  AcceptRequest as AcceptApprovalRequest,
  AddApprovalRequest,
  HasApprovalRequest,
  RejectRequest as RejectApprovalRequest,
} from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import { isPlainObject } from '@metamask/controller-utils';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import {
  assertIsJsonRpcFailure,
  assertIsJsonRpcSuccess,
  hasProperty,
} from '@metamask/utils';
import assert from 'assert';

import type {
  AsyncRestrictedMethod,
  Caveat,
  CaveatConstraint,
  CaveatMutator,
  ExtractSpecifications,
  PermissionConstraint,
  PermissionControllerActions,
  PermissionControllerEvents,
  PermissionOptions,
  PermissionsRequest,
  RestrictedMethodOptions,
  RestrictedMethodParameters,
  ValidPermission,
} from '.';
import {
  CaveatMutatorOperation,
  constructPermission,
  MethodNames,
  PermissionController,
  PermissionType,
} from '.';
import * as errors from './errors';
import type { EndowmentGetterParams } from './Permission';
import { SubjectType } from './SubjectMetadataController';
import type { GetSubjectMetadata } from './SubjectMetadataController';

// Caveat types and specifications

const CaveatTypes = {
  filterArrayResponse: 'filterArrayResponse',
  reverseArrayResponse: 'reverseArrayResponse',
  filterObjectResponse: 'filterObjectResponse',
  noopCaveat: 'noopCaveat',
  endowmentCaveat: 'endowmentCaveat',
} as const;

type FilterArrayCaveat = Caveat<
  typeof CaveatTypes.filterArrayResponse,
  string[]
>;

type ReverseArrayCaveat = Caveat<typeof CaveatTypes.reverseArrayResponse, null>;

type FilterObjectCaveat = Caveat<
  typeof CaveatTypes.filterObjectResponse,
  string[]
>;

type NoopCaveat = Caveat<typeof CaveatTypes.noopCaveat, null>;

// A caveat value merger for any caveat whose value is an array of JSON primitives.
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
const primitiveArrayMerger = <T extends string | null | number>(
  a: T[],
  b: T[],
) => {
  const diff = b.filter((element) => !a.includes(element));

  if (diff.length > 0) {
    return [[...(a ?? []), ...diff], diff] as [T[], T[]];
  }
  return [] as [];
};

/**
 * Gets caveat specifications for:
 * - {@link FilterArrayCaveat}
 * - {@link FilterObjectCaveat}
 * - {@link NoopCaveat}
 *
 * Used as a default in {@link getPermissionControllerOptions}.
 *
 * @returns The caveat specifications.
 */
function getDefaultCaveatSpecifications() {
  return {
    [CaveatTypes.filterArrayResponse]: {
      type: CaveatTypes.filterArrayResponse,
      decorator:
        (
          method: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
          caveat: FilterArrayCaveat,
        ) =>
        async (args: RestrictedMethodOptions<RestrictedMethodParameters>) => {
          const result: string[] | unknown = await method(args);
          if (!Array.isArray(result)) {
            throw Error('not an array');
          }

          return result.filter((resultValue) =>
            caveat.value.includes(resultValue),
          );
        },
      validator: (caveat: {
        type: typeof CaveatTypes.filterArrayResponse;
        value: unknown;
      }) => {
        if (!Array.isArray(caveat.value)) {
          throw new Error(
            `${CaveatTypes.filterArrayResponse} values must be arrays`,
          );
        }
      },
      merger: primitiveArrayMerger,
    },
    [CaveatTypes.reverseArrayResponse]: {
      type: CaveatTypes.reverseArrayResponse,
      decorator:
        (
          method: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
          _caveat: ReverseArrayCaveat,
        ) =>
        async (args: RestrictedMethodOptions<RestrictedMethodParameters>) => {
          const result: unknown[] | unknown = await method(args);
          if (!Array.isArray(result)) {
            throw Error('not an array');
          }

          return result.reverse();
        },
    },
    [CaveatTypes.filterObjectResponse]: {
      type: CaveatTypes.filterObjectResponse,
      decorator:
        (
          method: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
          caveat: FilterObjectCaveat,
        ) =>
        async (args: RestrictedMethodOptions<RestrictedMethodParameters>) => {
          const result = await method(args);
          if (!isPlainObject(result)) {
            throw Error('not a plain object');
          }

          Object.keys(result).forEach((key) => {
            if (!caveat.value.includes(key)) {
              delete result[key];
            }
          });
          return result;
        },
      merger: primitiveArrayMerger,
    },
    [CaveatTypes.noopCaveat]: {
      type: CaveatTypes.noopCaveat,
      decorator:
        (
          method: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
          _caveat: NoopCaveat,
        ) =>
        async (args: RestrictedMethodOptions<RestrictedMethodParameters>) => {
          return method(args);
        },
      validator: (caveat: {
        type: typeof CaveatTypes.noopCaveat;
        value: unknown;
      }) => {
        if (caveat.value !== null) {
          throw new Error('NoopCaveat value must be null');
        }
      },
      merger: (a: null | undefined, _b: null) =>
        a === undefined ? ([null, null] as [null, null]) : ([] as []),
    },
    [CaveatTypes.endowmentCaveat]: {
      type: CaveatTypes.endowmentCaveat,
      validator: (caveat: {
        type: typeof CaveatTypes.endowmentCaveat;
        value: unknown;
      }) => {
        if (typeof caveat !== 'object') {
          throw new Error('EndowmentCaveat value must be an object');
        }
      },
    },
  } as const;
}

type DefaultCaveatSpecifications = ExtractSpecifications<
  ReturnType<typeof getDefaultCaveatSpecifications>
>;

// Permission types and specifications

/**
 * Permission key constants.
 */
const PermissionKeys = {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_doubleNumber: 'wallet_doubleNumber',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_getSecretArray: 'wallet_getSecretArray',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_getSecretObject: 'wallet_getSecretObject',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noop: 'wallet_noop',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithPermittedAndFailureSideEffects:
    'wallet_noopWithPermittedAndFailureSideEffects',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithPermittedAndFailureSideEffects2:
    'wallet_noopWithPermittedAndFailureSideEffects2',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithPermittedSideEffects: 'wallet_noopWithPermittedSideEffects',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithValidator: 'wallet_noopWithValidator',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithRequiredCaveat: 'wallet_noopWithRequiredCaveat',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithFactory: 'wallet_noopWithFactory',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithManyCaveats: 'wallet_noopWithManyCaveats',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  snap_foo: 'snap_foo',
  endowmentAnySubject: 'endowmentAnySubject',
  endowmentSnapsOnly: 'endowmentSnapsOnly',
} as const;

type NoopWithRequiredCaveat = ValidPermission<
  (typeof PermissionKeys)['wallet_noopWithRequiredCaveat'],
  NoopCaveat
>;

type NoopWithFactoryPermission = ValidPermission<
  (typeof PermissionKeys)['wallet_noopWithFactory'],
  FilterArrayCaveat
>;

/**
 * Permission name (as opposed to keys) constants and getters.
 */
const PermissionNames = {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_doubleNumber: PermissionKeys.wallet_doubleNumber,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_getSecretArray: PermissionKeys.wallet_getSecretArray,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_getSecretObject: PermissionKeys.wallet_getSecretObject,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noop: PermissionKeys.wallet_noop,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithValidator: PermissionKeys.wallet_noopWithValidator,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithPermittedAndFailureSideEffects:
    PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithPermittedAndFailureSideEffects2:
    PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithPermittedSideEffects:
    PermissionKeys.wallet_noopWithPermittedSideEffects,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithRequiredCaveat: PermissionKeys.wallet_noopWithRequiredCaveat,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithFactory: PermissionKeys.wallet_noopWithFactory,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  wallet_noopWithManyCaveats: PermissionKeys.wallet_noopWithManyCaveats,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  snap_foo: PermissionKeys.snap_foo,
  endowmentAnySubject: PermissionKeys.endowmentAnySubject,
  endowmentSnapsOnly: PermissionKeys.endowmentSnapsOnly,
} as const;

// Default side-effect implementations.
const onPermittedSideEffect = () => Promise.resolve('foo');
const onFailureSideEffect = () => Promise.resolve();

/**
 * Gets the mocks for the side effect handlers of the permissions that have side effects.
 * Mocking these handlers is complicated by the fact that their use by the permission
 * controller precludes using Jest mock functions directly. We must create the mocks
 * separately, then wrap them inside a plain function in the actual permission
 * specification. This otherwise circuitous nonsense still allows us to access the
 * underlying mocks in tests.
 *
 * @returns The side effect mocks.
 */
function getSideEffectHandlerMocks() {
  return {
    [PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects]: {
      onPermitted: jest.fn(onPermittedSideEffect),
      onFailure: jest.fn(onFailureSideEffect),
    },
    [PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2]: {
      onPermitted: jest.fn(onPermittedSideEffect),
      onFailure: jest.fn(onFailureSideEffect),
    },
    [PermissionKeys.wallet_noopWithPermittedSideEffects]: {
      onPermitted: jest.fn(onPermittedSideEffect),
    },
  } as const;
}

/**
 * Gets permission specifications for our test permissions.
 * Used as a default in {@link getPermissionControllerOptions}.
 *
 * @returns The permission specifications.
 */
function getDefaultPermissionSpecificationsAndMocks() {
  const sideEffectMocks = getSideEffectHandlerMocks();

  return [
    {
      [PermissionKeys.wallet_getSecretArray]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_getSecretArray,
        allowedCaveats: [
          CaveatTypes.filterArrayResponse,
          CaveatTypes.reverseArrayResponse,
        ],
        methodImplementation: (_args: RestrictedMethodOptions<Json[]>) => {
          return ['a', 'b', 'c'];
        },
      },
      [PermissionKeys.wallet_getSecretObject]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_getSecretObject,
        allowedCaveats: [
          CaveatTypes.filterObjectResponse,
          CaveatTypes.noopCaveat,
        ],
        methodImplementation: (
          _args: RestrictedMethodOptions<Record<string, Json>>,
        ) => {
          return { a: 'x', b: 'y', c: 'z' };
        },
        validator: (permission: PermissionConstraint) => {
          // A dummy validator for a caveat type that should be impossible to add
          assert.ok(
            !permission.caveats?.some(
              (caveat) => caveat.type === CaveatTypes.filterArrayResponse,
            ),
            'getSecretObject permission validation failed',
          );
        },
      },
      [PermissionKeys.wallet_doubleNumber]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_doubleNumber,
        allowedCaveats: null,
        methodImplementation: ({
          params,
        }: RestrictedMethodOptions<[number]>) => {
          if (!Array.isArray(params)) {
            throw new Error(
              `Invalid ${PermissionKeys.wallet_doubleNumber} request`,
            );
          }
          return params[0] * 2;
        },
      },
      [PermissionKeys.wallet_noop]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_noop,
        allowedCaveats: null,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
      },
      [PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName:
          PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects,
        allowedCaveats: null,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        sideEffect: {
          onPermitted: () =>
            sideEffectMocks[
              PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects
            ].onPermitted(),
          onFailure: () =>
            sideEffectMocks[
              PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects
            ].onFailure(),
        },
      },
      [PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName:
          PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2,
        allowedCaveats: null,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        sideEffect: {
          onPermitted: () =>
            sideEffectMocks[
              PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2
            ].onPermitted(),
          onFailure: () =>
            sideEffectMocks[
              PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2
            ].onFailure(),
        },
      },
      [PermissionKeys.wallet_noopWithPermittedSideEffects]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_noopWithPermittedSideEffects,
        allowedCaveats: null,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        sideEffect: {
          onPermitted: () =>
            sideEffectMocks[
              PermissionKeys.wallet_noopWithPermittedSideEffects
            ].onPermitted(),
        },
      },
      // This one exists to check some permission validator logic
      [PermissionKeys.wallet_noopWithValidator]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_noopWithValidator,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        allowedCaveats: [
          CaveatTypes.noopCaveat,
          CaveatTypes.filterArrayResponse,
        ],
        validator: (permission: PermissionConstraint) => {
          if (
            permission.caveats?.some(
              ({ type }) => type !== CaveatTypes.noopCaveat,
            )
          ) {
            throw new Error('noop permission validation failed');
          }
        },
      },
      [PermissionKeys.wallet_noopWithRequiredCaveat]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_noopWithRequiredCaveat,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        allowedCaveats: [CaveatTypes.noopCaveat],
        factory: (
          options: PermissionOptions<NoopWithRequiredCaveat>,
          _requestData?: Record<string, unknown>,
        ) => {
          return constructPermission<NoopWithRequiredCaveat>({
            ...options,
            caveats: [
              {
                type: CaveatTypes.noopCaveat,
                value: null,
              },
            ],
          });
        },
        validator: (permission: PermissionConstraint) => {
          if (
            permission.caveats?.length !== 1 ||
            !permission.caveats?.some(
              ({ type }) => type === CaveatTypes.noopCaveat,
            )
          ) {
            throw new Error(
              'noopWithRequiredCaveat permission validation failed',
            );
          }
        },
      },
      // This one exists just to check that permission factories can use the
      // requestData of approved permission requests
      [PermissionKeys.wallet_noopWithFactory]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_noopWithFactory,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        allowedCaveats: [CaveatTypes.filterArrayResponse],
        factory: (
          options: PermissionOptions<NoopWithFactoryPermission>,
          requestData?: Record<string, unknown>,
        ) => {
          if (!requestData) {
            throw new Error('requestData is required');
          }

          return constructPermission<NoopWithFactoryPermission>({
            ...options,
            caveats: [
              {
                type: CaveatTypes.filterArrayResponse,
                value: requestData.caveatValue as string[],
              },
            ],
          });
        },
      },
      // The implementation of this is fundamentally broken due to its allowed
      // caveats, but that's okay because we never need to actually execute it.
      // Originally created for the purpose of testing caveat merging.
      [PermissionKeys.wallet_noopWithManyCaveats]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.wallet_noopWithManyCaveats,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        allowedCaveats: [
          CaveatTypes.filterArrayResponse,
          CaveatTypes.filterObjectResponse,
          CaveatTypes.noopCaveat,
        ],
      },
      [PermissionKeys.snap_foo]: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: PermissionKeys.snap_foo,
        allowedCaveats: null,
        methodImplementation: (_args: RestrictedMethodOptions<null>) => {
          return null;
        },
        subjectTypes: [SubjectType.Snap],
      },
      [PermissionKeys.endowmentAnySubject]: {
        permissionType: PermissionType.Endowment,
        targetName: PermissionKeys.endowmentAnySubject,
        endowmentGetter: (_options: EndowmentGetterParams) => ['endowment1'],
        allowedCaveats: null,
      },
      [PermissionKeys.endowmentSnapsOnly]: {
        permissionType: PermissionType.Endowment,
        targetName: PermissionKeys.endowmentSnapsOnly,
        endowmentGetter: (_options: EndowmentGetterParams) => ['endowment2'],
        allowedCaveats: [CaveatTypes.endowmentCaveat],
        subjectTypes: [SubjectType.Snap],
      },
    },
    sideEffectMocks,
  ] as const;
}

/**
 * Gets permission specifications for our test permissions.
 * Used as a default in {@link getPermissionControllerOptions}.
 *
 * @returns The permission specifications.
 */
function getDefaultPermissionSpecifications() {
  return getDefaultPermissionSpecificationsAndMocks()[0];
}

type DefaultPermissionSpecifications = ExtractSpecifications<
  ReturnType<typeof getDefaultPermissionSpecifications>
>;

// The permissions controller

const controllerName = 'PermissionController' as const;

type AllowedActions =
  | HasApprovalRequest
  | AddApprovalRequest
  | AcceptApprovalRequest
  | RejectApprovalRequest
  | GetSubjectMetadata;

/**
 * Params for `ApprovalController:addRequest` of type `wallet_requestPermissions`.
 */
type AddPermissionRequestParams = {
  id: string;
  origin: string;
  requestData: PermissionsRequest;
  type: MethodNames.requestPermissions;
};

type AddPermissionRequestArgs = [string, AddPermissionRequestParams];

/**
 * Gets a unrestricted controller messenger. Used for tests.
 *
 * @returns The unrestricted messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<
    PermissionControllerActions | AllowedActions,
    PermissionControllerEvents
  >();
}

/**
 * Gets a restricted controller messenger.
 * Used as a default in {@link getPermissionControllerOptions}.
 *
 * @param messenger - Optional parameter to pass in a messenger
 * @returns The restricted messenger.
 */
function getPermissionControllerMessenger(
  messenger = getUnrestrictedMessenger(),
) {
  return messenger.getRestricted<typeof controllerName, AllowedActions['type']>(
    {
      name: controllerName,
      allowedActions: [
        'ApprovalController:hasRequest',
        'ApprovalController:addRequest',
        'ApprovalController:acceptRequest',
        'ApprovalController:rejectRequest',
        'SubjectMetadataController:getSubjectMetadata',
      ],
      allowedEvents: [],
    },
  );
}

/**
 * Gets the default unrestricted methods array.
 * Used as a default in {@link getPermissionControllerOptions}.
 *
 * @returns The unrestricted methods array
 */
function getDefaultUnrestrictedMethods() {
  return Object.freeze(['wallet_unrestrictedMethod']);
}

/**
 * Gets some existing state to populate the permission controller with.
 * There is one subject, "metamask.io", with one permission, "wallet_getSecretArray", with no caveats.
 *
 * @returns The existing mock state
 */
function getExistingPermissionState() {
  return {
    subjects: {
      'metamask.io': {
        origin: 'metamask.io',
        permissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {
            id: 'escwEx9JrOxGZKZk3RkL4',
            parentCapability: 'wallet_getSecretArray',
            invoker: 'metamask.io',
            caveats: null,
            date: 1632618373085,
          },
        },
      },
    },
  };
}

/**
 * Gets constructor options for the permission controller. Returns defaults
 * that can be overwritten by passing in replacement options.
 *
 * The following defaults are used:
 * - `caveatSpecifications`: {@link getDefaultCaveatSpecifications}
 * - `messenger`: {@link getPermissionControllerMessenger}
 * - `permissionSpecifications`: {@link getDefaultPermissionSpecifications}
 * - `unrestrictedMethods`: {@link getDefaultUnrestrictedMethods}
 * - `state`: `undefined`
 *
 * @param opts - Permission controller options.
 * @returns The permission controller constructor options.
 */
function getPermissionControllerOptions(opts?: Record<string, unknown>) {
  return {
    caveatSpecifications: getDefaultCaveatSpecifications(),
    messenger: getPermissionControllerMessenger(),
    permissionSpecifications: getDefaultPermissionSpecifications(),
    unrestrictedMethods: getDefaultUnrestrictedMethods(),
    state: undefined,
    ...opts,
  };
}

/**
 * Gets a "default" permission controller. This simply means a controller using
 * the default caveat and permissions created in this test file.
 *
 * @param opts - For the options used, see {@link getPermissionControllerOptions}
 * @returns The default permission controller for testing.
 */
function getDefaultPermissionController(
  opts = getPermissionControllerOptions(),
) {
  return new PermissionController<
    (typeof opts.permissionSpecifications)[keyof typeof opts.permissionSpecifications],
    (typeof opts.caveatSpecifications)[keyof typeof opts.caveatSpecifications]
  >(opts);
}

/**
 * Gets an equivalent controller to the one returned by
 * {@link getDefaultPermissionController}, except it's initialized with the
 * state returned by {@link getExistingPermissionState}.
 *
 * @returns The default permission controller for testing, with some initial
 * state.
 */
function getDefaultPermissionControllerWithState() {
  return new PermissionController<
    DefaultPermissionSpecifications,
    DefaultCaveatSpecifications
  >(getPermissionControllerOptions({ state: getExistingPermissionState() }));
}

/**
 * Gets a Jest matcher for a permission as they are stored in controller state.
 *
 * @param options - Options bag.
 * @param options.parentCapability - The `parentCapability` of the permission.
 * @param options.caveats - The caveat array of the permission, or `null`.
 * @param options.invoker - The subject identifier (i.e. origin) of the subject.
 * @returns A Jest matcher that matches permissions whose corresponding fields
 * correspond to the parameters of this function.
 */
function getPermissionMatcher({
  parentCapability,
  caveats = null,
  invoker = 'metamask.io',
}: {
  parentCapability: string;
  caveats?: CaveatConstraint[] | null | typeof expect.objectContaining;
  invoker?: string;
}) {
  return expect.objectContaining({
    id: expect.any(String),
    parentCapability,
    invoker,
    caveats,
    date: expect.any(Number),
  });
}

describe('PermissionController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes a new PermissionController', () => {
      const controller = getDefaultPermissionController();
      expect(controller.state).toStrictEqual({ subjects: {} });

      expect(controller.unrestrictedMethods).toStrictEqual(
        new Set(getDefaultUnrestrictedMethods()),
      );
    });

    it('rehydrates state', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(controller.state).toStrictEqual(getExistingPermissionState());
    });

    it('throws if a permission specification permissionType is invalid', () => {
      [null, '', 'kaplar'].forEach((invalidPermissionType) => {
        expect(
          () =>
            new PermissionController<
              DefaultPermissionSpecifications,
              DefaultCaveatSpecifications
            >(
              getPermissionControllerOptions({
                permissionSpecifications: {
                  ...getDefaultPermissionSpecifications(),
                  foo: {
                    permissionType: invalidPermissionType,
                  },
                },
              }),
            ),
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        ).toThrow(`Invalid permission type: "${invalidPermissionType}"`);
      });
    });

    it('throws if a permission specification targetName is invalid', () => {
      const invalidTargetName = '';

      expect(
        () =>
          new PermissionController<
            DefaultPermissionSpecifications,
            DefaultCaveatSpecifications
          >(
            getPermissionControllerOptions({
              permissionSpecifications: {
                ...getDefaultPermissionSpecifications(),
                [invalidTargetName]: {
                  permissionType: PermissionType.Endowment,
                  targetName: invalidTargetName,
                },
              },
            }),
          ),
      ).toThrow(`Invalid permission target name: "${invalidTargetName}"`);
    });

    it('throws if a permission specification map key does not match its "targetName" value', () => {
      expect(
        () =>
          new PermissionController<
            DefaultPermissionSpecifications,
            DefaultCaveatSpecifications
          >(
            getPermissionControllerOptions({
              permissionSpecifications: {
                ...getDefaultPermissionSpecifications(),
                foo: {
                  permissionType: PermissionType.Endowment,
                  targetName: 'bar',
                },
              },
            }),
          ),
      ).toThrow(
        `Invalid permission specification: target name "foo" must match specification.targetName value "bar".`,
      );
    });

    it('throws if a permission specification lists unrecognized caveats', () => {
      const permissionSpecifications = getDefaultPermissionSpecifications();
      // @ts-expect-error Intentional destructive testing
      permissionSpecifications.wallet_getSecretArray.allowedCaveats.push('foo');

      expect(
        () =>
          new PermissionController<
            DefaultPermissionSpecifications,
            DefaultCaveatSpecifications
          >(
            getPermissionControllerOptions({
              permissionSpecifications,
            }),
          ),
      ).toThrow(new errors.UnrecognizedCaveatTypeError('foo'));
    });

    it('throws if a specified caveat has a type mismatch', () => {
      const defaultCaveats = getDefaultCaveatSpecifications();
      expect(
        () =>
          new PermissionController<
            DefaultPermissionSpecifications,
            DefaultCaveatSpecifications
          >(
            getPermissionControllerOptions({
              permissionSpecifications: {
                ...getDefaultPermissionSpecifications(),
                foo: {
                  permissionType: PermissionType.Endowment,
                  targetName: 'foo',
                  allowedCaveats: [defaultCaveats.reverseArrayResponse.type],
                },
              },
            }),
          ),
      ).toThrow(
        new errors.CaveatSpecificationMismatchError(
          defaultCaveats.reverseArrayResponse,
          PermissionType.Endowment,
        ),
      );

      expect(
        () =>
          new PermissionController<
            DefaultPermissionSpecifications,
            DefaultCaveatSpecifications
          >(
            getPermissionControllerOptions({
              permissionSpecifications: {
                ...getDefaultPermissionSpecifications(),
                foo: {
                  permissionType: PermissionType.RestrictedMethod,
                  targetName: 'foo',
                  allowedCaveats: [defaultCaveats.endowmentCaveat.type],
                },
              },
            }),
          ),
      ).toThrow(
        new errors.CaveatSpecificationMismatchError(
          defaultCaveats.endowmentCaveat,
          PermissionType.RestrictedMethod,
        ),
      );
    });
  });

  describe('clearState', () => {
    it("clears the controller's state", () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(controller.state).toStrictEqual(getExistingPermissionState());

      controller.clearState();
      expect(controller.state).toStrictEqual({ subjects: {} });
    });
  });

  describe('getRestrictedMethod', () => {
    it('gets the implementation of a restricted method', async () => {
      const controller = getDefaultPermissionController();
      const method = controller.getRestrictedMethod(
        PermissionNames.wallet_getSecretArray,
      );

      expect(
        await method({
          method: 'wallet_getSecretArray',
          context: { origin: 'github.com' },
        }),
      ).toStrictEqual(['a', 'b', 'c']);
    });

    it('throws an error if the requested permission target is not a restricted method', () => {
      const controller = getDefaultPermissionController();
      expect(() =>
        controller.getRestrictedMethod(PermissionNames.endowmentAnySubject),
      ).toThrow(errors.methodNotFound(PermissionNames.endowmentAnySubject));
    });

    it('throws an error if the method does not exist', () => {
      const controller = getDefaultPermissionController();
      expect(() => controller.getRestrictedMethod('foo')).toThrow(
        errors.methodNotFound('foo'),
      );
    });
  });

  describe('getSubjectNames', () => {
    it('gets all subject names', () => {
      const controller = getDefaultPermissionController();
      expect(controller.getSubjectNames()).toStrictEqual([]);

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(controller.getSubjectNames()).toStrictEqual(['foo']);

      controller.grantPermissions({
        subject: { origin: 'bar' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(controller.getSubjectNames()).toStrictEqual(['foo', 'bar']);
    });
  });

  describe('getPermission', () => {
    it('gets existing permissions', () => {
      const controller = getDefaultPermissionControllerWithState();

      expect(
        controller.getPermission(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
        ),
      ).toStrictEqual(
        getPermissionMatcher({
          parentCapability: PermissionNames.wallet_getSecretArray,
          caveats: null,
          invoker: 'metamask.io',
        }),
      );
    });

    it('returns undefined if the subject does not exist', () => {
      const controller = getDefaultPermissionController();
      expect(
        controller.getPermission(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
        ),
      ).toBeUndefined();
    });

    it('returns undefined if the subject does not have the specified permission', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(
        controller.getPermission(
          'metamask.io',
          PermissionNames.wallet_getSecretObject,
        ),
      ).toBeUndefined();
    });
  });

  describe('getPermissions', () => {
    it('gets existing permissions', () => {
      const controller = getDefaultPermissionControllerWithState();

      expect(controller.getPermissions('metamask.io')).toStrictEqual({
        [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
          parentCapability: PermissionNames.wallet_getSecretArray,
          caveats: null,
          invoker: 'metamask.io',
        }),
      });
    });

    it('returns undefined for subjects without permissions', () => {
      const controller = getDefaultPermissionController();
      expect(controller.getPermissions('metamask.io')).toBeUndefined();
    });
  });

  describe('hasPermission', () => {
    it('correctly indicates whether an origin has a permission', () => {
      const controller = getDefaultPermissionControllerWithState();

      expect(
        controller.hasPermission(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
        ),
      ).toBe(true);

      expect(
        controller.hasPermission(
          'metamask.io',
          PermissionNames.wallet_getSecretObject,
        ),
      ).toBe(false);
    });
  });

  describe('hasPermissions', () => {
    it('correctly indicates whether an origin has any permissions', () => {
      const controller = getDefaultPermissionControllerWithState();

      expect(controller.hasPermissions('metamask.io')).toBe(true);
      expect(controller.hasPermissions('foo.bar')).toBe(false);
    });
  });

  describe('revokeAllPermissions', () => {
    it('revokes all permissions for the specified subject', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(controller.state).toStrictEqual(getExistingPermissionState());

      controller.revokeAllPermissions('metamask.io');
      expect(controller.state).toStrictEqual({ subjects: {} });

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_doubleNumber]: {},
        },
      });

      controller.revokeAllPermissions('foo');
      expect(controller.state).toStrictEqual({ subjects: {} });
    });

    it('throws an error if the specified subject has no permissions', () => {
      const controller = getDefaultPermissionController();
      expect(() => controller.revokeAllPermissions('metamask.io')).toThrow(
        new errors.UnrecognizedSubjectError('metamask.io'),
      );

      controller.grantPermissions({
        subject: { origin: 'metamask.io' },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {},
        },
      });

      expect(() => controller.revokeAllPermissions('foo')).toThrow(
        new errors.UnrecognizedSubjectError('foo'),
      );
    });
  });

  describe('revokePermission', () => {
    it('revokes a permission from an origin with a single permission', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(controller.state).toStrictEqual(getExistingPermissionState());

      controller.revokePermission(
        'metamask.io',
        PermissionNames.wallet_getSecretArray,
      );
      expect(controller.state).toStrictEqual({ subjects: {} });
    });

    it('revokes a permission from an origin with multiple permissions', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(controller.state).toStrictEqual(getExistingPermissionState());
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {},
        },
      });

      controller.revokePermission(
        origin,
        PermissionNames.wallet_getSecretArray,
      );

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretObject,
                caveats: null,
                invoker: origin,
              }),
            },
          },
        },
      });
    });

    it('throws an error if the specified subject has no permissions', () => {
      const controller = getDefaultPermissionController();
      expect(() =>
        controller.revokePermission(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
        ),
      ).toThrow(new errors.UnrecognizedSubjectError('metamask.io'));
    });

    it('throws an error if the requested subject does not have the specified permission', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(() =>
        controller.revokePermission(
          'metamask.io',
          PermissionNames.wallet_getSecretObject,
        ),
      ).toThrow(
        new errors.PermissionDoesNotExistError(
          'metamask.io',
          PermissionNames.wallet_getSecretObject,
        ),
      );
    });
  });

  describe('revokePermissions', () => {
    it('revokes different permissions for multiple subjects', () => {
      const controller = getDefaultPermissionController();
      const origin0 = 'origin0';
      const origin1 = 'origin1';
      const origin2 = 'origin2';
      const origin3 = 'origin3';
      const origin4 = 'origin4';

      controller.grantPermissions({
        subject: { origin: origin0 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin1 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin2 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_getSecretObject]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin3 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.endowmentAnySubject]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin4 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_getSecretObject]: {},
        },
      });

      controller.revokePermissions({
        [origin0]: [PermissionNames.wallet_getSecretArray],
        [origin2]: [PermissionNames.wallet_getSecretArray],
        [origin3]: [PermissionNames.wallet_getSecretArray],
        [origin4]: [
          PermissionNames.wallet_getSecretArray,
          PermissionNames.wallet_getSecretObject,
        ],
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin1]: {
            origin: origin1,
            permissions: {
              [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretArray,
                caveats: null,
                invoker: origin1,
              }),
            },
          },
          [origin2]: {
            origin: origin2,
            permissions: {
              [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretObject,
                caveats: null,
                invoker: origin2,
              }),
            },
          },
          [origin3]: {
            origin: origin3,
            permissions: {
              [PermissionNames.endowmentAnySubject]: getPermissionMatcher({
                parentCapability: PermissionNames.endowmentAnySubject,
                caveats: null,
                invoker: origin3,
              }),
            },
          },
        },
      });
    });

    it('throws an error if a specified subject has no permissions', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(() =>
        controller.revokePermissions({
          foo: [PermissionNames.wallet_getSecretArray],
        }),
      ).toThrow(new errors.UnrecognizedSubjectError('foo'));
    });

    it('throws an error if the requested subject does not have the specified permission', () => {
      const controller = getDefaultPermissionControllerWithState();
      expect(() =>
        controller.revokePermissions({
          'metamask.io': [PermissionNames.wallet_getSecretObject],
        }),
      ).toThrow(
        new errors.PermissionDoesNotExistError(
          'metamask.io',
          PermissionNames.wallet_getSecretObject,
        ),
      );
    });
  });

  describe('revokePermissionForAllSubjects', () => {
    it('does nothing if there are no subjects', () => {
      const controller = getDefaultPermissionController();
      controller.revokePermissionForAllSubjects(
        PermissionNames.wallet_getSecretArray,
      );
      expect(controller.state).toStrictEqual({ subjects: {} });
    });

    it('revokes single permission from all subjects', () => {
      const controller = getDefaultPermissionController();
      const origin0 = 'origin0';
      const origin1 = 'origin1';
      const origin2 = 'origin2';
      const origin3 = 'origin3';
      const origin4 = 'origin4';

      controller.grantPermissions({
        subject: { origin: origin0 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin1 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin2 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_getSecretObject]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin3 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.endowmentAnySubject]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin4 },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_getSecretObject]: {},
        },
      });

      controller.revokePermissionForAllSubjects(
        PermissionNames.wallet_getSecretArray,
      );

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin0]: {
            origin: origin0,
            permissions: {
              [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretObject,
                caveats: null,
                invoker: origin0,
              }),
            },
          },
          [origin2]: {
            origin: origin2,
            permissions: {
              [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretObject,
                caveats: null,
                invoker: origin2,
              }),
            },
          },
          [origin3]: {
            origin: origin3,
            permissions: {
              [PermissionNames.endowmentAnySubject]: getPermissionMatcher({
                parentCapability: PermissionNames.endowmentAnySubject,
                caveats: null,
                invoker: origin3,
              }),
            },
          },
          [origin4]: {
            origin: origin4,
            permissions: {
              [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretObject,
                caveats: null,
                invoker: origin4,
              }),
            },
          },
        },
      });
    });
  });

  describe('hasCaveat', () => {
    it('indicates whether a permission has a particular caveat', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.filterObjectResponse, value: ['kaplar'] },
            ],
          },
        },
      });

      expect(
        controller.hasCaveat(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      ).toBe(false);

      expect(
        controller.hasCaveat(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.filterObjectResponse,
        ),
      ).toBe(true);
    });

    it('throws an error if no corresponding permission exists', () => {
      const controller = getDefaultPermissionController();
      expect(() =>
        controller.hasCaveat(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      ).toThrow(
        new errors.PermissionDoesNotExistError(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });
  });

  describe('getCaveat', () => {
    it('gets existing caveats', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.filterObjectResponse, value: ['kaplar'] },
            ],
          },
        },
      });

      expect(
        controller.getCaveat(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      ).toBeUndefined();

      expect(
        controller.getCaveat(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.filterObjectResponse,
        ),
      ).toStrictEqual({
        type: CaveatTypes.filterObjectResponse,
        value: ['kaplar'],
      });
    });

    it('throws an error if no corresponding permission exists', () => {
      const controller = getDefaultPermissionController();
      expect(() =>
        controller.getCaveat(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      ).toThrow(
        new errors.PermissionDoesNotExistError(
          'metamask.io',
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });
  });

  describe('addCaveat', () => {
    it('adds a caveat to the specified permission', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      controller.addCaveat(
        origin,
        PermissionNames.wallet_getSecretArray,
        CaveatTypes.filterArrayResponse,
        ['foo'],
      );

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });
    });

    it(`appends a caveat to the specified permission's existing caveats`, () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
            ],
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });

      controller.addCaveat(
        origin,
        PermissionNames.wallet_getSecretObject,
        CaveatTypes.noopCaveat,
        null,
      );

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
                  { type: CaveatTypes.noopCaveat, value: null },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });
    });

    it('throws an error if a corresponding caveat already exists', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.filterObjectResponse, value: ['kaplar'] },
            ],
          },
        },
      });

      expect(() =>
        controller.addCaveat(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.filterObjectResponse,
          ['foo'],
        ),
      ).toThrow(
        new errors.CaveatAlreadyExistsError(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.filterObjectResponse,
        ),
      );
    });

    it('throws an error if no corresponding permission exists', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.addCaveat(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
          ['foo'],
        ),
      ).toThrow(
        new errors.PermissionDoesNotExistError(
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws an error if the permission fails to validate with the added caveat', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
            ],
          },
        },
      });

      expect(() =>
        controller.addCaveat(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.filterArrayResponse,
          ['foo'],
        ),
      ).toThrow(
        new errors.ForbiddenCaveatError(
          CaveatTypes.filterArrayResponse,
          origin,
          PermissionNames.wallet_getSecretObject,
        ),
      );
    });
  });

  describe('updateCaveat', () => {
    it('updates an existing caveat', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [
              { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
            ],
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });

      controller.updateCaveat(
        origin,
        PermissionNames.wallet_getSecretArray,
        CaveatTypes.filterArrayResponse,
        ['bar'],
      );

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['bar'] },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });
    });

    it('throws an error if no corresponding permission exists', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.updateCaveat(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
          ['foo'],
        ),
      ).toThrow(
        new errors.PermissionDoesNotExistError(
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws an error if no corresponding caveat exists', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      expect(() =>
        controller.updateCaveat(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
          ['foo'],
        ),
      ).toThrow(
        new errors.CaveatDoesNotExistError(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      );
    });

    it('throws an error if the updated caveat fails to validate', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [{ type: CaveatTypes.noopCaveat, value: null }],
          },
        },
      });

      expect(() =>
        controller.updateCaveat(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.noopCaveat,
          'bar',
        ),
      ).toThrow(new Error('NoopCaveat value must be null'));
    });
  });

  describe('removeCaveat', () => {
    it('removes an existing caveat', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [
              { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
            ],
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });

      controller.removeCaveat(
        origin,
        PermissionNames.wallet_getSecretArray,
        CaveatTypes.filterArrayResponse,
      );

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
                caveats: null,
                invoker: origin,
              }),
            },
          },
        },
      });
    });

    it('removes an existing caveat, without modifying other caveats of the same permission', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.noopCaveat, value: null },
              { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
            ],
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
                caveats: [
                  { type: CaveatTypes.noopCaveat, value: null },
                  { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });

      controller.removeCaveat(
        origin,
        PermissionNames.wallet_getSecretObject,
        CaveatTypes.noopCaveat,
      );

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
                ],
                invoker: origin,
              }),
            },
          },
        },
      });
    });

    it('throws an error if no corresponding permission exists', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.removeCaveat(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      ).toThrow(
        new errors.PermissionDoesNotExistError(
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws an error if no corresponding caveat exists', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.filterObjectResponse, value: ['foo'] },
            ],
          },
        },
      });

      expect(() =>
        controller.removeCaveat(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      ).toThrow(
        new errors.CaveatDoesNotExistError(
          origin,
          PermissionNames.wallet_getSecretArray,
          CaveatTypes.filterArrayResponse,
        ),
      );

      expect(() =>
        controller.removeCaveat(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.noopCaveat,
        ),
      ).toThrow(
        new errors.CaveatDoesNotExistError(
          origin,
          PermissionNames.wallet_getSecretObject,
          CaveatTypes.noopCaveat,
        ),
      );
    });

    it('throws an error if the permission fails to validate after caveat removal', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_noopWithRequiredCaveat]: {
            caveats: [{ type: CaveatTypes.noopCaveat, value: null }],
          },
        },
      });

      expect(() =>
        controller.removeCaveat(
          origin,
          PermissionNames.wallet_noopWithRequiredCaveat,
          CaveatTypes.noopCaveat,
        ),
      ).toThrow(
        new Error('noopWithRequiredCaveat permission validation failed'),
      );
    });
  });

  describe('updatePermissionsByCaveat', () => {
    enum MultiCaveatOrigins {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      a = 'a.com',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      b = 'b.io',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      c = 'c.biz',
    }

    /**
     * Generates a permission controller instance with some granted permissions for testing.
     *
     * @returns The permission controller instance
     */
    const getMultiCaveatController = () => {
      const controller = getDefaultPermissionController();

      controller.grantPermissions({
        subject: { origin: MultiCaveatOrigins.a },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [{ type: CaveatTypes.filterArrayResponse, value: ['a'] }],
          },
        },
      });

      controller.grantPermissions({
        subject: { origin: MultiCaveatOrigins.b },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [
              { type: CaveatTypes.filterArrayResponse, value: ['b'] },
              { type: CaveatTypes.reverseArrayResponse, value: null },
            ],
          },
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [
              { type: CaveatTypes.filterObjectResponse, value: ['b'] },
              { type: CaveatTypes.noopCaveat, value: null },
            ],
          },
          [PermissionNames.wallet_noopWithRequiredCaveat]: {
            caveats: [{ type: CaveatTypes.noopCaveat, value: null }],
          },
          [PermissionNames.wallet_doubleNumber]: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: MultiCaveatOrigins.c },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretObject]: {
            caveats: [{ type: CaveatTypes.filterObjectResponse, value: ['c'] }],
          },
          [PermissionNames.wallet_noopWithRequiredCaveat]: {
            caveats: [{ type: CaveatTypes.noopCaveat, value: null }],
          },
        },
      });

      return controller;
    };

    const getMultiCaveatStateMatcher = (
      overrides: Partial<
        Record<MultiCaveatOrigins, ReturnType<typeof getPermissionMatcher>>
      > = {},
    ) => {
      return {
        subjects: {
          [MultiCaveatOrigins.a]: {
            origin: MultiCaveatOrigins.a,
            permissions: {
              [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretArray,
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['a'] },
                ],
                invoker: MultiCaveatOrigins.a,
              }),
              ...overrides[MultiCaveatOrigins.a],
            },
          },

          [MultiCaveatOrigins.b]: {
            origin: MultiCaveatOrigins.b,
            permissions: {
              [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretArray,
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['b'] },
                  { type: CaveatTypes.reverseArrayResponse, value: null },
                ],
                invoker: MultiCaveatOrigins.b,
              }),
              [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretObject,
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['b'] },
                  { type: CaveatTypes.noopCaveat, value: null },
                ],
                invoker: MultiCaveatOrigins.b,
              }),
              [PermissionNames.wallet_noopWithRequiredCaveat]:
                getPermissionMatcher({
                  parentCapability:
                    PermissionNames.wallet_noopWithRequiredCaveat,
                  caveats: [{ type: CaveatTypes.noopCaveat, value: null }],
                  invoker: MultiCaveatOrigins.b,
                }),
              [PermissionNames.wallet_doubleNumber]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_doubleNumber,
                caveats: null,
                invoker: MultiCaveatOrigins.b,
              }),
              ...overrides[MultiCaveatOrigins.b],
            },
          },

          [MultiCaveatOrigins.c]: {
            origin: MultiCaveatOrigins.c,
            permissions: {
              [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
                parentCapability: PermissionNames.wallet_getSecretObject,
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['c'] },
                ],
                invoker: MultiCaveatOrigins.c,
              }),
              [PermissionNames.wallet_noopWithRequiredCaveat]:
                getPermissionMatcher({
                  parentCapability:
                    PermissionNames.wallet_noopWithRequiredCaveat,
                  caveats: [{ type: CaveatTypes.noopCaveat, value: null }],
                  invoker: MultiCaveatOrigins.c,
                }),
              ...overrides[MultiCaveatOrigins.c],
            },
          },
        },
      };
    };

    // This is effectively a test of the above test utilities.
    it('multi-caveat controller has expected state', () => {
      const controller = getMultiCaveatController();
      expect(controller.state).toStrictEqual(getMultiCaveatStateMatcher());
    });

    it('does nothing if there are no subjects', () => {
      const controller = getDefaultPermissionController();
      expect(controller.state).toStrictEqual({ subjects: {} });

      // There are no caveats, so this does nothing.
      controller.updatePermissionsByCaveat(
        CaveatTypes.filterArrayResponse,
        () => {
          return {
            operation: CaveatMutatorOperation.updateValue,
            value: ['a', 'b'],
          };
        },
      );
      expect(controller.state).toStrictEqual({ subjects: {} });
    });

    it('does nothing if the mutator returns the "noop" operation', () => {
      const controller = getMultiCaveatController();

      // Although there are caveats, we always return the "noop" operation, and
      // therefore nothing happens.
      controller.updatePermissionsByCaveat(
        CaveatTypes.filterArrayResponse,
        () => {
          return { operation: CaveatMutatorOperation.noop };
        },
      );
      expect(controller.state).toStrictEqual(getMultiCaveatStateMatcher());
    });

    it('updates the value of all caveats of a particular type', () => {
      const controller = getMultiCaveatController();

      controller.updatePermissionsByCaveat(
        CaveatTypes.filterArrayResponse,
        () => {
          return {
            operation: CaveatMutatorOperation.updateValue,
            value: ['a', 'b'],
          };
        },
      );

      expect(controller.state).toStrictEqual(
        getMultiCaveatStateMatcher({
          [MultiCaveatOrigins.a]: {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: [
                { type: CaveatTypes.filterArrayResponse, value: ['a', 'b'] },
              ],
              invoker: MultiCaveatOrigins.a,
            }),
          },
          [MultiCaveatOrigins.b]: {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: [
                { type: CaveatTypes.filterArrayResponse, value: ['a', 'b'] },
                { type: CaveatTypes.reverseArrayResponse, value: null },
              ],
              invoker: MultiCaveatOrigins.b,
            }),
          },
        }),
      );
    });

    it('selectively updates the value of all caveats of a particular type', () => {
      const controller = getMultiCaveatController();

      let counter = 0;
      const mutator = () => {
        counter += 1;
        return counter === 1
          ? { operation: CaveatMutatorOperation.noop as const }
          : {
              operation: CaveatMutatorOperation.updateValue as const,
              value: ['a', 'b'],
            };
      };

      controller.updatePermissionsByCaveat(
        CaveatTypes.filterArrayResponse,
        mutator,
      );

      expect(controller.state).toStrictEqual(
        getMultiCaveatStateMatcher({
          [MultiCaveatOrigins.b]: {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: [
                { type: CaveatTypes.filterArrayResponse, value: ['a', 'b'] },
                { type: CaveatTypes.reverseArrayResponse, value: null },
              ],
              invoker: MultiCaveatOrigins.b,
            }),
          },
        }),
      );
    });

    it('deletes all caveats of a particular type', () => {
      const controller = getMultiCaveatController();

      controller.updatePermissionsByCaveat(
        CaveatTypes.filterArrayResponse,
        () => {
          return { operation: CaveatMutatorOperation.deleteCaveat };
        },
      );

      expect(controller.state).toStrictEqual(
        getMultiCaveatStateMatcher({
          [MultiCaveatOrigins.a]: {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: null,
              invoker: MultiCaveatOrigins.a,
            }),
          },
          [MultiCaveatOrigins.b]: {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: [
                { type: CaveatTypes.reverseArrayResponse, value: null },
              ],
              invoker: MultiCaveatOrigins.b,
            }),
          },
        }),
      );
    });

    it('revokes permissions associated with a caveat', () => {
      const controller = getMultiCaveatController();

      controller.updatePermissionsByCaveat(
        CaveatTypes.filterObjectResponse,
        () => {
          return { operation: CaveatMutatorOperation.revokePermission };
        },
      );

      const matcher = getMultiCaveatStateMatcher();
      delete matcher.subjects[MultiCaveatOrigins.b].permissions[
        PermissionNames.wallet_getSecretObject
      ];

      delete matcher.subjects[MultiCaveatOrigins.c].permissions[
        PermissionNames.wallet_getSecretObject
      ];

      expect(controller.state).toStrictEqual(matcher);
    });

    it('deletes subject if all permissions are revoked', () => {
      const controller = getMultiCaveatController();

      let counter = 0;
      const mutator: CaveatMutator<FilterArrayCaveat> = () => {
        counter += 1;
        return {
          operation:
            counter === 1
              ? CaveatMutatorOperation.revokePermission
              : CaveatMutatorOperation.noop,
        };
      };

      controller.updatePermissionsByCaveat(
        CaveatTypes.filterArrayResponse,
        mutator,
      );

      const matcher = getMultiCaveatStateMatcher();
      // @ts-expect-error Intentional destructive testing
      delete matcher.subjects[MultiCaveatOrigins.a];

      expect(controller.state).toStrictEqual(matcher);
    });

    it('throws if caveat validation fails after a value is updated', () => {
      const controller = getMultiCaveatController();

      expect(() =>
        controller.updatePermissionsByCaveat(
          CaveatTypes.filterArrayResponse,
          () => {
            return {
              operation: CaveatMutatorOperation.updateValue,
              value: 'foo',
            };
          },
        ),
      ).toThrow(`${CaveatTypes.filterArrayResponse} values must be arrays`);
    });

    it('throws if permission validation fails after a value is updated', () => {
      const controller = getMultiCaveatController();

      expect(() =>
        controller.updatePermissionsByCaveat(CaveatTypes.noopCaveat, () => {
          return { operation: CaveatMutatorOperation.deleteCaveat };
        }),
      ).toThrow('noopWithRequiredCaveat permission validation failed');
    });

    it('throws if mutator returns unrecognized operation', () => {
      const controller = getMultiCaveatController();

      expect(() =>
        controller.updatePermissionsByCaveat(
          CaveatTypes.filterArrayResponse,
          // @ts-expect-error Intentional destructive testing
          () => {
            return { operation: 'foobar' };
          },
        ),
      ).toThrow(`Unrecognized mutation result: "foobar"`);
    });
  });

  describe('grantPermissions', () => {
    it('grants new permission', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
              }),
            },
          },
        },
      });
    });

    it('grants new permissions (multiple at once)', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretObject: {
            parentCapability: 'wallet_getSecretObject',
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
              }),
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
              }),
            },
          },
        },
      });
    });

    it('grants new permissions (multiple origins)', () => {
      const controller = getDefaultPermissionController();
      const origin1 = 'metamask.io';
      const origin2 = 'infura.io';

      controller.grantPermissions({
        subject: { origin: origin1 },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretObject: {},
        },
      });

      controller.grantPermissions({
        subject: { origin: origin2 },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin1]: {
            origin: origin1,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
                caveats: null,
                invoker: origin1,
              }),
            },
          },
          [origin2]: {
            origin: origin2,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
                caveats: null,
                invoker: origin2,
              }),
            },
          },
        },
      });
    });

    it('grants new permission (endowment with caveats)', () => {
      const options = getPermissionControllerOptions();
      const { messenger } = options;
      const origin = 'npm:@metamask/test-snap-bip44';

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockImplementationOnce(() => {
          return {
            origin,
            name: origin,
            subjectType: SubjectType.Snap,
            iconUrl: null,
            extensionId: null,
          };
        });

      const controller = getDefaultPermissionController(options);

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.endowmentSnapsOnly]: {
            caveats: [
              {
                type: CaveatTypes.endowmentCaveat,
                value: {
                  namespaces: { eip155: { methods: ['eth_signTransaction'] } },
                },
              },
            ],
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              [PermissionNames.endowmentSnapsOnly]: getPermissionMatcher({
                invoker: origin,
                parentCapability: PermissionNames.endowmentSnapsOnly,
                caveats: [
                  {
                    type: CaveatTypes.endowmentCaveat,
                    value: {
                      namespaces: {
                        eip155: { methods: ['eth_signTransaction'] },
                      },
                    },
                  },
                ],
              }),
            },
          },
        },
      });

      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'SubjectMetadataController:getSubjectMetadata',
        origin,
      );
    });

    it('preserves existing permissions if preserveExistingPermissions is true', () => {
      const controller = getDefaultPermissionControllerWithState();
      const origin = 'metamask.io';

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: expect.objectContaining({
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
              }),
            }),
          },
        },
      });

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretObject: {},
        },
        // preserveExistingPermissions is true by default
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: expect.objectContaining({
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
              }),
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
              }),
            }),
          },
        },
      });
    });

    it('overwrites existing permissions if preserveExistingPermissions is false', () => {
      const controller = getDefaultPermissionControllerWithState();
      const origin = 'metamask.io';

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
              }),
            },
          },
        },
      });

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretObject: {},
        },
        preserveExistingPermissions: false,
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: expect.objectContaining({
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
              }),
            }),
          },
        },
      });
    });

    it('throws if the origin is invalid', () => {
      const controller = getDefaultPermissionController();

      expect(() =>
        controller.grantPermissions({
          subject: { origin: '' },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {},
          },
        }),
      ).toThrow(new errors.InvalidSubjectIdentifierError(''));

      expect(() =>
        controller.grantPermissions({
          // @ts-expect-error Intentional destructive testing
          subject: { origin: 2 },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {},
          },
        }),
      ).toThrow(new errors.InvalidSubjectIdentifierError(2));
    });

    it('throws if the target does not exist', () => {
      const controller = getDefaultPermissionController();

      expect(() =>
        controller.grantPermissions({
          subject: { origin: 'metamask.io' },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretFalafel: {},
          },
        }),
      ).toThrow(errors.methodNotFound('wallet_getSecretFalafel'));
    });

    it('throws if an approved permission is malformed', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              // This must match the key
              parentCapability: 'wallet_getSecretObject',
            },
          },
        }),
      ).toThrow(
        new errors.InvalidApprovedPermissionError(
          origin,
          'wallet_getSecretArray',
          { parentCapability: 'wallet_getSecretObject' },
        ),
      );

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              parentCapability: 'wallet_getSecretArray',
            },
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretObject: {
              // This must match the key
              parentCapability: 'wallet_getSecretArray',
            },
          },
        }),
      ).toThrow(
        new errors.InvalidApprovedPermissionError(
          origin,
          'wallet_getSecretObject',
          { parentCapability: 'wallet_getSecretArray' },
        ),
      );
    });

    it('throws if an approved permission has duplicate caveats', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              parentCapability: 'wallet_getSecretArray',
              caveats: [
                { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
                { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
              ],
            },
          },
        }),
      ).toThrow(
        new errors.DuplicateCaveatError(
          CaveatTypes.filterArrayResponse,
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws if a requested caveat is not a plain object', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              // @ts-expect-error Intentional destructive testing
              caveats: [[]],
            },
          },
        }),
      ).toThrow(
        new errors.InvalidCaveatError(
          [],
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              // @ts-expect-error Intentional destructive testing
              caveats: ['foo'],
            },
          },
        }),
      ).toThrow(
        new errors.InvalidCaveatError(
          [],
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws if a requested caveat has more than two keys', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              caveats: [
                {
                  ...{ type: CaveatTypes.filterArrayResponse, value: ['foo'] },
                  // @ts-expect-error Intentional destructive testing
                  bar: 'bar',
                },
              ],
            },
          },
        }),
      ).toThrow(
        new errors.InvalidCaveatFieldsError(
          {
            ...{ type: CaveatTypes.filterArrayResponse, value: ['foo'] },
            bar: 'bar',
          },
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws if a requested caveat type is not a string', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              caveats: [
                {
                  // @ts-expect-error Intentional destructive testing
                  type: 2,
                  value: ['foo'],
                },
              ],
            },
          },
        }),
      ).toThrow(
        new errors.InvalidCaveatTypeError(
          {
            type: 2,
            value: ['foo'],
          },
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws if a requested caveat type does not exist', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              caveats: [{ type: 'fooType', value: 'bar' }],
            },
          },
        }),
      ).toThrow(
        new errors.UnrecognizedCaveatTypeError(
          'fooType',
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws if a requested caveat has no value field', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretArray: {
              caveats: [
                {
                  type: CaveatTypes.filterArrayResponse,
                  // @ts-expect-error Intentional destructive testing
                  foo: 'bar',
                },
              ],
            },
          },
        }),
      ).toThrow(
        new errors.CaveatMissingValueError(
          {
            type: CaveatTypes.filterArrayResponse,
            foo: 'bar',
          },
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      );
    });

    it('throws if a requested caveat has a value with a self-referential cycle', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      const circular: Record<string, unknown> = { foo: 'bar' };
      // Create a cycle. This will cause our JSON validity check to error.
      circular.circular = circular;

      [{ foo: () => undefined }, circular, { foo: BigInt(10) }].forEach(
        (invalidValue) => {
          expect(() =>
            controller.grantPermissions({
              subject: { origin },
              approvedPermissions: {
                // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                // eslint-disable-next-line @typescript-eslint/naming-convention
                wallet_getSecretArray: {
                  caveats: [
                    {
                      type: CaveatTypes.filterArrayResponse,
                      // @ts-expect-error Intentional destructive testing
                      value: invalidValue,
                    },
                  ],
                },
              },
            }),
          ).toThrow(
            new errors.CaveatInvalidJsonError(
              {
                type: CaveatTypes.filterArrayResponse,
                value: invalidValue,
              },
              origin,
              PermissionNames.wallet_getSecretArray,
            ),
          );
        },
      );
    });

    it('throws if caveat validation fails', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            [PermissionNames.wallet_getSecretObject]: {
              caveats: [
                {
                  type: CaveatTypes.noopCaveat,
                  value: 'bar',
                },
              ],
            },
          },
        }),
      ).toThrow(new Error('NoopCaveat value must be null'));
    });

    it('throws if the requested permission specifies disallowed caveats', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_getSecretObject: {
              caveats: [
                {
                  type: CaveatTypes.filterArrayResponse,
                  value: ['bar'],
                },
              ],
            },
          },
        }),
      ).toThrow(
        new errors.ForbiddenCaveatError(
          CaveatTypes.filterArrayResponse,
          origin,
          PermissionNames.wallet_getSecretObject,
        ),
      );
    });

    it('throws if the requested permission specifies caveats, and no caveats are allowed', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wallet_doubleNumber: {
              caveats: [
                {
                  type: CaveatTypes.filterArrayResponse,
                  value: ['bar'],
                },
              ],
            },
          },
        }),
      ).toThrow(
        new errors.ForbiddenCaveatError(
          CaveatTypes.filterArrayResponse,
          origin,
          PermissionNames.wallet_doubleNumber,
        ),
      );
    });

    it('throws if the permission validator throws', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      expect(() =>
        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            [PermissionNames.wallet_noopWithValidator]: {
              caveats: [
                { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
              ],
            },
          },
        }),
      ).toThrow(new Error('noop permission validation failed'));
    });
  });

  // See requestPermissionsIncremental for further tests
  describe('grantPermissionsIncremental', () => {
    it('incrementally grants a permission', () => {
      const controller = getDefaultPermissionControllerWithState();
      const origin = 'metamask.io';

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
              }),
            },
          },
        },
      });

      controller.grantPermissionsIncremental({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretObject: {},
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: expect.objectContaining({
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: getPermissionMatcher({
                parentCapability: 'wallet_getSecretArray',
              }),
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretObject: getPermissionMatcher({
                parentCapability: 'wallet_getSecretObject',
              }),
            }),
          },
        },
      });
    });

    it('incrementally grants a caveat to an existing permission', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';
      const caveat1 = { type: CaveatTypes.filterArrayResponse, value: ['foo'] };
      const caveat2 = {
        type: CaveatTypes.filterObjectResponse,
        value: ['bar'],
      };

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_noopWithManyCaveats: {
            caveats: [{ ...caveat1 }],
          },
        },
      });

      controller.grantPermissionsIncremental({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_noopWithManyCaveats: {
            caveats: [{ ...caveat2 }],
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: expect.objectContaining({
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_noopWithManyCaveats: getPermissionMatcher({
                parentCapability: 'wallet_noopWithManyCaveats',
                caveats: [{ ...caveat1 }, { ...caveat2 }],
              }),
            }),
          },
        },
      });
    });

    it('incrementally updates a caveat of an existing permission', () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';
      const getCaveat = (...values: string[]) => ({
        type: CaveatTypes.filterArrayResponse,
        value: values,
      });

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_noopWithManyCaveats: {
            caveats: [getCaveat('foo')],
          },
        },
      });

      controller.grantPermissionsIncremental({
        subject: { origin },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_noopWithManyCaveats: {
            caveats: [getCaveat('foo', 'bar')],
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjects: {
          [origin]: {
            origin,
            permissions: expect.objectContaining({
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_noopWithManyCaveats: getPermissionMatcher({
                parentCapability: 'wallet_noopWithManyCaveats',
                caveats: [getCaveat('foo', 'bar')],
              }),
            }),
          },
        },
      });
    });
  });

  describe('requesting permissions', () => {
    const getAnyPermissionsDiffMatcher = () =>
      expect.objectContaining({
        currentPermissions: expect.any(Object),
        permissionDiffMap: expect.any(Object),
      });

    describe.each([
      'requestPermissions',
      'requestPermissionsIncremental',
    ] as const)('%s', (requestFunctionName) => {
      const getRequestDataDiffProperty = () =>
        requestFunctionName === 'requestPermissionsIncremental'
          ? { diff: getAnyPermissionsDiffMatcher() }
          : {};

      it('requests a permission', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: null,
              invoker: origin,
            }),
          },
          { id: expect.any(String), origin },
        ]);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: { [PermissionNames.wallet_getSecretArray]: {} },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('allows caller passing additional metadata', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {},
            },
            { metadata: { foo: 'bar' } },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: null,
              invoker: origin,
            }),
          },
          { id: expect.any(String), origin },
        ]);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { foo: 'bar', id: expect.any(String), origin },
              permissions: { [PermissionNames.wallet_getSecretArray]: {} },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('requests a permission that requires permitted side-effects', async () => {
        const [permissionSpecifications, sideEffectMocks] =
          getDefaultPermissionSpecificationsAndMocks();
        const options = getPermissionControllerOptions({
          permissionSpecifications,
        });
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);

        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_noopWithPermittedSideEffects]: {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_noopWithPermittedSideEffects]:
              getPermissionMatcher({
                parentCapability:
                  PermissionNames.wallet_noopWithPermittedSideEffects,
                caveats: null,
                invoker: origin,
              }),
          },
          {
            data: {
              [PermissionNames.wallet_noopWithPermittedSideEffects]: 'foo',
            },
            id: expect.any(String),
            origin,
          },
        ]);

        expect(
          sideEffectMocks[PermissionNames.wallet_noopWithPermittedSideEffects]
            .onPermitted,
        ).toHaveBeenCalledTimes(1);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_noopWithPermittedSideEffects]: {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('requests a permission that requires permitted and failure side-effects', async () => {
        const [permissionSpecifications, sideEffectMocks] =
          getDefaultPermissionSpecificationsAndMocks();
        const options = getPermissionControllerOptions({
          permissionSpecifications,
        });
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
              getPermissionMatcher({
                parentCapability:
                  PermissionNames.wallet_noopWithPermittedAndFailureSideEffects,
                caveats: null,
                invoker: origin,
              }),
          },
          {
            data: {
              [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                'foo',
            },
            id: expect.any(String),
            origin,
          },
        ]);

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onPermitted,
        ).toHaveBeenCalledTimes(1);

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onFailure,
        ).not.toHaveBeenCalled();

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                  {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('can handle multiple side-effects', async () => {
        const [permissionSpecifications, sideEffectMocks] =
          getDefaultPermissionSpecificationsAndMocks();
        const options = getPermissionControllerOptions({
          permissionSpecifications,
        });
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                {},
              [PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2]:
                {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
              getPermissionMatcher({
                parentCapability:
                  PermissionNames.wallet_noopWithPermittedAndFailureSideEffects,
                caveats: null,
                invoker: origin,
              }),
          },
          {
            data: {
              [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                'foo',
              [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2]:
                'foo',
            },
            id: expect.any(String),
            origin,
          },
        ]);

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onPermitted,
        ).toHaveBeenCalledTimes(1);
        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2
          ].onPermitted,
        ).toHaveBeenCalledTimes(1);

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onFailure,
        ).not.toHaveBeenCalled();
        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2
          ].onFailure,
        ).not.toHaveBeenCalled();

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                  {},
                [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2]:
                  {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('can handle multiple permitted side-effect failures', async () => {
        const [permissionSpecifications, sideEffectMocks] =
          getDefaultPermissionSpecificationsAndMocks();
        const options = getPermissionControllerOptions({
          permissionSpecifications,
        });
        const { messenger } = options;
        const origin = 'metamask.io';

        sideEffectMocks[
          PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
        ].onPermitted.mockImplementation(() =>
          Promise.reject(new Error('error')),
        );
        sideEffectMocks[
          PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2
        ].onPermitted.mockImplementation(() =>
          Promise.reject(new Error('error')),
        );

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(async () =>
          controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                {},
              [PermissionKeys.wallet_noopWithPermittedAndFailureSideEffects2]:
                {},
            },
          ),
        ).rejects.toThrow(
          'Multiple errors occurred during side-effects execution',
        );

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onPermitted,
        ).toHaveBeenCalledTimes(1);
        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2
          ].onPermitted,
        ).toHaveBeenCalledTimes(1);

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onFailure,
        ).toHaveBeenCalledTimes(1);
        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2
          ].onFailure,
        ).toHaveBeenCalledTimes(1);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                  {},
                [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects2]:
                  {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('can handle permitted side-effect rejection (no failure handler)', async () => {
        const [permissionSpecifications, sideEffectMocks] =
          getDefaultPermissionSpecificationsAndMocks();
        const options = getPermissionControllerOptions({
          permissionSpecifications,
        });
        const { messenger } = options;
        const origin = 'metamask.io';

        sideEffectMocks[
          PermissionNames.wallet_noopWithPermittedSideEffects
        ].onPermitted.mockImplementation(() =>
          Promise.reject(new Error('error')),
        );

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(async () =>
          controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_noopWithPermittedSideEffects]: {},
            },
          ),
        ).rejects.toThrow('error');

        expect(
          sideEffectMocks[PermissionNames.wallet_noopWithPermittedSideEffects]
            .onPermitted,
        ).toHaveBeenCalledTimes(1);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_noopWithPermittedSideEffects]: {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('can handle failure side-effect rejection', async () => {
        const [permissionSpecifications, sideEffectMocks] =
          getDefaultPermissionSpecificationsAndMocks();
        const options = getPermissionControllerOptions({
          permissionSpecifications,
        });
        const { messenger } = options;
        const origin = 'metamask.io';

        sideEffectMocks[
          PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
        ].onPermitted.mockImplementation(() =>
          Promise.reject(new Error('error')),
        );

        sideEffectMocks[
          PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
        ].onFailure.mockImplementation(() =>
          Promise.reject(new Error('error')),
        );

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(async () =>
          controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                {},
            },
          ),
        ).rejects.toThrow('Unexpected error in side-effects');

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onPermitted,
        ).toHaveBeenCalledTimes(1);

        expect(
          sideEffectMocks[
            PermissionNames.wallet_noopWithPermittedAndFailureSideEffects
          ].onFailure,
        ).toHaveBeenCalledTimes(1);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_noopWithPermittedAndFailureSideEffects]:
                  {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('requests a permission that requires requestData in its factory', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
              caveatValue: ['foo'], // this will be added to the permission
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_noopWithFactory]: {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_noopWithFactory]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_noopWithFactory,
              caveats: [
                { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
              ],
              invoker: origin,
            }),
          },
          { id: expect.any(String), origin },
        ]);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_noopWithFactory]: {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('requests multiple permissions', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {},
              [PermissionNames.wallet_getSecretObject]: {
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                ],
              },
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: null,
              invoker: origin,
            }),
            [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretObject,
              caveats: [
                { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
              ],
              invoker: origin,
            }),
          },
          { id: expect.any(String), origin },
        ]);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {},
                [PermissionNames.wallet_getSecretObject]: {
                  caveats: [
                    { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                  ],
                },
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('requests multiple permissions (approved permissions are a strict superset)', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              // endowmentAnySubject is added to the request
              permissions: {
                ...requestData.permissions,
                [PermissionNames.endowmentAnySubject]: {},
              },
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {},
              [PermissionNames.wallet_getSecretObject]: {
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                ],
              },
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: null,
              invoker: origin,
            }),
            [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretObject,
              caveats: [
                { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
              ],
              invoker: origin,
            }),
            [PermissionNames.endowmentAnySubject]: getPermissionMatcher({
              parentCapability: PermissionNames.endowmentAnySubject,
              caveats: null,
              invoker: origin,
            }),
          },
          { id: expect.any(String), origin },
        ]);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {},
                [PermissionNames.wallet_getSecretObject]: {
                  caveats: [
                    { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                  ],
                },
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('requests multiple permissions (approved permissions are a strict subset)', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            const approvedPermissions = { ...requestData.permissions };
            delete approvedPermissions[PermissionNames.wallet_getSecretArray];

            return {
              metadata: { ...requestData.metadata },
              permissions: approvedPermissions,
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {},
              [PermissionNames.wallet_getSecretObject]: {
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                ],
              },
              [PermissionNames.endowmentAnySubject]: {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretObject,
              caveats: [
                { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
              ],
              invoker: origin,
            }),
            [PermissionNames.endowmentAnySubject]: getPermissionMatcher({
              parentCapability: PermissionNames.endowmentAnySubject,
              caveats: null,
              invoker: origin,
            }),
          },
          { id: expect.any(String), origin },
        ]);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {},
                [PermissionNames.wallet_getSecretObject]: {
                  caveats: [
                    { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                  ],
                },
                [PermissionNames.endowmentAnySubject]: {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('requests multiple permissions (an approved permission is modified)', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            const approvedPermissions = { ...requestData.permissions };
            approvedPermissions[PermissionNames.wallet_getSecretObject] = {
              caveats: [
                { type: CaveatTypes.filterObjectResponse, value: ['kaplar'] },
              ],
            };

            return {
              metadata: { ...requestData.metadata },
              permissions: approvedPermissions,
            };
          });

        const controller = getDefaultPermissionController(options);
        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {},
              [PermissionNames.wallet_getSecretObject]: {
                caveats: [
                  { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                ],
              },
              [PermissionNames.endowmentAnySubject]: {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.wallet_getSecretArray]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretArray,
              caveats: null,
              invoker: origin,
            }),
            [PermissionNames.wallet_getSecretObject]: getPermissionMatcher({
              parentCapability: PermissionNames.wallet_getSecretObject,
              caveats: [
                { type: CaveatTypes.filterObjectResponse, value: ['kaplar'] },
              ],
              invoker: origin,
            }),
            [PermissionNames.endowmentAnySubject]: getPermissionMatcher({
              parentCapability: PermissionNames.endowmentAnySubject,
              caveats: null,
              invoker: origin,
            }),
          },
          { id: expect.any(String), origin },
        ]);

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {},
                [PermissionNames.wallet_getSecretObject]: {
                  caveats: [
                    { type: CaveatTypes.filterObjectResponse, value: ['baz'] },
                  ],
                },
                [PermissionNames.endowmentAnySubject]: {},
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('throws if requested permissions object is not a plain object', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';
        const controller = getDefaultPermissionController(options);

        const callActionSpy = jest.spyOn(messenger, 'call');

        for (const invalidInput of [
          // not plain objects
          null,
          'foo',
          [{ [PermissionNames.wallet_getSecretArray]: {} }],
        ]) {
          await expect(
            async () =>
              await controller[requestFunctionName](
                { origin },
                // @ts-expect-error Intentional destructive testing
                invalidInput,
              ),
          ).rejects.toThrow(
            errors.invalidParams({
              message: `Requested permissions for origin "${origin}" is not a plain object.`,
              data: { origin, requestedPermissions: invalidInput },
            }),
          );
        }

        expect(callActionSpy).not.toHaveBeenCalled();
      });

      it('throws if requested permissions object has no permissions', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest.spyOn(messenger, 'call');

        const controller = getDefaultPermissionController(options);
        await expect(
          async () =>
            // No permissions in object
            await controller[requestFunctionName]({ origin }, {}),
        ).rejects.toThrow(
          errors.invalidParams({
            message: `Permissions request for origin "${origin}" contains no permissions.`,
            data: { origin, requestedPermissions: {} },
          }),
        );

        expect(callActionSpy).not.toHaveBeenCalled();
      });

      it('throws if requested permissions contain a (key : value.parentCapability) mismatch', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest.spyOn(messenger, 'call');

        const controller = getDefaultPermissionController(options);
        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
                // parentCapability value does not match key
                [PermissionNames.wallet_getSecretObject]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
              },
            ),
        ).rejects.toThrow(
          errors.invalidParams({
            message: `Permissions request for origin "${origin}" contains invalid requested permission(s).`,
            data: {
              origin,
              requestedPermissions: {
                [PermissionNames.wallet_getSecretArray]: {
                  [PermissionNames.wallet_getSecretArray]: {
                    parentCapability: PermissionNames.wallet_getSecretArray,
                  },
                  [PermissionNames.wallet_getSecretObject]: {
                    parentCapability: PermissionNames.wallet_getSecretArray,
                  },
                },
              },
            },
          }),
        );

        expect(callActionSpy).not.toHaveBeenCalled();
      });

      it('throws if requesting a permission for an unknown target', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest.spyOn(messenger, 'call');

        const controller = getDefaultPermissionController(options);
        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {},
                // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                // eslint-disable-next-line @typescript-eslint/naming-convention
                wallet_getSecretKabob: {},
              },
            ),
        ).rejects.toThrow(
          errors.methodNotFound('wallet_getSecretKabob', {
            origin,
            requestedPermissions: {
              [PermissionNames.wallet_getSecretArray]: {
                [PermissionNames.wallet_getSecretArray]: {},
                // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                // eslint-disable-next-line @typescript-eslint/naming-convention
                wallet_getSecretKabob: {},
              },
            },
          }),
        );

        expect(callActionSpy).not.toHaveBeenCalled();
      });

      it('throws if permission subjectTypes does not include type of subject (restricted method)', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(() => {
            return {
              origin,
              name: origin,
              subjectType: SubjectType.Website,
              iconUrl: null,
              extensionId: null,
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(
          controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.snap_foo]: {},
            },
          ),
        ).rejects.toThrow(
          'The method "snap_foo" does not exist / is not available.',
        );

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'SubjectMetadataController:getSubjectMetadata',
          origin,
        );
      });

      it('throws if permission subjectTypes does not include type of subject (endowment)', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(() => {
            return {
              origin,
              name: origin,
              subjectType: SubjectType.Website,
              iconUrl: null,
              extensionId: null,
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(
          controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.endowmentSnapsOnly]: {},
            },
          ),
        ).rejects.toThrow(
          'Subject "metamask.io" has no permission for "endowmentSnapsOnly".',
        );

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'SubjectMetadataController:getSubjectMetadata',
          origin,
        );
      });

      it('does not throw if permission subjectTypes includes type of subject', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = '@metamask/test-snap-bip44';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementation((...args) => {
            const [action, { requestData }] = args as AddPermissionRequestArgs;
            if (action === 'ApprovalController:addRequest') {
              return Promise.resolve({
                metadata: { ...requestData.metadata },
                permissions: { ...requestData.permissions },
              });
            } else if (
              action === 'SubjectMetadataController:getSubjectMetadata'
            ) {
              return {
                origin,
                name: origin,
                subjectType: SubjectType.Snap,
                iconUrl: null,
                extensionId: null,
              };
            }
            throw new Error(`Unexpected action: "${action}"`);
          });

        const controller = getDefaultPermissionController(options);

        expect(
          await controller[requestFunctionName](
            { origin },
            {
              [PermissionNames.snap_foo]: {},
            },
          ),
        ).toMatchObject([
          {
            [PermissionNames.snap_foo]: getPermissionMatcher({
              parentCapability: PermissionNames.snap_foo,
              caveats: null,
              invoker: origin,
            }),
          },
          {
            id: expect.any(String),
            origin,
          },
        ]);

        expect(callActionSpy).toHaveBeenCalledWith(
          'SubjectMetadataController:getSubjectMetadata',
          origin,
        );
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: { [PermissionNames.snap_foo]: {} },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('throws if the "caveats" property of a requested permission is invalid', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest.spyOn(messenger, 'call');

        const controller = getDefaultPermissionController(options);
        for (const invalidCaveatsValue of [
          [], // empty array
          undefined,
          'foo',
          2,
          Symbol('bar'),
        ]) {
          await expect(
            async () =>
              await controller[requestFunctionName](
                { origin },
                {
                  [PermissionNames.wallet_getSecretArray]: {
                    // @ts-expect-error Intentional destructive testing
                    caveats: invalidCaveatsValue,
                  },
                },
              ),
          ).rejects.toThrow(
            new errors.InvalidCaveatsPropertyError(
              origin,
              PermissionNames.wallet_getSecretArray,
              invalidCaveatsValue,
            ),
          );

          expect(callActionSpy).not.toHaveBeenCalled();
        }
      });

      it('throws if a requested permission has duplicate caveats', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest.spyOn(messenger, 'call');

        const controller = getDefaultPermissionController(options);
        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {
                  caveats: [
                    { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
                    { type: CaveatTypes.filterArrayResponse, value: ['foo'] },
                  ],
                },
              },
            ),
        ).rejects.toThrow(
          new errors.DuplicateCaveatError(
            CaveatTypes.filterArrayResponse,
            origin,
            PermissionNames.wallet_getSecretArray,
          ),
        );

        expect(callActionSpy).not.toHaveBeenCalled();
      });

      it('throws if the approved request object is invalid', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';
        const controller = getDefaultPermissionController(options);
        const callActionSpy = jest.spyOn(messenger, 'call');

        for (const invalidRequestObject of ['foo', null, { metadata: 'foo' }]) {
          callActionSpy.mockClear();
          callActionSpy.mockImplementationOnce(
            async () => invalidRequestObject,
          );

          await expect(
            async () =>
              await controller[requestFunctionName](
                { origin },
                {
                  [PermissionNames.wallet_getSecretArray]: {},
                },
              ),
          ).rejects.toThrow(
            errors.internalError(
              `Approved permissions request for subject "${origin}" is invalid.`,
              { data: { approvedRequest: invalidRequestObject } },
            ),
          );

          expect(callActionSpy).toHaveBeenCalledTimes(1);
          expect(callActionSpy).toHaveBeenCalledWith(
            'ApprovalController:addRequest',
            {
              id: expect.any(String),
              origin,
              requestData: {
                metadata: { id: expect.any(String), origin },
                permissions: { [PermissionNames.wallet_getSecretArray]: {} },
                ...getRequestDataDiffProperty(),
              },
              type: MethodNames.requestPermissions,
            },
            true,
          );
        }
      });

      it('throws if the approved request ID changed', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              // different id
              metadata: { ...requestData.metadata, id: 'foo' },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {},
              },
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {},
              },
            ),
        ).rejects.toThrow(
          errors.internalError(
            `Approved permissions request for subject "${origin}" mutated its id.`,
            { originalId: expect.any(String), mutatedId: 'foo' },
          ),
        );

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: { [PermissionNames.wallet_getSecretArray]: {} },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('throws if the approved request origin changed', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              // different origin
              metadata: { ...requestData.metadata, origin: 'foo.com' },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {},
              },
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {},
              },
            ),
        ).rejects.toThrow(
          errors.internalError(
            `Approved permissions request for subject "${origin}" mutated its origin.`,
            { originalOrigin: origin, mutatedOrigin: 'foo' },
          ),
        );

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: { [PermissionNames.wallet_getSecretArray]: {} },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('throws if no permissions were approved', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: {}, // no permissions
            };
          });

        const controller = getDefaultPermissionController(options);
        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {},
              },
            ),
        ).rejects.toThrow(
          errors.internalError(
            `Invalid approved permissions request: Permissions request for origin "${origin}" contains no permissions.`,
            {
              [PermissionNames.wallet_getSecretArray]: {},
            },
          ),
        );

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: { [PermissionNames.wallet_getSecretArray]: {} },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('throws if approved permissions object is not a plain object', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';
        const id = 'arbitraryId';
        const controller = getDefaultPermissionController(options);

        const callActionSpy = jest.spyOn(messenger, 'call');

        // The metadata is valid, but the permissions are invalid
        const getInvalidRequestObject = (invalidPermissions: unknown) => {
          return {
            metadata: { origin, id },
            permissions: invalidPermissions,
          };
        };

        for (const invalidRequestObject of [
          null,
          'foo',
          [{ [PermissionNames.wallet_getSecretArray]: {} }],
        ].map((invalidPermissions) =>
          getInvalidRequestObject(invalidPermissions),
        )) {
          callActionSpy.mockClear();
          callActionSpy.mockImplementationOnce(
            async () => invalidRequestObject,
          );

          await expect(
            async () =>
              await controller[requestFunctionName](
                { origin },
                {
                  [PermissionNames.wallet_getSecretArray]: {},
                },
                { id, preserveExistingPermissions: true },
              ),
          ).rejects.toThrow(
            errors.internalError(
              `Invalid approved permissions request: Requested permissions for origin "${origin}" is not a plain object.`,
              { data: { approvedRequest: invalidRequestObject } },
            ),
          );

          expect(callActionSpy).toHaveBeenCalledTimes(1);
          expect(callActionSpy).toHaveBeenCalledWith(
            'ApprovalController:addRequest',
            {
              id: expect.any(String),
              origin,
              requestData: {
                metadata: { id: expect.any(String), origin },
                permissions: { [PermissionNames.wallet_getSecretArray]: {} },
                ...getRequestDataDiffProperty(),
              },
              type: MethodNames.requestPermissions,
            },
            true,
          );
        }
      });

      it('throws if approved permissions contain a (key : value.parentCapability) mismatch', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';
        const controller = getDefaultPermissionController(options);

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
                // parentCapability value does not match key
                [PermissionNames.wallet_getSecretObject]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
              },
            };
          });

        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
              },
            ),
        ).rejects.toThrow(
          errors.invalidParams({
            message: `Invalid approved permissions request: Permissions request for origin "${origin}" contains invalid requested permission(s).`,
            data: {
              origin,
              requestedPermissions: {
                [PermissionNames.wallet_getSecretArray]: {
                  [PermissionNames.wallet_getSecretArray]: {
                    parentCapability: PermissionNames.wallet_getSecretArray,
                  },
                  [PermissionNames.wallet_getSecretObject]: {
                    parentCapability: PermissionNames.wallet_getSecretArray,
                  },
                },
              },
            },
          }),
        );

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });

      it('correctly throws errors that do not inherit from JsonRpcError', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';
        const controller = getDefaultPermissionController(options);

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
                [PermissionNames.wallet_getSecretObject]: {
                  parentCapability: PermissionNames.wallet_getSecretObject,
                  caveats: 'foo', // invalid
                },
              },
            };
          });

        await expect(
          async () =>
            await controller[requestFunctionName](
              { origin },
              {
                [PermissionNames.wallet_getSecretArray]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
              },
            ),
        ).rejects.toThrow(
          errors.internalError(
            `Invalid approved permissions request: The "caveats" property of permission for "${PermissionNames.wallet_getSecretObject}" of subject "${origin}" is invalid. It must be a non-empty array if specified.`,
          ),
        );

        expect(callActionSpy).toHaveBeenCalledTimes(1);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: expect.any(String),
            origin,
            requestData: {
              metadata: { id: expect.any(String), origin },
              permissions: {
                [PermissionNames.wallet_getSecretArray]: {
                  parentCapability: PermissionNames.wallet_getSecretArray,
                },
              },
              ...getRequestDataDiffProperty(),
            },
            type: MethodNames.requestPermissions,
          },
          true,
        );
      });
    });

    // Permissions and their caveats are merged through a right-biased union.
    // The existing permissions are the left-hand side and denoted as `A`.
    // The requested permissions are the right-hand side and denoted as `B`.
    describe('requestPermissionsIncremental: merging permissions', () => {
      const caveatType1 = CaveatTypes.filterArrayResponse;
      const caveatType2 = CaveatTypes.filterObjectResponse;
      const caveatType3 = CaveatTypes.noopCaveat;

      const makeCaveat = (type: string, value: Json) => ({ type, value });
      const makeCaveat1 = (...value: string[]) =>
        makeCaveat(caveatType1, value);
      const makeCaveat2 = (...value: string[]) =>
        makeCaveat(caveatType2, value);
      const makeCaveat3 = () => makeCaveat(caveatType3, null);

      it.each([
        ['neither A nor B have caveats', null, null],
        ['only A has caveats', [makeCaveat1('a', 'b'), makeCaveat3()], null],
        [
          'A and B have the same caveat',
          [makeCaveat1('a', 'b')],
          [makeCaveat1('a', 'b')],
        ],
        [
          'A and B have the same caveats',
          [makeCaveat1('a', 'b'), makeCaveat3()],
          [makeCaveat1('a', 'b'), makeCaveat3()],
        ],
      ])(
        'no-ops if request results in no change: %s',
        async (_case, leftCaveats, rightCaveats) => {
          const options = getPermissionControllerOptions();
          const { messenger } = options;
          const origin = 'metamask.io';
          const controller = getDefaultPermissionController(options);

          controller.grantPermissions({
            subject: { origin },
            approvedPermissions: {
              [PermissionNames.wallet_noopWithManyCaveats]: {
                // @ts-expect-error We know that the caveat type is correct.
                caveats: leftCaveats,
              },
            },
          });

          const callActionSpy = jest
            .spyOn(messenger, 'call')
            .mockImplementationOnce(async (...args) => {
              const [, { requestData }] = args as AddPermissionRequestArgs;
              return {
                metadata: { ...requestData.metadata },
                permissions: { ...requestData.permissions },
              };
            });

          expect(
            await controller.requestPermissionsIncremental(
              { origin },
              {
                [PermissionNames.wallet_noopWithManyCaveats]: {
                  // @ts-expect-error We know that the caveat type is correct.
                  caveats: rightCaveats,
                },
              },
            ),
          ).toStrictEqual([]);

          expect(callActionSpy).not.toHaveBeenCalled();
        },
      );

      it.each([
        [
          'only B has caveats',
          null,
          [makeCaveat1('a', 'b'), makeCaveat3()],
          [makeCaveat1('a', 'b'), makeCaveat3()],
          { [caveatType1]: ['a', 'b'], [caveatType3]: null },
        ],
        [
          'A and B have disjoint caveats',
          [makeCaveat1('a', 'b')],
          [makeCaveat2('y', 'z'), makeCaveat3()],
          [makeCaveat1('a', 'b'), makeCaveat2('y', 'z'), makeCaveat3()],
          { [caveatType2]: ['y', 'z'], [caveatType3]: null },
        ],
        [
          'A and B have one of the same caveat',
          [makeCaveat1('a', 'b')],
          [makeCaveat1('c')],
          [makeCaveat1('a', 'b', 'c')],
          { [caveatType1]: ['c'] },
        ],
        [
          'A and B have one of the same caveat, and others',
          [makeCaveat1('a', 'b'), makeCaveat2('x')],
          [makeCaveat1('c'), makeCaveat3()],
          [makeCaveat1('a', 'b', 'c'), makeCaveat2('x'), makeCaveat3()],
          { [caveatType1]: ['c'], [caveatType3]: null },
        ],
        [
          'A and B have two of the same caveat',
          [makeCaveat1('a', 'b'), makeCaveat2('x')],
          [makeCaveat2('y', 'z'), makeCaveat1('c')],
          [makeCaveat1('a', 'b', 'c'), makeCaveat2('x', 'y', 'z')],
          { [caveatType1]: ['c'], [caveatType2]: ['y', 'z'] },
        ],
        [
          'A and B have two of the same caveat, and A has one other',
          [makeCaveat1('a', 'b'), makeCaveat2('x'), makeCaveat3()],
          [makeCaveat2('y', 'z'), makeCaveat1('c')],
          [
            makeCaveat1('a', 'b', 'c'),
            makeCaveat2('x', 'y', 'z'),
            makeCaveat3(),
          ],
          { [caveatType1]: ['c'], [caveatType2]: ['y', 'z'] },
        ],
        [
          'A and B have two of the same caveat, and B has one other',
          [makeCaveat1('a', 'b'), makeCaveat2('x')],
          [makeCaveat2('y', 'z'), makeCaveat1('c'), makeCaveat3()],
          [
            makeCaveat1('a', 'b', 'c'),
            makeCaveat2('x', 'y', 'z'),
            makeCaveat3(),
          ],
          {
            [caveatType1]: ['c'],
            [caveatType2]: ['y', 'z'],
            [caveatType3]: null,
          },
        ],
      ])(
        'requested permission merges with existing permission: %s',
        async (
          _case,
          leftCaveats,
          rightCaveats,
          expectedCaveats,
          caveatsDiff,
        ) => {
          const getPermissionDiffMatcher = (
            previousCaveats: CaveatConstraint[] | null,
            diff: Record<string, Json[] | null>,
          ) =>
            expect.objectContaining({
              currentPermissions: expect.objectContaining({
                [PermissionNames.wallet_noopWithManyCaveats]:
                  expect.objectContaining({
                    caveats: previousCaveats,
                  }),
              }),
              permissionDiffMap: {
                [PermissionNames.wallet_noopWithManyCaveats]: diff,
              },
            });

          const options = getPermissionControllerOptions();
          const { messenger } = options;
          const origin = 'metamask.io';
          const controller = getDefaultPermissionController(options);

          controller.grantPermissions({
            subject: { origin },
            approvedPermissions: {
              [PermissionNames.wallet_noopWithManyCaveats]: {
                // @ts-expect-error The caveat type is in fact valid.
                caveats: leftCaveats,
              },
            },
          });

          const callActionSpy = jest
            .spyOn(messenger, 'call')
            .mockImplementationOnce(async (...args) => {
              const [, { requestData }] = args as AddPermissionRequestArgs;
              return {
                metadata: { ...requestData.metadata },
                permissions: { ...requestData.permissions },
              };
            });

          expect(
            await controller.requestPermissionsIncremental(
              { origin },
              {
                [PermissionNames.wallet_noopWithManyCaveats]: {
                  // @ts-expect-error The caveat type is in fact valid.
                  caveats: rightCaveats,
                },
              },
            ),
          ).toMatchObject([
            {
              [PermissionNames.wallet_noopWithManyCaveats]:
                getPermissionMatcher({
                  parentCapability: PermissionNames.wallet_noopWithManyCaveats,
                  caveats: expectedCaveats,
                }),
            },
            { id: expect.any(String), origin },
          ]);

          expect(callActionSpy).toHaveBeenCalledTimes(1);
          expect(callActionSpy).toHaveBeenCalledWith(
            'ApprovalController:addRequest',
            {
              id: expect.any(String),
              origin,
              requestData: {
                metadata: { id: expect.any(String), origin },
                permissions: {
                  [PermissionNames.wallet_noopWithManyCaveats]:
                    getPermissionMatcher({
                      parentCapability:
                        PermissionNames.wallet_noopWithManyCaveats,
                      caveats: expectedCaveats,
                    }),
                },
                diff: getPermissionDiffMatcher(leftCaveats, caveatsDiff),
              },
              type: MethodNames.requestPermissions,
            },
            true,
          );
        },
      );

      it('throws if attempting to merge caveats without a merger function', async () => {
        const options = getPermissionControllerOptions();
        const { messenger } = options;
        const origin = 'metamask.io';

        const controller = getDefaultPermissionController(options);

        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            [PermissionNames.wallet_getSecretArray]: {
              caveats: [makeCaveat(CaveatTypes.reverseArrayResponse, null)],
            },
          },
        });

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        await expect(
          controller.requestPermissionsIncremental(
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {
                caveats: [makeCaveat(CaveatTypes.reverseArrayResponse, null)],
              },
            },
          ),
        ).rejects.toThrow(
          new errors.CaveatMergerDoesNotExistError(
            CaveatTypes.reverseArrayResponse,
          ),
        );

        expect(callActionSpy).not.toHaveBeenCalled();
      });

      it('throws if merged caveats produce an invalid permission', async () => {
        const caveatSpecifications = getDefaultCaveatSpecifications();
        // @ts-expect-error Intentional destructive testing
        caveatSpecifications[CaveatTypes.filterArrayResponse].merger = () => [
          'foo',
          'foo',
        ];

        const options = getPermissionControllerOptions({
          caveatSpecifications,
        });
        const { messenger } = options;
        const origin = 'metamask.io';

        const controller = getDefaultPermissionController(options);

        controller.grantPermissions({
          subject: { origin },
          approvedPermissions: {
            [PermissionNames.wallet_getSecretArray]: {
              caveats: [makeCaveat(CaveatTypes.filterArrayResponse, ['a'])],
            },
          },
        });

        const callActionSpy = jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(async (...args) => {
            const [, { requestData }] = args as AddPermissionRequestArgs;
            return {
              metadata: { ...requestData.metadata },
              permissions: { ...requestData.permissions },
            };
          });

        await expect(
          controller.requestPermissionsIncremental(
            { origin },
            {
              [PermissionNames.wallet_getSecretArray]: {
                caveats: [makeCaveat(CaveatTypes.filterArrayResponse, ['b'])],
              },
            },
          ),
        ).rejects.toThrow(
          new errors.InvalidMergedPermissionsError(
            origin,
            new Error(
              `${CaveatTypes.filterArrayResponse} values must be arrays`,
            ),
            {},
          ),
        );

        expect(callActionSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('acceptPermissionsRequest', () => {
    it('accepts a permissions request', async () => {
      const options = getPermissionControllerOptions();
      const { messenger } = options;
      const origin = 'metamask.io';
      const id = 'foobar';

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockImplementationOnce(() => true)
        .mockImplementationOnce(() => undefined);

      const controller = getDefaultPermissionController(options);

      await controller.acceptPermissionsRequest({
        metadata: { id, origin },
        permissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      expect(callActionSpy).toHaveBeenCalledTimes(2);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        1,
        'ApprovalController:hasRequest',
        {
          id,
        },
      );

      expect(callActionSpy).toHaveBeenNthCalledWith(
        2,
        'ApprovalController:acceptRequest',
        id,
        {
          metadata: { id, origin },
          permissions: {
            [PermissionNames.wallet_getSecretArray]: {},
          },
        },
      );
    });

    it('rejects the request if it contains no permissions', async () => {
      const options = getPermissionControllerOptions();
      const { messenger } = options;
      const origin = 'metamask.io';
      const id = 'foobar';

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockImplementationOnce(() => true)
        .mockImplementationOnce(() => undefined);

      const controller = getDefaultPermissionController(options);

      await controller.acceptPermissionsRequest({
        metadata: { id, origin },
        permissions: {},
      });

      expect(callActionSpy).toHaveBeenCalledTimes(2);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        1,
        'ApprovalController:hasRequest',
        {
          id,
        },
      );

      expect(callActionSpy).toHaveBeenNthCalledWith(
        2,
        'ApprovalController:rejectRequest',
        id,
        errors.invalidParams({
          message: 'Must request at least one permission.',
        }),
      );
    });

    it('throws if the request does not exist', async () => {
      const options = getPermissionControllerOptions();
      const { messenger } = options;
      const origin = 'metamask.io';
      const id = 'foobar';

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockImplementationOnce(() => false);

      const controller = getDefaultPermissionController(options);

      await expect(
        async () =>
          await controller.acceptPermissionsRequest({
            metadata: { id, origin },
            permissions: {
              [PermissionNames.wallet_getSecretArray]: {},
            },
          }),
      ).rejects.toThrow(new errors.PermissionsRequestNotFoundError(id));

      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        1,
        'ApprovalController:hasRequest',
        {
          id,
        },
      );
    });

    it('rejects the request and throws if accepting the request throws', async () => {
      const options = getPermissionControllerOptions();
      const { messenger } = options;
      const origin = 'metamask.io';
      const id = 'foobar';

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockImplementationOnce(() => true)
        .mockImplementationOnce(() => {
          throw new Error('unexpected failure');
        })
        .mockImplementationOnce(() => undefined);

      const controller = getDefaultPermissionController(options);

      await expect(
        async () =>
          await controller.acceptPermissionsRequest({
            metadata: { id, origin },
            permissions: {
              [PermissionNames.wallet_getSecretArray]: {},
            },
          }),
      ).rejects.toThrow(new Error('unexpected failure'));

      expect(callActionSpy).toHaveBeenCalledTimes(3);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        1,
        'ApprovalController:hasRequest',
        {
          id,
        },
      );

      expect(callActionSpy).toHaveBeenNthCalledWith(
        2,
        'ApprovalController:acceptRequest',
        id,
        {
          metadata: { id, origin },
          permissions: {
            [PermissionNames.wallet_getSecretArray]: {},
          },
        },
      );

      expect(callActionSpy).toHaveBeenNthCalledWith(
        3,
        'ApprovalController:rejectRequest',
        id,
        new Error('unexpected failure'),
      );
    });
  });

  describe('rejectPermissionsRequest', () => {
    it('rejects a permissions request', async () => {
      const options = getPermissionControllerOptions();
      const { messenger } = options;
      const id = 'foobar';

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockImplementationOnce(async () => true)
        .mockImplementationOnce(async () => undefined);

      const controller = getDefaultPermissionController(options);

      await controller.rejectPermissionsRequest(id);

      expect(callActionSpy).toHaveBeenCalledTimes(2);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        1,
        'ApprovalController:hasRequest',
        {
          id,
        },
      );

      expect(callActionSpy).toHaveBeenNthCalledWith(
        2,
        'ApprovalController:rejectRequest',
        id,
        errors.userRejectedRequest(),
      );
    });

    it('throws if the request does not exist', async () => {
      const options = getPermissionControllerOptions();
      const { messenger } = options;
      const id = 'foobar';

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockImplementationOnce(() => false);

      const controller = getDefaultPermissionController(options);

      await expect(
        async () => await controller.rejectPermissionsRequest(id),
      ).rejects.toThrow(new errors.PermissionsRequestNotFoundError(id));

      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        1,
        'ApprovalController:hasRequest',
        {
          id,
        },
      );
    });
  });

  describe('getEndowments', () => {
    it('gets the endowments', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.endowmentAnySubject]: {},
        },
      });

      expect(
        await controller.getEndowments(
          origin,
          PermissionNames.endowmentAnySubject,
        ),
      ).toStrictEqual(['endowment1']);
    });

    it('throws if the requested permission target is not an endowment', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      await expect(
        controller.getEndowments(
          origin,
          // @ts-expect-error Intentional destructive testing
          PermissionNames.wallet_getSecretArray,
        ),
      ).rejects.toThrow(
        new errors.EndowmentPermissionDoesNotExistError(
          PermissionNames.wallet_getSecretArray,
          origin,
        ),
      );
    });

    it('throws if the subject does not have the requisite permission', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      await expect(
        controller.getEndowments(origin, PermissionNames.endowmentAnySubject),
      ).rejects.toThrow(
        errors.unauthorized({
          data: { origin, targetName: PermissionNames.endowmentAnySubject },
        }),
      );
    });
  });

  describe('executeRestrictedMethod', () => {
    it('executes a restricted method', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      expect(
        await controller.executeRestrictedMethod(
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      ).toStrictEqual(['a', 'b', 'c']);
    });

    it('executes a restricted method with parameters', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_doubleNumber]: {},
        },
      });

      expect(
        await controller.executeRestrictedMethod(
          origin,
          PermissionNames.wallet_doubleNumber,
          [10],
        ),
      ).toBe(20);
    });

    it('executes a restricted method with a caveat', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [{ type: CaveatTypes.filterArrayResponse, value: ['b'] }],
          },
        },
      });

      expect(
        await controller.executeRestrictedMethod(
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      ).toStrictEqual(['b']);
    });

    it('executes a restricted method with multiple caveats', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [
              { type: CaveatTypes.filterArrayResponse, value: ['a', 'c'] },
              { type: CaveatTypes.reverseArrayResponse, value: null },
            ],
          },
        },
      });

      expect(
        await controller.executeRestrictedMethod(
          origin,
          PermissionNames.wallet_getSecretArray,
        ),
      ).toStrictEqual(['c', 'a']);
    });

    it('throws if the subject does not have the requisite permission', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      await expect(
        controller.executeRestrictedMethod(
          origin,
          PermissionNames.wallet_doubleNumber,
        ),
      ).rejects.toThrow(
        errors.unauthorized({
          data: { origin, method: PermissionNames.wallet_doubleNumber },
        }),
      );
    });

    it('throws if the requested method (i.e. target) does not exist', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      await expect(
        // @ts-expect-error Intentional destructive testing
        controller.executeRestrictedMethod(origin, 'wallet_getMeTacos'),
      ).rejects.toThrow(errors.methodNotFound('wallet_getMeTacos', { origin }));
    });

    it('throws if the restricted method returns undefined', async () => {
      const permissionSpecifications = getDefaultPermissionSpecifications();
      // @ts-expect-error Intentional destructive testing
      permissionSpecifications.wallet_doubleNumber.methodImplementation = () =>
        undefined;

      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(
        getPermissionControllerOptions({
          permissionSpecifications,
        }),
      );
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_doubleNumber]: {},
        },
      });

      await expect(
        controller.executeRestrictedMethod(
          origin,
          PermissionNames.wallet_doubleNumber,
        ),
      ).rejects.toThrow(
        new Error(
          `Internal request for method "${PermissionNames.wallet_doubleNumber}" as origin "${origin}" returned no result.`,
        ),
      );
    });
  });

  describe('controller actions', () => {
    it('action: PermissionController:clearPermissions', () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);
      const clearStateSpy = jest.spyOn(controller, 'clearState');

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(hasProperty(controller.state.subjects, 'foo')).toBe(true);

      messenger.call('PermissionController:clearPermissions');
      expect(clearStateSpy).toHaveBeenCalledTimes(1);
      expect(controller.state).toStrictEqual({ subjects: {} });
    });

    it('action: PermissionController:getEndowments', async () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);
      const getEndowmentsSpy = jest.spyOn(controller, 'getEndowments');

      await expect(
        messenger.call(
          'PermissionController:getEndowments',
          'foo',
          PermissionNames.endowmentAnySubject,
        ),
      ).rejects.toThrow(
        errors.unauthorized({
          data: {
            origin: 'foo',
            targetName: PermissionNames.endowmentAnySubject,
          },
        }),
      );

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          [PermissionNames.endowmentAnySubject]: {},
        },
      });

      expect(
        await messenger.call(
          'PermissionController:getEndowments',
          'foo',
          PermissionNames.endowmentAnySubject,
        ),
      ).toStrictEqual(['endowment1']);

      expect(
        await messenger.call(
          'PermissionController:getEndowments',
          'foo',
          PermissionNames.endowmentAnySubject,
          { arbitrary: 'requestData' },
        ),
      ).toStrictEqual(['endowment1']);

      expect(getEndowmentsSpy).toHaveBeenCalledTimes(3);
      expect(getEndowmentsSpy).toHaveBeenNthCalledWith(
        1,
        'foo',
        PermissionNames.endowmentAnySubject,
        undefined,
      );

      expect(getEndowmentsSpy).toHaveBeenNthCalledWith(
        2,
        'foo',
        PermissionNames.endowmentAnySubject,
        undefined,
      );

      expect(getEndowmentsSpy).toHaveBeenNthCalledWith(
        3,
        'foo',
        PermissionNames.endowmentAnySubject,
        { arbitrary: 'requestData' },
      );
    });

    it('action: PermissionController:getSubjectNames', () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);
      const getSubjectNamesSpy = jest.spyOn(controller, 'getSubjectNames');

      expect(
        messenger.call('PermissionController:getSubjectNames'),
      ).toStrictEqual([]);

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(
        messenger.call('PermissionController:getSubjectNames'),
      ).toStrictEqual(['foo']);
      expect(getSubjectNamesSpy).toHaveBeenCalledTimes(2);
    });

    it('action: PermissionController:hasPermission', () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);
      const hasPermissionSpy = jest.spyOn(controller, 'hasPermission');

      expect(
        messenger.call(
          'PermissionController:hasPermission',
          'foo',
          PermissionNames.wallet_getSecretArray,
        ),
      ).toBe(false);

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      expect(
        messenger.call(
          'PermissionController:hasPermission',
          'foo',
          PermissionNames.wallet_getSecretArray,
        ),
      ).toBe(true);

      expect(
        messenger.call(
          'PermissionController:hasPermission',
          'foo',
          PermissionNames.wallet_getSecretObject,
        ),
      ).toBe(false);

      expect(hasPermissionSpy).toHaveBeenCalledTimes(3);
      expect(hasPermissionSpy).toHaveBeenNthCalledWith(
        1,
        'foo',
        PermissionNames.wallet_getSecretArray,
      );

      expect(hasPermissionSpy).toHaveBeenNthCalledWith(
        2,
        'foo',
        PermissionNames.wallet_getSecretArray,
      );

      expect(hasPermissionSpy).toHaveBeenNthCalledWith(
        3,
        'foo',
        PermissionNames.wallet_getSecretObject,
      );
    });

    it('action: PermissionController:hasPermissions', () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);
      const hasPermissionsSpy = jest.spyOn(controller, 'hasPermissions');

      expect(messenger.call('PermissionController:hasPermissions', 'foo')).toBe(
        false,
      );

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(messenger.call('PermissionController:hasPermissions', 'foo')).toBe(
        true,
      );
      expect(hasPermissionsSpy).toHaveBeenCalledTimes(2);
      expect(hasPermissionsSpy).toHaveBeenNthCalledWith(1, 'foo');
      expect(hasPermissionsSpy).toHaveBeenNthCalledWith(2, 'foo');
    });

    it('action: PermissionController:getPermissions', () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);
      const getPermissionsSpy = jest.spyOn(controller, 'getPermissions');

      expect(
        messenger.call('PermissionController:getPermissions', 'foo'),
      ).toBeUndefined();

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });

      expect(
        Object.keys(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          messenger.call('PermissionController:getPermissions', 'foo')!,
        ),
      ).toStrictEqual(['wallet_getSecretArray']);

      expect(getPermissionsSpy).toHaveBeenCalledTimes(3);
      expect(getPermissionsSpy).toHaveBeenNthCalledWith(1, 'foo');
      expect(getPermissionsSpy).toHaveBeenNthCalledWith(2, 'foo');
    });

    it('action: PermissionController:revokeAllPermissions', () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });
      const revokeAllPermissionsSpy = jest.spyOn(
        controller,
        'revokeAllPermissions',
      );

      expect(controller.hasPermission('foo', 'wallet_getSecretArray')).toBe(
        true,
      );

      messenger.call('PermissionController:revokeAllPermissions', 'foo');

      expect(controller.hasPermission('foo', 'wallet_getSecretArray')).toBe(
        false,
      );
      expect(revokeAllPermissionsSpy).toHaveBeenCalledTimes(1);
      expect(revokeAllPermissionsSpy).toHaveBeenNthCalledWith(1, 'foo');
    });

    it('action: PermissionController:revokePermissionForAllSubjects', () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);

      controller.grantPermissions({
        subject: { origin: 'foo' },
        approvedPermissions: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      });
      const revokePermissionForAllSubjectsSpy = jest.spyOn(
        controller,
        'revokePermissionForAllSubjects',
      );

      expect(controller.hasPermission('foo', 'wallet_getSecretArray')).toBe(
        true,
      );

      messenger.call(
        'PermissionController:revokePermissionForAllSubjects',
        'wallet_getSecretArray',
      );

      expect(controller.hasPermission('foo', 'wallet_getSecretArray')).toBe(
        false,
      );
      expect(revokePermissionForAllSubjectsSpy).toHaveBeenCalledTimes(1);
      expect(revokePermissionForAllSubjectsSpy).toHaveBeenNthCalledWith(
        1,
        'wallet_getSecretArray',
      );
    });

    it('action: PermissionController:grantPermissions', async () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);

      const result = messenger.call('PermissionController:grantPermissions', {
        subject: { origin: 'foo' },
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        approvedPermissions: { wallet_getSecretArray: {} },
      });

      expect(result).toHaveProperty('wallet_getSecretArray');
      expect(controller.hasPermission('foo', 'wallet_getSecretArray')).toBe(
        true,
      );
    });

    it('action: PermissionController:grantPermissionsIncremental', async () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);

      const result = messenger.call(
        'PermissionController:grantPermissionsIncremental',
        {
          subject: { origin: 'foo' },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          approvedPermissions: { wallet_getSecretArray: {} },
        },
      );

      expect(result).toHaveProperty('wallet_getSecretArray');
      expect(controller.hasPermission('foo', 'wallet_getSecretArray')).toBe(
        true,
      );
    });

    it('action: PermissionController:requestPermissions', async () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);

      // requestPermissions calls unregistered action ApprovalController:addRequest that
      // can't be easily mocked, thus we mock the whole implementation
      const requestPermissionsSpy = jest
        .spyOn(controller, 'requestPermissions')
        .mockImplementation();

      await messenger.call(
        'PermissionController:requestPermissions',
        { origin: 'foo' },
        {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      );

      expect(requestPermissionsSpy).toHaveBeenCalledTimes(1);
    });

    it('action: PermissionController:requestPermissionsIncremental', async () => {
      const messenger = getUnrestrictedMessenger();
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
      });
      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);

      // requestPermissionsIncremental calls unregistered action ApprovalController:addRequest
      // that can't be easily mocked, thus we mock the whole implementation.
      const requestPermissionsIncrementalSpy = jest
        .spyOn(controller, 'requestPermissionsIncremental')
        .mockImplementation();

      await messenger.call(
        'PermissionController:requestPermissionsIncremental',
        { origin: 'foo' },
        {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          wallet_getSecretArray: {},
        },
      );

      expect(requestPermissionsIncrementalSpy).toHaveBeenCalledTimes(1);
    });

    it('action: PermissionController:updateCaveat', async () => {
      const messenger = getUnrestrictedMessenger();
      const state = {
        subjects: {
          'metamask.io': {
            origin: 'metamask.io',
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: {
                id: 'escwEx9JrOxGZKZk3RkL4',
                parentCapability: 'wallet_getSecretArray',
                invoker: 'metamask.io',
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['bar'] },
                ],
                date: 1632618373085,
              },
            },
          },
        },
      };
      const options = getPermissionControllerOptions({
        messenger: getPermissionControllerMessenger(messenger),
        state,
      });

      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(options);

      const updateCaveatSpy = jest.spyOn(controller, 'updateCaveat');

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await messenger.call(
        'PermissionController:updateCaveat',
        'metamask.io',
        'wallet_getSecretArray',
        CaveatTypes.filterArrayResponse,
        ['baz'],
      );

      expect(updateCaveatSpy).toHaveBeenCalledTimes(1);
      expect(controller.state).toStrictEqual({
        subjects: {
          'metamask.io': {
            origin: 'metamask.io',
            permissions: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              wallet_getSecretArray: {
                id: 'escwEx9JrOxGZKZk3RkL4',
                parentCapability: 'wallet_getSecretArray',
                invoker: 'metamask.io',
                caveats: [
                  { type: CaveatTypes.filterArrayResponse, value: ['baz'] },
                ],
                date: 1632618373085,
              },
            },
          },
        },
      });
    });
  });

  describe('permission middleware', () => {
    it('executes a restricted method', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {},
        },
      });

      const engine = new JsonRpcEngine();
      engine.push(controller.createPermissionMiddleware({ origin }));

      const response = await engine.handle({
        jsonrpc: '2.0',
        id: 1,
        method: PermissionNames.wallet_getSecretArray,
      });
      assertIsJsonRpcSuccess(response);

      expect(response.result).toStrictEqual(['a', 'b', 'c']);
    });

    it('executes a restricted method with a caveat', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [{ type: CaveatTypes.filterArrayResponse, value: ['b'] }],
          },
        },
      });

      const engine = new JsonRpcEngine();
      engine.push(controller.createPermissionMiddleware({ origin }));

      const response = await engine.handle({
        jsonrpc: '2.0',
        id: 1,
        method: PermissionNames.wallet_getSecretArray,
      });
      assertIsJsonRpcSuccess(response);

      expect(response.result).toStrictEqual(['b']);
    });

    it('executes a restricted method with multiple caveats', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_getSecretArray]: {
            caveats: [
              { type: CaveatTypes.filterArrayResponse, value: ['a', 'c'] },
              { type: CaveatTypes.reverseArrayResponse, value: null },
            ],
          },
        },
      });

      const engine = new JsonRpcEngine();
      engine.push(controller.createPermissionMiddleware({ origin }));

      const response = await engine.handle({
        jsonrpc: '2.0',
        id: 1,
        method: PermissionNames.wallet_getSecretArray,
      });
      assertIsJsonRpcSuccess(response);

      expect(response.result).toStrictEqual(['c', 'a']);
    });

    it('passes through unrestricted methods', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      const engine = new JsonRpcEngine();
      engine.push(controller.createPermissionMiddleware({ origin }));
      engine.push((_req, res, _next, end) => {
        res.result = 'success';
        end();
      });

      const response = await engine.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'wallet_unrestrictedMethod',
      });
      assertIsJsonRpcSuccess(response);

      expect(response.result).toBe('success');
    });

    it('throws an error if the subject has an invalid "origin" property', async () => {
      const controller = getDefaultPermissionController();

      ['', null, undefined, 2].forEach((invalidOrigin) => {
        expect(() =>
          controller.createPermissionMiddleware({
            // @ts-expect-error Intentional destructive testing
            origin: invalidOrigin,
          }),
        ).toThrow(
          new Error('The subject "origin" must be a non-empty string.'),
        );
      });
    });

    it('returns an error if the subject does not have the requisite permission', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      const engine = new JsonRpcEngine();
      engine.push(controller.createPermissionMiddleware({ origin }));

      const request: JsonRpcRequest<[]> = {
        jsonrpc: '2.0',
        id: 1,
        method: PermissionNames.wallet_getSecretArray,
      };

      const expectedError = errors.unauthorized({
        data: {
          origin,
          method: PermissionNames.wallet_getSecretArray,
          cause: null,
        },
        message:
          'Unauthorized to perform action. Try requesting the required permission(s) first. For more information, see: https://docs.metamask.io/guide/rpc-api.html#permissions',
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      const response = await engine.handle(request);
      assertIsJsonRpcFailure(response);
      expect(response.error).toMatchObject(
        expect.objectContaining(expectedError),
      );
    });

    it('returns an error if the method does not exist', async () => {
      const controller = getDefaultPermissionController();
      const origin = 'metamask.io';

      const engine = new JsonRpcEngine();
      engine.push(controller.createPermissionMiddleware({ origin }));

      const request: JsonRpcRequest<[]> = {
        jsonrpc: '2.0',
        id: 1,
        method: 'wallet_foo',
      };

      const expectedError = errors.methodNotFound('wallet_foo', { origin });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      const response = await engine.handle(request);
      assertIsJsonRpcFailure(response);
      const { error } = response;

      expect(error.message).toStrictEqual(expectedError.message);
      // @ts-expect-error We do expect this property to exist.
      expect(error.data?.cause).toBeNull();
      // @ts-expect-error Intentional destructive testing
      delete error.data.cause;
      expect(error).toMatchObject(expect.objectContaining(expectedError));
    });

    it('returns an error if the restricted method returns undefined', async () => {
      const permissionSpecifications = getDefaultPermissionSpecifications();
      // @ts-expect-error Intentional destructive testing
      permissionSpecifications.wallet_doubleNumber.methodImplementation = () =>
        undefined;

      const controller = new PermissionController<
        DefaultPermissionSpecifications,
        DefaultCaveatSpecifications
      >(
        getPermissionControllerOptions({
          permissionSpecifications,
        }),
      );
      const origin = 'metamask.io';

      controller.grantPermissions({
        subject: { origin },
        approvedPermissions: {
          [PermissionNames.wallet_doubleNumber]: {},
        },
      });

      const engine = new JsonRpcEngine();
      engine.push(controller.createPermissionMiddleware({ origin }));

      const request: JsonRpcRequest<[]> = {
        jsonrpc: '2.0',
        id: 1,
        method: PermissionNames.wallet_doubleNumber,
      };

      const expectedError = errors.internalError(
        `Request for method "${PermissionNames.wallet_doubleNumber}" returned undefined result.`,
        { request: { ...request } },
      );

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      const response = await engine.handle(request);
      assertIsJsonRpcFailure(response);
      const { error } = response;

      expect(error.message).toStrictEqual(expectedError.message);
      // @ts-expect-error We do expect this property to exist.
      expect(error.data?.cause).toBeNull();
      // @ts-expect-error Intentional destructive testing
      delete error.data.cause;
      expect(error).toMatchObject(expect.objectContaining(expectedError));
    });
  });
});
