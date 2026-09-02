import { Project, ts } from 'ts-morph';

/**
 * Create a ts-morph Project configured for reading messenger capability types.
 *
 * Both discovery strategies share this: `scan` adds every file it can find so
 * the checker can resolve cross-file references, while `root-messenger` adds
 * only the entry files and lets the checker pull in the rest.
 *
 * @returns A new ts-morph Project.
 */
export function createProject(): Project {
  return new Project({
    compilerOptions: {
      allowJs: false,
      noEmit: true,
      // Match the project's permissive defaults — we only need symbol
      // resolution, not full typechecking, so a project's own strictness
      // settings shouldn't be able to fail the docs build.
      strict: false,
      skipLibCheck: true,
      // Explicit module options so cross-file symbol resolution works
      // regardless of the host process's tsconfig.
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
  });
}
