import {
  PermissionSpecificationConstraint,
  PermissionSpecificationMap,
} from './Permission';
import { PermissionTree } from './PermissionTree';

describe('PermissionTree', () => {
  describe('constructor', () => {
    it('initializes a new PermissionTree', () => {
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
          children: ['permissionF'],
        },
        permissionF: {
          targetName: 'permissionF',
          children: null,
        },
      } as unknown as PermissionSpecificationMap<PermissionSpecificationConstraint>;
      const tree = new PermissionTree(permissionSpecificationMap);
      expect(tree.getRootPermissions()).toStrictEqual([
        'permissionA',
        'permissionE',
      ]);
      expect(tree.getPermissionLevel('permissionB')).toStrictEqual(1);
      expect(tree.getPermissionLevel('permissionC')).toStrictEqual(1);
      expect(tree.getPermissionLevel('permissionD')).toStrictEqual(2);
      expect(tree.getPermissionLevel('permissionF')).toStrictEqual(1);
    });
  });
});
