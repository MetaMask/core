import { getPluginConfiguration } from '@yarnpkg/cli';
import { Configuration, Project, structUtils } from '@yarnpkg/core';
import { ppath } from '@yarnpkg/fslib';

/**
 * Package-level information about a workspace in the monorepo.
 */
type WorkspacePackage = {
  name: string;
  version: string;
  isPrivate: boolean;
  peerDependencies: {
    name: string;
    range: string;
  }[];
};

/**
 * A node in the tree that this script builds in order to generate output (or
 * the whole tree itself).
 */
type TreeNode = {
  name: string;
  children: TreeNode[];
};

// Kick off the script.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 *
 * Uses Yarn to retrieve all of the workspace packages in this monorepo along
 * with peer dependencies on other workspace packages, then spits out a tree
 * view.
 */
async function main() {
  const workspacePackages = await getWorkspacePackages();
  console.log(produceTreeLines(generateTree(workspacePackages)).join('\n'));
}

/**
 * Uses Yarn to gather the Yarn workspaces inside of this project (the packages
 * that are matched by the `workspaces` field inside of `package.json`) and the
 * peer dependencies on other workspace packages.
 *
 * @returns The list of workspaces.
 */
async function getWorkspacePackages(): Promise<WorkspacePackage[]> {
  const cwd = ppath.resolve('..', ppath.cwd());
  const configuration = await Configuration.find(cwd, getPluginConfiguration());
  const { project } = await Project.find(configuration, cwd);

  return project.workspaces
    .map((workspace) => {
      const packageIdent = workspace.manifest.name;
      if (packageIdent === null) {
        throw new Error('Not all workspaces have names');
      }

      const packageVersion = workspace.manifest.version;
      if (packageVersion === null) {
        throw new Error('Not all workspaces have names');
      }

      const packageName = structUtils.stringifyIdent(packageIdent);

      const workspacePeerDependencies = Array.from(
        workspace.manifest.peerDependencies.values(),
      )
        .filter((peerDependency) => {
          return project.tryWorkspaceByDescriptor(peerDependency) !== null;
        })
        .map((peerDependency) => {
          return {
            name: structUtils.stringifyIdent(peerDependency),
            range: peerDependency.range,
          };
        });

      return {
        name: packageName,
        version: packageVersion,
        isPrivate: workspace.manifest.private,
        peerDependencies: workspacePeerDependencies,
      };
    })
    .filter((workspace) => !workspace.isPrivate);
}

/**
 * Constructs a tree of the workspace packages and internal peer dependencies.
 *
 * @param workspacePackages - The list of packages produced in
 * `getWorkspacePackages`.
 * @returns The tree.
 */
function generateTree(workspacePackages: WorkspacePackage[]): TreeNode {
  return {
    name: '$root$',
    children: workspacePackages.map((workspacePackage) => {
      return {
        name: `${workspacePackage.name} ${workspacePackage.version}`,
        children: workspacePackage.peerDependencies.map((peerDependency) => {
          return {
            name: `${peerDependency.name} ${peerDependency.range}`,
            children: [],
          };
        }),
      };
    }),
  };
}

/**
 * Converts a tree generated in `generateTree` to ASCII format.
 *
 * @param tree - The tree.
 * @param options - Options which are passed on recursive calls to this
 * function.
 * @param options.level - Trees are nested; this represents the level of the
 * particular tree within the whole.
 * @param options.isLastOfParent - If this tree is a child of a parent node,
 * this represents whether or not that child was the last of its parent. This is
 * used to know how to mark the tree in the ASCII version of the tree.
 * @returns The tree.
 */
function produceTreeLines(
  tree: TreeNode,
  {
    level = 0,
    isLastOfParent = false,
  }: { level?: number; isLastOfParent?: boolean } = {},
): string[] {
  return tree.children
    .flatMap((child, index) => {
      const isChildLastOfParent = index === tree.children.length - 1;
      const icon = isChildLastOfParent ? '└╴' : '├╴';
      return [
        `${icon} ${child.name}`,
        ...produceTreeLines(child, {
          level: level + 1,
          isLastOfParent: isChildLastOfParent,
        }),
      ];
    })
    .map((line) => {
      const indentation = repeat(isLastOfParent ? '   ' : '│  ', level);
      return `${indentation}${line}`;
    });
}

/**
 * Repeats a string N number of times.
 *
 * @param string - The string to repeat.
 * @param times - How many times to repeat it.
 * @returns The string, repeated.
 */
function repeat(string: string, times: number) {
  return Array(times).fill(string).join('');
}
