import { promises as fs } from 'fs';
import path from 'path';

/**
 * Recursively reads a directory and returns a map of file paths to file contents.
 * The file paths are relative to the specified directory.
 *
 * @param baseDir - An absolute path to the directory to read files from.
 * @returns A map of file paths to file contents.
 */
export async function readAllFiles(
  baseDir: string,
): Promise<Record<string, string>> {
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
 * Writes the specified files to disk. Assumes that the relevant directories already exist.
 *
 * @param parentDirectory - The absolute path of the parent directory to write the files to.
 * @param fileMap - A map of file paths to file contents. The file paths must be relative to
 * the parent directory.
 */
export async function writeFiles(
  parentDirectory: string,
  fileMap: Record<string, string>,
) {
  for (const [relativePath, content] of Object.entries(fileMap)) {
    const fullPath = path.join(parentDirectory, relativePath);
    await fs.writeFile(fullPath, content);
  }
}
