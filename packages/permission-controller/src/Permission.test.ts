import { Messenger } from '@metamask/messenger';

import type {
  CaveatConstraint,
  PermissionConstraint,
  PermissionSpecificationBuilder,
  RestrictedMethodSpecificationConstraint,
} from '.';
import { constructPermission, PermissionType } from '.';
import { createRestrictedMethodMessenger } from './createRestrictedMethodMessenger';
import { findCaveat } from './Permission';

describe('constructPermission', () => {
  it('constructs a permission', () => {
    const invoker = 'foo.io';
    const target = 'wallet_bar';

    expect(
      constructPermission({
        invoker,
        target,
      }),
    ).toMatchObject(
      expect.objectContaining({
        id: expect.any(String),
        parentCapability: target,
        invoker,
        caveats: null,
        date: expect.any(Number),
      }),
    );
  });

  it('constructs a permission with caveats', () => {
    const invoker = 'foo.io';
    const target = 'wallet_bar';
    const caveats: [CaveatConstraint] = [{ type: 'foo', value: 'bar' }];

    expect(
      constructPermission({
        invoker,
        target,
        caveats,
      }),
    ).toMatchObject(
      expect.objectContaining({
        id: expect.any(String),
        parentCapability: target,
        invoker,
        caveats: [...caveats],
        date: expect.any(Number),
      }),
    );
  });
});

describe('findCaveat', () => {
  it('finds a caveat', () => {
    const permission: PermissionConstraint = {
      id: 'arbitraryId',
      parentCapability: 'arbitraryMethod',
      invoker: 'arbitraryInvoker',
      date: Date.now(),
      caveats: [{ type: 'foo', value: 'bar' }],
    };

    expect(findCaveat(permission, 'foo')).toStrictEqual({
      type: 'foo',
      value: 'bar',
    });
  });

  it('returns undefined if the specified caveat does not exist', () => {
    const permission: PermissionConstraint = {
      id: 'arbitraryId',
      parentCapability: 'arbitraryMethod',
      invoker: 'arbitraryInvoker',
      date: Date.now(),
      caveats: [{ type: 'foo', value: 'bar' }],
    };

    expect(findCaveat(permission, 'doesNotExist')).toBeUndefined();
  });

  it('returns undefined if the permission has no caveats', () => {
    const permission: PermissionConstraint = {
      id: 'arbitraryId',
      parentCapability: 'arbitraryMethod',
      invoker: 'arbitraryInvoker',
      date: Date.now(),
      caveats: null,
    };

    expect(findCaveat(permission, 'doesNotExist')).toBeUndefined();
  });
});

describe('permission specification messenger option', () => {
  type HostAction = {
    type: 'Host:computeAnswer';
    handler: () => number;
  };

  const targetName = 'wallet_getAnswer';

  type HostRootMessenger = Messenger<'Root', HostAction>;

  type SpecMessenger = ReturnType<
    typeof createRestrictedMethodMessenger<
      typeof targetName,
      HostRootMessenger,
      readonly ['Host:computeAnswer']
    >
  >;

  const buildSpecificationBuilder = (): PermissionSpecificationBuilder<
    PermissionType.RestrictedMethod,
    { messenger: SpecMessenger },
    RestrictedMethodSpecificationConstraint
  > => {
    return ({ messenger }) => ({
      permissionType: PermissionType.RestrictedMethod,
      targetName,
      allowedCaveats: null,
      methodImplementation: (): number => messenger.call('Host:computeAnswer'),
    });
  };

  const getRootMessenger = (): HostRootMessenger => {
    const rootMessenger = new Messenger<'Root', HostAction>({
      namespace: 'Root',
    });
    const hostMessenger = new Messenger<
      'Host',
      HostAction,
      never,
      typeof rootMessenger
    >({ namespace: 'Host', parent: rootMessenger });
    hostMessenger.registerActionHandler('Host:computeAnswer', () => 42);
    return rootMessenger;
  };

  it('invokes the spec-declared action via the scoped messenger', () => {
    const rootMessenger = getRootMessenger();
    const specificationBuilder = buildSpecificationBuilder();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: targetName,
      actionNames: ['Host:computeAnswer'] as const,
    });

    const specification = specificationBuilder({ messenger });

    expect(specification.targetName).toBe(targetName);
    expect(specification.allowedCaveats).toBeNull();
    expect(specification.permissionType).toBe(PermissionType.RestrictedMethod);
    expect(
      specification.methodImplementation({
        method: targetName,
        params: [],
        context: { origin: 'example.com' },
      }),
    ).toBe(42);
  });
});
