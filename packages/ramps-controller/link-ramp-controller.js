#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Script to link ramps-controller for local development in MetaMask Mobile
 * This builds and copies the ramps-controller files to the mobile app's node_modules
 */

const rampsControllerPath = __dirname;
const mobileNodeModulesPath = path.join(__dirname, '..', '..', '..', 'metamask-mobile', 'node_modules', '@metamask');
const rampsControllerDestPath = path.join(mobileNodeModulesPath, 'ramps-controller');

// Always rebuild ramps-controller to ensure we have the latest changes
const distPath = path.join(rampsControllerPath, 'dist');
console.log('🔨 Building ramps-controller...');

// Clear any existing dist directory first
if (fs.existsSync(distPath)) {
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
if (!fs.existsSync(mobilePath)) {
  console.error('❌ MetaMask mobile app not found at expected location.');
  process.exit(1);
}

console.log('🔗 Linking ramps-controller for local development...');

// Create @metamask directory if it doesn't exist
if (!fs.existsSync(mobileNodeModulesPath)) {
  fs.mkdirSync(mobileNodeModulesPath, { recursive: true });
}

// Remove existing link if it exists
if (fs.existsSync(rampsControllerDestPath)) {
  fs.rmSync(rampsControllerDestPath, { recursive: true, force: true });
}

// Copy the ramps-controller package
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
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

// Copy the entire package
copyDir(rampsControllerPath, rampsControllerDestPath);

console.log('✅ Successfully linked ramps-controller to MetaMask mobile app!');
console.log(`📁 Copied to: ${rampsControllerDestPath}`);
console.log('🔄 Re-run this script when you make changes to automatically rebuild and relink.');