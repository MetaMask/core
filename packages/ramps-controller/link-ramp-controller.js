const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper function to check if path exists (replacement for deprecated fs.existsSync)
function pathExistsSync(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Script to link ramps-controller for local development in MetaMask Mobile
 * This builds and copies the ramps-controller files to the mobile app's node_modules
 */

const rampsControllerPath = __dirname;
const mobileNodeModulesPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'metamask-mobile',
  'node_modules',
  '@metamask',
);
const rampsControllerDestPath = path.join(
  mobileNodeModulesPath,
  'ramps-controller',
);

// Always rebuild ramps-controller to ensure we have the latest changes
const distPath = path.join(rampsControllerPath, 'dist');
console.log('🔨 Building ramps-controller...');

// Clear any existing dist directory first
if (pathExistsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('🗑️  Cleared existing build artifacts.');
}

try {
  execSync('yarn build', {
    cwd: rampsControllerPath,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' }
  });
  console.log('✅ ramps-controller built successfully!');
} catch (error) {
  console.error('❌ Failed to build ramps-controller:', error.message);
  process.exit(1);
}

// Check if mobile app exists
const mobilePath = path.join(__dirname, '..', '..', '..', 'metamask-mobile');
if (!pathExistsSync(mobilePath)) {
  console.error('❌ MetaMask mobile app not found at expected location.');
  process.exit(1);
}

console.log('🔗 Linking ramps-controller for local development...');

// Create @metamask directory if it doesn't exist
if (!pathExistsSync(mobileNodeModulesPath)) {
  fs.mkdirSync(mobileNodeModulesPath, { recursive: true });
}

// Remove existing link if it exists
if (pathExistsSync(rampsControllerDestPath)) {
  fs.rmSync(rampsControllerDestPath, { recursive: true, force: true });
}

// Files and directories to include (matches package.json "files" field + essential files)
const INCLUDED_ENTRIES = new Set([
  'dist',
  'package.json',
  'LICENSE',
  'README.md',
]);

// Copy a directory recursively
function copyDir(src, dest) {
  if (!pathExistsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy only the files needed for the package (per package.json "files" field)
fs.mkdirSync(rampsControllerDestPath, { recursive: true });

for (const entryName of INCLUDED_ENTRIES) {
  const srcPath = path.join(rampsControllerPath, entryName);
  const destPath = path.join(rampsControllerDestPath, entryName);

  if (!pathExistsSync(srcPath)) {
    continue;
  }

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    copyDir(srcPath, destPath);
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
}

console.log('✅ Successfully linked ramps-controller to MetaMask mobile app!');
console.log(`📁 Copied to: ${rampsControllerDestPath}`);
console.log('🔄 Re-run this script when you make changes to automatically rebuild and relink.');