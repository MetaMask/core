import execa from 'execa';
import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { format as prettierFormat } from 'prettier';
import { coerce as semverCoerce } from 'semver';

import prettierRc from '../../.prettierrc';
import { MonorepoFiles, Placeholders } from './constants';
import { readAllFiles, writeFiles } from './fs-utils';

const PACKAGE_TEMPLATE_DIR = path.join(__dirname, 'package-template');
const REPO_ROOT = path.join(__dirname, '..', '..');
const REPO_TS_CONFIG = path.join(REPO_ROOT, MonorepoFiles.TsConfig);
const REPO_TS_CONFIG_BUILD = path.join(REPO_ROOT, MonorepoFiles.TsConfigBuild);
const REPO_NVMRC = path.join(REPO_ROOT, MonorepoFiles.Nvmrc);
const PACKAGES_PATH = path.join(REPO_ROOT, 'packages');

const allPlaceholdersRegex = new RegExp(
  Object.values(Placeholders).join('|'),
  'gu',
);

/**
 * The data necessary to create a new package.
 */
export type PackageData = Readonly<{
  name: string;
  description: string;
  directoryName: string;
  nodeVersion: string;
  currentYear: string;
}>;

/**
 * Data parsed from relevant monorepo files.
 */
type MonorepoFileData = {
  tsConfig: Tsconfig;
  tsConfigBuild: Tsconfig;
  nodeVersion: string;
};

/**
 * A parsed tsconfig file.
 */
type Tsconfig = {
  references: { path: string }[];
  [key: string]: unknown;
};

/**
 * Reads the monorepo files that need to be parsed or modified.
 *
 * @returns A map of file paths to file contents.
 */
export async function readMonorepoFiles(): Promise<MonorepoFileData> {
  const [tsConfig, tsConfigBuild, nvmrc] = await Promise.all([
    fs.readFile(REPO_TS_CONFIG, 'utf-8'),
    fs.readFile(REPO_TS_CONFIG_BUILD, 'utf-8'),
    fs.readFile(REPO_NVMRC, 'utf-8'),
  ]);

  return {
    tsConfig: JSON.parse(tsConfig) as Tsconfig,
    tsConfigBuild: JSON.parse(tsConfigBuild) as Tsconfig,
    nodeVersion: getNodeVersion(nvmrc),
  };
}

/**
 * Extracts the full semver version from an .nvmrc file.
 *
 * @param nvmrc - The contents of a .nvmrc file.
 * @returns The full semver version.
 */
function getNodeVersion(nvmrc: string): string {
  // .nvmrc files should only contain a single line with a semver version.
  // The version may be prefixed with a "v", and may not be a full semver version.
  // Therefore we need to coerce the value.
  const semver = semverCoerce(nvmrc.trim().replace(/^v/u, ''));
  if (!semver) {
    throw new Error(`Invalid .nvmrc: ${nvmrc}`);
  }
  return semver.version;
}

/**
 * Finalizes package and repo files, writes them to disk, and performs necessary
 * postprocessing (e.g. running `yarn install`).
 *
 * @param packageData - The package data.
 * @param monorepoFileData - The monorepo file data.
 */
export async function finalizeAndWriteData(
  packageData: PackageData,
  monorepoFileData: MonorepoFileData,
) {
  const packagePath = path.join(PACKAGES_PATH, packageData.directoryName);
  if (existsSync(packagePath)) {
    throw new Error(`The package directory already exists: ${packagePath}`);
  }

  console.log('Writing package and monorepo files...');

  // Read and write package files
  await createPackageDirectory(packagePath);
  await writeFiles(packagePath, await processTemplateFiles(packageData));

  // Write monorepo files
  updateTsConfigs(packageData, monorepoFileData);
  await writeJsonFile(
    REPO_TS_CONFIG,
    JSON.stringify(monorepoFileData.tsConfig),
  );
  await writeJsonFile(
    REPO_TS_CONFIG_BUILD,
    JSON.stringify(monorepoFileData.tsConfigBuild),
  );

  // Postprocess
  // Ensure the new package is added to the lockfile.
  console.log('Running "yarn install"...');
  await execa('yarn', ['install'], { cwd: REPO_ROOT });

  // Ensures that the new package is included in the dependency graph.
  console.log('Running "yarn generate-dependency-graph"...');
  await execa('yarn', ['generate-dependency-graph'], { cwd: REPO_ROOT });
}

/**
 * Formats a JSON file with `prettier` and writes it to disk.
 *
 * @param filePath - The absolute path of the file to write.
 * @param fileContent - The file content to write.
 */
async function writeJsonFile(
  filePath: string,
  fileContent: string,
): Promise<void> {
  await fs.writeFile(
    filePath,
    prettierFormat(fileContent, { ...prettierRc, parser: 'json' }),
  );
}

/**
 * Updates the tsconfig file data in place to include the new package.
 *
 * @param packageData - = The package data.
 * @param monorepoFileData - The monorepo file data.
 */
function updateTsConfigs(
  packageData: PackageData,
  monorepoFileData: MonorepoFileData,
): void {
  [monorepoFileData.tsConfig, monorepoFileData.tsConfigBuild].forEach(
    (config) => {
      config.references.push({
        path: `./${path.basename(PACKAGES_PATH)}/${packageData.directoryName}`,
      });

      config.references.sort((a, b) => a.path.localeCompare(b.path));
    },
  );
}

/**
 * Creates a new package directory in the monorepo, including the `/src` directory.
 *
 * @param packagePath - The absolute path of the package directory to create.
 */
async function createPackageDirectory(packagePath: string) {
  await fs.mkdir(path.join(packagePath, 'src'), { recursive: true });
}

/**
 * Reads the template files and updates them with the specified package data.
 *
 * @param packageData - The package data.
 * @returns A map of file paths to processed template file contents.
 */
async function processTemplateFiles(
  packageData: PackageData,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const templateFiles = await readAllFiles(PACKAGE_TEMPLATE_DIR);

  for (const [relativePath, content] of Object.entries(templateFiles)) {
    result[relativePath] = processTemplateContent(packageData, content);
  }

  return result;
}

/**
 * Processes the template file content by replacing placeholders with relevant values
 * from the specified package data.
 *
 * @param packageData - The package data.
 * @param content - The template file content.
 * @returns The processed template file content.
 */
function processTemplateContent(
  packageData: PackageData,
  content: string,
): string {
  const { name, description, nodeVersion, currentYear } = packageData;

  return content.replace(allPlaceholdersRegex, (match) => {
    switch (match) {
      case Placeholders.CurrentYear:
        return currentYear;
      case Placeholders.NodeVersion:
        return nodeVersion;
      case Placeholders.PackageName:
        return name;
      case Placeholders.PackageDescription:
        return description;
      case Placeholders.PackageDirectoryName:
        return packageData.directoryName;
      /* istanbul ignore next: should be impossible */
      default:
        throw new Error(`Unknown placeholder: ${match}`);
    }
  });
}
