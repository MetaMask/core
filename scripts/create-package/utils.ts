import execa from 'execa';
import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { coerce as semverCoerce } from 'semver';

enum MonorepoFiles {
  TsConfig = 'tsconfig.json',
  TsConfigBuild = 'tsconfig.build.json',
  Nvmrc = '.nvmrc',
}

const PACKAGE_TEMPLATE_DIR = path.join(__dirname, 'package-template');
const REPO_ROOT = path.join(__dirname, '..', '..');
const MONOREPO_TS_CONFIG = path.join(REPO_ROOT, MonorepoFiles.TsConfig);
const MONOREPO_TS_CONFIG_BUILD = path.join(
  REPO_ROOT,
  MonorepoFiles.TsConfigBuild,
);
const MONOREPO_NVMRC = path.join(REPO_ROOT, MonorepoFiles.Nvmrc);
const PACKAGES_PATH = path.join(REPO_ROOT, 'packages');

enum Placeholders {
  CURRENT_YEAR = 'CURRENT_YEAR',
  NODE_VERSION = 'NODE_VERSION',
  PACKAGE_NAME = 'PACKAGE_NAME',
  PACKAGE_DESCRIPTION = 'PACKAGE_DESCRIPTION',
  PACKAGE_DIRECTORY_NAME = 'PACKAGE_DIRECTORY_NAME',
}

/**
 * The data necessary to create a new package.
 */
export type PackageData = Readonly<{
  name: string;
  description: string;
  mitLicense: boolean;
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
    fs.readFile(MONOREPO_TS_CONFIG, 'utf-8'),
    fs.readFile(MONOREPO_TS_CONFIG_BUILD, 'utf-8'),
    fs.readFile(MONOREPO_NVMRC, 'utf-8'),
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

  // Write package files
  updateTsConfigs(packageData, monorepoFileData);
  await createPackageDirectory(packagePath);
  await writeFiles(packagePath, await processTemplateFiles(packageData));

  // Write monorepo files
  await fs.writeFile(
    MONOREPO_TS_CONFIG,
    JSON.stringify(monorepoFileData.tsConfig, null, 2),
  );
  await fs.writeFile(
    MONOREPO_TS_CONFIG_BUILD,
    JSON.stringify(monorepoFileData.tsConfigBuild, null, 2),
  );

  // Postprocess
  await execa('yarn', ['install'], { cwd: REPO_ROOT });
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
 * Reads the template files and processes them with the specified package data.
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

  return content
    .replace(new RegExp(Placeholders.PACKAGE_NAME, 'gu'), name)
    .replace(new RegExp(Placeholders.PACKAGE_DESCRIPTION, 'gu'), description)
    .replace(
      new RegExp(Placeholders.PACKAGE_DIRECTORY_NAME, 'gu'),
      packageData.directoryName,
    )
    .replace(new RegExp(Placeholders.NODE_VERSION, 'gu'), nodeVersion)
    .replace(new RegExp(Placeholders.CURRENT_YEAR, 'gu'), currentYear);
}

/**
 * Recursively reads a directory and returns a map of file paths to file contents.
 * The file paths are relative to the specified directory.
 *
 * @param baseDir - An absolute path to the directory to read files from.
 * @returns A map of file paths to file contents.
 */
async function readAllFiles(baseDir: string): Promise<Record<string, string>> {
  const readAllFilesRecur = async (dir: string) => {
    const result: Record<string, string> = {};
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        const subDirResult = await readAllFilesRecur(fullPath);
        Object.assign(result, subDirResult);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath, 'utf-8');
        result[relativePath] = content;
      }
    }

    return result;
  };

  return await readAllFilesRecur(baseDir);
}

/**
 * Writes the specified files to disk.
 *
 * @param parentDirectory - The absolute path of the parent directory to write the files to.
 * @param fileMap - A map of file paths to file contents. The file paths must be relative to
 * the parent directory.
 */
async function writeFiles(
  parentDirectory: string,
  fileMap: Record<string, string>,
) {
  for (const [relativePath, content] of Object.entries(fileMap)) {
    const fullPath = path.join(parentDirectory, relativePath);
    await fs.writeFile(fullPath, content);
  }
}
