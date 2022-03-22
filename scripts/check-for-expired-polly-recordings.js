#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const glob = require('glob');

const getThirtyDaysAgo = () => {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return now;
};

/**
 * This script scans tests/__recordings__, which is where Polly captures
 * recordings of requests, and looks for files that have captured requests that
 * are older than 30 days. If any are found, the script will report the names of
 * the tests that have these recordings and exit with 1. Otherwise, it will
 * exit with 0.
 */
function main() {
  const thirtyDaysAgoTimestamp = getThirtyDaysAgo().getTime();
  const outdatedTests = [];
  const filePaths = glob.sync(
    path.resolve(__dirname, '../tests/__recordings__/**/*.har'),
    { realpath: true },
  );
  filePaths.forEach((filePath) => {
    const encodedJson = fs.readFileSync(filePath, 'utf8');
    const decodedJson = JSON.parse(encodedJson);
    const isOutdated = decodedJson.log.entries.some((entry) => {
      const timestamp = Date.parse(entry.startedDateTime);
      return timestamp < thirtyDaysAgoTimestamp;
    });
    if (isOutdated) {
      outdatedTests.push(decodedJson.log._recordingName);
    }
  });

  if (outdatedTests.length > 0) {
    console.log('Some tests have outdated Polly recordings!');
    outdatedTests.forEach((test) => {
      console.log(`- ${test.replace(/\//gu, ' -> ')}`);
    });
    process.exit(1);
  } else {
    console.log('No tests have outdated Polly recordings, all good!');
  }
}

main();
