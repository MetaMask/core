import type {
  PermissionSpecificationMap,
  PermissionSpecificationConstraint,
  RequestedPermissions,
} from './Permission';

/**
 * The Permission Tree. This class assumes an instance of the Permission
 * Controller passing in permissions specifications for the tree to analyze.
 */
export class PermissionTree {
  private readonly _permissionSpecifications: Readonly<
    PermissionSpecificationMap<PermissionSpecificationConstraint>
  >;

  private readonly childToParentPermissionMap: Readonly<
    Map<
      PermissionSpecificationConstraint['targetName'],
      Set<PermissionSpecificationConstraint['targetName']>
    >
  >;

  private rootPermissions: PermissionSpecificationConstraint['targetName'][];

  /**
   * Constructs the PermissionTree.
   *
   * @param permissionSpecifications - Permission specification map passed in from the Permission Controller.
   */
  constructor(
    permissionSpecifications: PermissionSpecificationMap<PermissionSpecificationConstraint>,
  ) {
    this._permissionSpecifications = permissionSpecifications;
    this.childToParentPermissionMap = new Map();
    this.rootPermissions = [];
    this.createTree();
  }

  /**
   * Helper function to construct the PermissionTree.
   * It identifies the root permissions and marks the child -> parent relationships
   * that exist amongst the specifications passed in.
   */
  private createTree() {
    if (!this._permissionSpecifications) {
      throw new Error(
        'Can not create PermissionTree without permission specifications.',
      );
    }

    const rootNodes = this.calculateRootPermissions(
      this._permissionSpecifications,
    );

    this.rootPermissions = rootNodes;

    for (const rootPermission of rootNodes) {
      this.traverseRoot(
        this._permissionSpecifications[rootPermission],
        rootPermission,
      );
    }
  }

  /**
   * Calculates the root permissions by walking through permissions and their children,
   * it will then mark any permission that is called from a parent as NOT root.
   *
   * @param permissions - Map of the permission specifications.
   * @returns The root permissions amongst the permissions passed in.
   */

  private calculateRootPermissions(
    permissions: PermissionSpecificationMap<PermissionSpecificationConstraint>,
  ) {
    const rootMap = new Map();
    const visitedNodes = new Set<
      PermissionSpecificationConstraint['targetName']
    >();

    for (const permissionName of Object.keys(permissions)) {
      rootMap.set(permissionName, true);
    }

    for (const permission of Object.values(permissions)) {
      this.traverseNode(permission, rootMap, visitedNodes);
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

  /**
   * Traverses nodes and marks them as not root if the function call is coming from a parent.
   *
   * @param node - The permission specification.
   * @param rootMap - A map of all nodes to whether or not they're a root node.
   * @param visitedNodes - Nodes that have already been visited in the recursion tree.
   * @param isChild - Boolean to determine if the node is a child.
   */
  private traverseNode(
    node: PermissionSpecificationConstraint,
    rootMap: Map<PermissionSpecificationConstraint['targetName'], boolean>,
    visitedNodes: Set<PermissionSpecificationConstraint['targetName']>,
    isChild = false,
  ) {
    if (!visitedNodes.has(node.targetName)) {
      if (isChild) {
        rootMap.set(node.targetName, false);
      }

      visitedNodes.add(node.targetName);

      if (node.children) {
        for (const child of node.children) {
          const permission = this._permissionSpecifications[child];
          this.traverseNode(permission, rootMap, visitedNodes, true);
        }
      }
    }
  }

  /**
   * Traverses a permission chain from its root node. This function is used
   * to mark the relationships between child -> parent.
   *
   * @param node - The permission specification.
   * @param rootName - The name of the parent permission.
   */
  private traverseRoot(
    node: PermissionSpecificationConstraint,
    rootName: PermissionSpecificationConstraint['targetName'],
  ) {
    if (rootName !== node.targetName) {
      const parents = this.childToParentPermissionMap.get(node.targetName);
      if (!parents) {
        this.childToParentPermissionMap.set(node.targetName, new Set(rootName));
      } else {
        parents.add(rootName);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.traverseRoot(
          this._permissionSpecifications[child],
          node.targetName,
        );
      }
    }
  }

  /**
   * Helper function to help determine if a permission request is valid by
   * determining if any of the parent permissions it belongs to were also
   * included in the request.
   *
   * @param approvedPermissions - The permission request, this is at the point of `grantPermissions` in the Permission Controller.
   * @returns A boolean indiciating if the request has valid permission groups.
   */
  private hasValidPermissionGroups(approvedPermissions: RequestedPermissions) {
    const permissions = Object.keys(approvedPermissions);
    for (const permission of permissions) {
      const parents = this.childToParentPermissionMap.get(permission);
      if (
        parents &&
        !permissions.some((requestedPermission) =>
          parents.has(requestedPermission),
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * This function returns the root permissions that were determined at the point
   * the PermissionTree was created.
   *
   * @returns The root permissions.
   */
  getRootPermissions() {
    return this.rootPermissions;
  }

  /**
   * Takes a permission request and populates it with all of the permissions' children.
   *
   * @param approvedPermissions - The permission request.
   * @returns A populated permission request.
   */
  getPopulatedRequest(approvedPermissions: RequestedPermissions) {
    if (!this.hasValidPermissionGroups(approvedPermissions)) {
      throw new Error(
        'Invalid permission request, child permissions must also have their parent permissions requested.',
      );
    }

    const populatedRequest = { ...approvedPermissions };

    const traverseRequestedPermissions = (
      node: PermissionSpecificationConstraint,
    ) => {
      if (!populatedRequest[node.targetName]) {
        populatedRequest[node.targetName] = {};
      }

      if (node.children) {
        for (const child of node.children) {
          const childNode = this._permissionSpecifications[child];
          if (childNode) {
            traverseRequestedPermissions(childNode);
          }
        }
      }
    };

    for (const approvedPermission of Object.keys(approvedPermissions)) {
      const permissionNode = this._permissionSpecifications[approvedPermission];
      if (permissionNode) {
        traverseRequestedPermissions(permissionNode);
      }
    }

    return populatedRequest;
  }
}
