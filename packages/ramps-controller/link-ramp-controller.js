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

// Directories and files to exclude when copying (development artifacts)
const EXCLUDED_ENTRIES = new Set([
  'node_modules',
  '.git',
  'src',
  'coverage',
  '.turbo',
  '.cache',
  'docs',
]);

// Copy the ramps-controller package, filtering out development directories
function copyDir(src, dest, isRoot = true) {
  if (!pathExistsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    // Skip excluded directories at root level
    if (isRoot && EXCLUDED_ENTRIES.has(entry.name)) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, false);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy the package (excludes node_modules, .git, src, and other dev directories)
copyDir(rampsControllerPath, rampsControllerDestPath);

console.log('✅ Successfully linked ramps-controller to MetaMask mobile app!');
console.log(`📁 Copied to: ${rampsControllerDestPath}`);
console.log('🔄 Re-run this script when you make changes to automatically rebuild and relink.');