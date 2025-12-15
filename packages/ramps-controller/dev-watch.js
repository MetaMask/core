#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Simple file watcher for ramps-controller development
 * Watches src/ directory and runs link script on changes
 */

const srcDir = path.join(__dirname, 'src');
const linkScript = path.join(__dirname, 'link-ramp-controller.js');

console.log('👀 Watching ramps-controller src/ directory...');
console.log('📁 Press Ctrl+C to stop watching\n');

// Keep track of last build time to avoid rapid rebuilds
let lastBuildTime = 0;
const BUILD_THROTTLE_MS = 500; // Wait 500ms after last change before building

// Function to run the link script
function runLinkScript() {
  try {
    console.log('🔄 Changes detected, rebuilding and linking...');
    execSync(`node ${linkScript}`, {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log('✅ Rebuild and link complete\n');
    console.log('👀 Watching for changes...\n');
  } catch (error) {
    console.error('❌ Failed to rebuild and link:', error.message);
  }
}

// Simple file watcher using fs.watch
function watchDirectory(dir) {
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith('.ts') || filename.endsWith('.js'))) {
      const now = Date.now();
      if (now - lastBuildTime > BUILD_THROTTLE_MS) {
        lastBuildTime = now;
        // Debounce the build to avoid multiple rapid builds
        setTimeout(() => {
          if (Date.now() - lastBuildTime >= BUILD_THROTTLE_MS) {
            runLinkScript();
          }
        }, BUILD_THROTTLE_MS);
      }
    }
  });
}

// Watch the src directory
watchDirectory(srcDir);

// Also watch the link script itself
fs.watchFile(linkScript, () => {
  console.log('🔄 Link script changed, will rebuild on next src change');
});

// Initial build and link
console.log('🏗️  Performing initial build and link...');
runLinkScript();
