import {
  PermissionSpecificationMap,
  PermissionSpecificationConstraint,
} from './Permission';

export class PermissionTree {
  private readonly _permissionSpecifications: Readonly<
    PermissionSpecificationMap<PermissionSpecificationConstraint>
  >;

  private childToRootPermissionMap: Map<
    PermissionSpecificationConstraint['targetName'],
    PermissionSpecificationConstraint['targetName']
  >;

  private rootToChildrenLevelsMap: Map<
    PermissionSpecificationConstraint['targetName'],
    Map<PermissionSpecificationConstraint['targetName'], number>
  >;

  private rootPermissions: PermissionSpecificationConstraint['targetName'][];

  constructor(
    permissionSpecifications: PermissionSpecificationMap<PermissionSpecificationConstraint>,
  ) {
    this._permissionSpecifications = permissionSpecifications;
    this.childToRootPermissionMap = new Map();
    this.rootToChildrenLevelsMap = new Map();
    this.rootPermissions = [];
    this.createTree();
  }

  private createTree() {
    if (!this._permissionSpecifications) {
      throw new Error(
        'Can not create PermissionTree without permission specifications.',
      );
    }

    const rootNodes = this.calculateRootPermissions(
      this._permissionSpecifications,
    );

    if (rootNodes.length < 1) {
      throw new Error(
        'There were no root permissions identified. Please make sure there are no circular paths.',
      );
    }

    this.rootPermissions = rootNodes;

    for (const rootPermission of rootNodes) {
      this.traverseRoot(
        this._permissionSpecifications[rootPermission],
        rootPermission,
        0,
      );
    }
  }

  private calculateRootPermissions(
    permissions: PermissionSpecificationMap<PermissionSpecificationConstraint>,
  ) {
    const rootMap = new Map();
    for (const permissionName of Object.keys(permissions)) {
      rootMap.set(permissionName, true);
    }
    for (const permission of Object.values(permissions)) {
      this.traverseChildren(permission, rootMap);
    }
    return [...rootMap.entries()].reduce<
      PermissionSpecificationConstraint['targetName'][]
    >((rootPermissions, [permissionName, isRoot]) => {
      if (isRoot) {
        rootPermissions.push(permissionName);
      }
      return rootPermissions;
    }, []);
  }

  private traverseChildren(
    node: PermissionSpecificationConstraint,
    rootMap: Map<PermissionSpecificationConstraint['targetName'], boolean>,
    isChild = false,
  ) {
    if (isChild) {
      rootMap.set(node.targetName, false);
    }

    if (node.children) {
      for (const child of node.children) {
        const permission = this._permissionSpecifications[child];
        this.traverseChildren(permission, rootMap, true);
      }
    }
  }

  private traverseRoot(
    node: PermissionSpecificationConstraint,
    rootName: PermissionSpecificationConstraint['targetName'],
    level: number,
  ) {
    if (rootName !== node.targetName) {
      this.childToRootPermissionMap.set(node.targetName, rootName);
      const rootMap = this.rootToChildrenLevelsMap.get(rootName);
      if (!rootMap) {
        this.rootToChildrenLevelsMap.set(rootName, new Map());
      } else {
        rootMap.set(node.targetName, level);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        this.traverseRoot(
          this._permissionSpecifications[child],
          rootName,
          level + 1,
        );
      }
    }
  }

  getRootPermissions() {
    return this.rootPermissions;
  }

  getPermissionLevel(
    permissionName: PermissionSpecificationConstraint['targetName'],
  ) {
    const permissionRoot = this.childToRootPermissionMap.get(permissionName);
    if (!permissionRoot) {
      throw new Error(
        'The provided permission does not have a root permission.',
      );
    }
    return this.rootToChildrenLevelsMap
      .get(permissionRoot)
      ?.get(permissionName);
  }
}
