#!yarn ts-node

import fs from 'fs';
import path from 'path';

/**
 * Write a preview build message to the path "preview-build-message.txt".
 */
async function main() {
  const packageMap: Record<string, string> = {};

  const packagesDirectory = path.resolve(__dirname, '../packages');
  const packageEntries = await fs.promises.readdir(packagesDirectory, {
    withFileTypes: true,
  });
  const packageDirectories = packageEntries.filter((entry) =>
    entry.isDirectory(),
  );
  const packageDirectoryNames = packageDirectories.map((entry) => entry.name);
  const packageManifestsPaths = packageDirectoryNames.map((name) =>
    path.join(packagesDirectory, name, 'package.json'),
  );
  for (const manifestPath of packageManifestsPaths) {
    const rawManifest = await fs.promises.readFile(manifestPath, {
      encoding: 'utf8',
    });
    const { name, version } = JSON.parse(rawManifest);

    packageMap[name] = version;
  }

  const previewBuildMessage = `
Preview builds have been published. [See these instructions]() for more information about preview builds.

<details>

<summary>Expand for full list of packages and versions:</summary>


\`\`\`
${JSON.stringify(packageMap, null, 2)}
\`\`\`

</details>
`;

  const messagePath = path.resolve(__dirname, '../preview-build-message.txt');
  await fs.promises.writeFile(messagePath, previewBuildMessage);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
