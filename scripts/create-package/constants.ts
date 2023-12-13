/**
 * The monorepo files that need to be parsed or modified.
 */
export enum MonorepoFiles {
  PackageJson = 'package.json',
  TsConfig = 'tsconfig.json',
  TsConfigBuild = 'tsconfig.build.json',
}

/**
 * Placeholder values in package template files that need to be replaced with
 * actual values corresponding to the new package.
 */
export enum Placeholders {
  CurrentYear = 'CURRENT_YEAR',
  NodeVersions = 'NODE_VERSIONS',
  PackageName = 'PACKAGE_NAME',
  PackageDescription = 'PACKAGE_DESCRIPTION',
  PackageDirectoryName = 'PACKAGE_DIRECTORY_NAME',
}
