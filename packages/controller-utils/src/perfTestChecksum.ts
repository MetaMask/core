// import { toChecksumHexAddress } from './util';
// import {
//   add0x,
//   isStrictHexString,
//   getChecksumAddress,
//   isHexString,
// } from '@metamask/utils';

// /**
//  * Unmemoized version of toChecksumHexAddress for performance testing.
//  * This is a copy of the internal function from util.ts.
//  *
//  * @param address - The address to convert to checksummed format.
//  * @returns The checksummed address or the original input if not a string.
//  */
// function toChecksumHexAddressUnmemoized<T>(address: T): T {
//   if (typeof address !== 'string') {
//     // Mimic behavior of `addHexPrefix` from `ethereumjs-util` (which this
//     // function was previously using) for backward compatibility.
//     return address;
//   }

//   const hexPrefixed = add0x(address);

//   if (!isHexString(hexPrefixed)) {
//     // Version 5.1 of ethereumjs-util would have returned '0xY' for input 'y'
//     // but we shouldn't waste effort trying to change case on a clearly invalid
//     // string. Instead just return the hex prefixed original string which most
//     // closely mimics the original behavior.
//     return hexPrefixed as T;
//   }

//   return getChecksumAddress(hexPrefixed) as T;
// }

// // Test data - mix of different address formats
// const testAddresses = [
//   '0x742d35Cc6634C0532925a3b8D4020F83C5f9DCC5', // Valid mixed case
//   '0x742d35cc6634c0532925a3b8d4020f83c5f9dcc5', // Valid lowercase
//   '0x742D35CC6634C0532925A3B8D4020F83C5F9DCC5', // Valid uppercase
//   '742d35Cc6634C0532925a3b8D4020F83C5f9DCC5', // Valid without 0x
//   '0x0000000000000000000000000000000000000000', // Valid zero address
//   '0x1234567890123456789012345678901234567890', // Valid
//   '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', // Valid lowercase
//   '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD', // Valid uppercase
//   '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', // Valid
//   'invalid', // Invalid
//   '', // Invalid empty
//   '0x', // Invalid too short
// ];

// /**
//  * Measures the performance of a function by running it multiple times.
//  *
//  * @param fn - The function to test.
//  * @param name - Name for the test output.
//  * @param addresses - Array of addresses to test with.
//  * @param iterations - Number of iterations to run.
//  * @returns The total duration in milliseconds.
//  */
// function measurePerformance<T>(
//   fn: (address: T) => T,
//   name: string,
//   addresses: T[],
//   iterations: number,
// ): number {
//   const start = performance.now();

//   for (let i = 0; i < iterations; i += 1) {
//     for (const address of addresses) {
//       fn(address);
//     }
//   }

//   const end = performance.now();
//   const duration = end - start;

//   console.log(
//     `${name}: ${duration.toFixed(2)}ms for ${iterations * addresses.length} calls`,
//   );
//   return duration;
// }

// /**
//  * Runs the complete performance test suite comparing memoized vs unmemoized versions.
//  */
// function runChecksumPerformanceTest() {
//   console.log('=== Checksum Address Performance Test ===\n');

//   const iterations = 10000;
//   console.log(
//     `Testing with ${testAddresses.length} addresses, ${iterations} iterations each`,
//   );
//   console.log(
//     `Total function calls per test: ${iterations * testAddresses.length}\n`,
//   );

//   // Test unmemoized version
//   const unmemoizedTime = measurePerformance(
//     toChecksumHexAddressUnmemoized,
//     'Unmemoized version',
//     testAddresses,
//     iterations,
//   );

//   // Test memoized version (first run - cache miss)
//   const memoizedFirstTime = measurePerformance(
//     toChecksumHexAddress,
//     'Memoized version (first run)',
//     testAddresses,
//     iterations,
//   );

//   // Test memoized version (second run - cache hit)
//   const memoizedSecondTime = measurePerformance(
//     toChecksumHexAddress,
//     'Memoized version (second run)',
//     testAddresses,
//     iterations,
//   );

//   console.log('\n=== Results ===');
//   console.log(`Unmemoized: ${unmemoizedTime.toFixed(2)}ms`);
//   console.log(`Memoized (first): ${memoizedFirstTime.toFixed(2)}ms`);
//   console.log(`Memoized (second): ${memoizedSecondTime.toFixed(2)}ms`);

//   const speedupSecond = unmemoizedTime / memoizedSecondTime;
//   const speedupFirst = unmemoizedTime / memoizedFirstTime;

//   console.log(`\nSpeedup (first run): ${speedupFirst.toFixed(2)}x`);
//   console.log(`Speedup (second run): ${speedupSecond.toFixed(2)}x`);

//   // Test correctness
//   console.log('\n=== Correctness Test ===');
//   let correctnessMatches = 0;
//   let totalTests = 0;

//   for (const address of testAddresses) {
//     const unmemoizedResult = toChecksumHexAddressUnmemoized(address);
//     const memoizedResult = toChecksumHexAddress(address);

//     totalTests += 1;
//     if (unmemoizedResult === memoizedResult) {
//       correctnessMatches += 1;
//     } else {
//       console.log(
//         `Mismatch for "${address}": unmemoized="${unmemoizedResult}", memoized="${memoizedResult}"`,
//       );
//     }
//   }

//   console.log(
//     `Correctness: ${correctnessMatches}/${totalTests} matches (${((correctnessMatches / totalTests) * 100).toFixed(1)}%)`,
//   );

//   // Memory usage test with multiple size points
//   console.log('\n=== Memory Test ===');

//   const testSizes = [1000, 5000, 10000, 20000, 50000, 100000];

//   for (const size of testSizes) {
//     console.log(`\n--- Testing with ${size.toLocaleString()} addresses ---`);

//     // Create unique addresses for this test size (using size as prefix to avoid cache reuse)
//     const uniqueAddresses = Array.from(
//       { length: size },
//       (_, i) =>
//         `0x${size.toString(16).padStart(8, '0')}${i.toString(16).padStart(32, '0')}`,
//     );

//     // Force garbage collection if available
//     if (global.gc) {
//       global.gc();
//     }

//     const memoryBefore = process.memoryUsage();
//     console.log(
//       `Memory before: ${(memoryBefore.heapUsed / 1024).toFixed(2)} KB`,
//     );

//     // Test each unique address once to populate cache
//     const startTime = performance.now();
//     uniqueAddresses.forEach((addr) => toChecksumHexAddress(addr));
//     const cacheTime = performance.now() - startTime;

//     // Force garbage collection again if available
//     if (global.gc) {
//       global.gc();
//     }

//     const memoryAfter = process.memoryUsage();
//     console.log(`Memory after: ${(memoryAfter.heapUsed / 1024).toFixed(2)} KB`);

//     const memoryIncreaseBytes = memoryAfter.heapUsed - memoryBefore.heapUsed;
//     const memoryIncreaseKB = memoryIncreaseBytes / 1024;
//     const memoryIncreaseMB = memoryIncreaseKB / 1024;

//     console.log(`Cache population time: ${cacheTime.toFixed(2)}ms`);
//     console.log(`Memory increase: ${memoryIncreaseBytes} bytes`);
//     console.log(`Memory increase: ${memoryIncreaseKB.toFixed(2)} KB`);
//     console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);

//     if (memoryIncreaseBytes > 0) {
//       const bytesPerAddress = memoryIncreaseBytes / size;
//       console.log(`Bytes per cached address: ${bytesPerAddress.toFixed(2)}`);
//     }
//   }
// }

// // Export for potential use in other files
// export { runChecksumPerformanceTest };

// // Run the test if this file is executed directly
// if (require.main === module) {
//   runChecksumPerformanceTest();
// }
