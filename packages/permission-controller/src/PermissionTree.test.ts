import {
  PermissionSpecificationConstraint,
  PermissionSpecificationMap,
} from './Permission';
import { PermissionTree } from './PermissionTree';

describe('PermissionTree', () => {
  const permissionSpecificationMap = {
    permissionA: {
      targetName: 'permissionA',
      children: ['permissionB', 'permissionC'],
    },
    permissionB: {
      targetName: 'permissionB',
      children: null,
    },
    permissionC: {
      targetName: 'permissionC',
      children: ['permissionD'],
    },
    permissionD: {
      targetName: 'permissionD',
      children: null,
    },
    permissionE: {
      targetName: 'permissionE',
      children: ['permissionF', 'permissionB'],
    },
    permissionF: {
      targetName: 'permissionF',
      children: null,
    },
  } as unknown as PermissionSpecificationMap<PermissionSpecificationConstraint>;
  const tree = new PermissionTree(permissionSpecificationMap);

  describe('constructor', () => {
    it('initializes a new PermissionTree', () => {
      expect(tree.getRootPermissions()).toStrictEqual([
        'permissionA',
        'permissionE',
      ]);
    });

    it('throws if there are no permission specifications passed to it', () => {
      expect(() => new PermissionTree(null as any)).toThrow(
        'Can not create PermissionTree without permission specifications.',
      );
    });
  });

  describe('getPopulatedRequest', () => {
    it('populates a permission request based on child permissions', () => {
      const permissionsRequest = {
        permissionA: {},
        permissionE: {},
      };
      expect(tree.getPopulatedRequest(permissionsRequest)).toStrictEqual({
        permissionA: {},
        permissionB: {},
        permissionC: {},
        permissionD: {},
        permissionE: {},
        permissionF: {},
      });
    });

    it('throws when a permission is requested with missing parent permissions', () => {
      const invalidPermissionsRequest = {
        permissionB: {},
        permissionD: {},
      };

      expect(() => tree.getPopulatedRequest(invalidPermissionsRequest)).toThrow(
        'Invalid permission request, child permissions must also have their parent permissions requested.',
      );
    });
  });
});
