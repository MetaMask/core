import execa from 'execa';
import { promises as fs } from 'fs';
import path from 'path';
import { format as prettierFormat } from 'prettier';
import type { Options as PrettierOptions } from 'prettier';

import { MonorepoFiles, Placeholders } from './constants';
import type { FileMap } from './fs-utils';
import { readAllFiles, writeFiles } from './fs-utils';

const PACKAGE_TEMPLATE_DIR = path.join(__dirname, 'package-template');
const REPO_ROOT = path.join(__dirname, '..', '..');
const REPO_TS_CONFIG = path.join(REPO_ROOT, MonorepoFiles.TsConfig);
const REPO_TS_CONFIG_BUILD = path.join(REPO_ROOT, MonorepoFiles.TsConfigBuild);
const REPO_PACKAGE_JSON = path.join(REPO_ROOT, MonorepoFiles.PackageJson);
const PACKAGES_PATH = path.join(REPO_ROOT, 'packages');

const allPlaceholdersRegex = new RegExp(
  Object.values(Placeholders).join('|'),
  'gu',
);

// Our lint config really hates this, but it works.
// eslint-disable-next-line
const prettierRc = require(path.join(
  REPO_ROOT,
  '.prettierrc.js',
)) as PrettierOptions;

/**
 * The data necessary to create a new package.
 */
export type PackageData = Readonly<{
  name: string;
  description: string;
  directoryName: string;
  nodeVersions: string;
  currentYear: string;
}>;

/**
 * Data parsed from relevant monorepo files.
 */
type MonorepoFileData = {
  tsConfig: Tsconfig;
  tsConfigBuild: Tsconfig;
  nodeVersions: string;
};

/**
 * A parsed tsconfig file.
 */
type Tsconfig = {
  references: { path: string }[];
  [key: string]: unknown;
};

/**
 * A parsed package.json file.
 */
type PackageJson = {
  engines: { node: string };
  [key: string]: unknown;
};

/**
 * Reads the monorepo files that need to be parsed or modified.
 *
 * @returns A map of file paths to file contents.
 */
export async function readMonorepoFiles(): Promise<MonorepoFileData> {
  const [tsConfig, tsConfigBuild, packageJson] = await Promise.all([
    fs.readFile(REPO_TS_CONFIG, 'utf-8'),
    fs.readFile(REPO_TS_CONFIG_BUILD, 'utf-8'),
    fs.readFile(REPO_PACKAGE_JSON, 'utf-8'),
  ]);

  return {
    tsConfig: JSON.parse(tsConfig) as Tsconfig,
    tsConfigBuild: JSON.parse(tsConfigBuild) as Tsconfig,
    nodeVersions: (JSON.parse(packageJson) as PackageJson).engines.node,
  };
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
  if ((await fs.stat(packagePath)).isDirectory()) {
    throw new Error(`The package directory already exists: ${packagePath}`);
  }

  console.log('Writing package and monorepo files...');

  // Read and write package files
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
  // Add the new package to the lockfile.
  console.log('Running "yarn install"...');
  await execa('yarn', ['install'], { cwd: REPO_ROOT });

  // Add the new package to the root readme content
  console.log('Running "yarn update-readme-content"...');
  await execa('yarn', ['update-readme-content'], { cwd: REPO_ROOT });
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
  const { tsConfig, tsConfigBuild } = monorepoFileData;

  tsConfig.references.push({
    path: `./${path.basename(PACKAGES_PATH)}/${packageData.directoryName}`,
  });
  tsConfig.references.sort((a, b) => a.path.localeCompare(b.path));

  tsConfigBuild.references.push({
    path: `./${path.basename(PACKAGES_PATH)}/${
      packageData.directoryName
    }/tsconfig.build.json`,
  });
  tsConfigBuild.references.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Reads the template files and updates them with the specified package data.
 *
 * @param packageData - The package data.
 * @returns A map of file paths to processed template file contents.
 */
async function processTemplateFiles(
  packageData: PackageData,
): Promise<FileMap> {
  const result: FileMap = {};
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
  const { name, description, nodeVersions, currentYear } = packageData;

  return content.replace(allPlaceholdersRegex, (match) => {
    switch (match) {
      case Placeholders.CurrentYear:
        return currentYear;
      case Placeholders.NodeVersions:
        return nodeVersions;
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
