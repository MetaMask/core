/**
 * The monorepo files that need to be parsed or modified.
 */
export enum MonorepoFiles {
  TsConfig = 'tsconfig.json',
  TsConfigBuild = 'tsconfig.build.json',
  Nvmrc = '.nvmrc',
}

/**
 * Placeholder values in package template files that need to be replaced with
 * actual values corresponding to the new package.
 */
export enum Placeholders {
  CurrentYear = 'CURRENT_YEAR',
  NodeVersion = 'NODE_VERSION',
  PackageName = 'PACKAGE_NAME',
  PackageDescription = 'PACKAGE_DESCRIPTION',
  PackageDirectoryName = 'PACKAGE_DIRECTORY_NAME',
}
