// Hermes bench driver for normalizeAmountString. Runs inside bundle.js.
// - Every invocation first runs the FULL parity self-check: the candidate
//   (current production code) vs the frozen reference on an explicit suite
//   covering empty/odd lengths, signs/negative zero, exponents, leading/
//   trailing zeros, whitespace, radix, NaN/invalid, decimals
//   undefined/negative/fractional/nonfinite, and length limits — plus a
//   seeded fuzz sweep. Prints SELF_CHECK=FAIL and a reason on any mismatch.
// - bench mode: times the hot-path corpus and prints METRIC primary_ms and
//   METRIC per_call_us.
// - sweep mode: times the corpus at 3 sizes to show per-call cost is flat.

var PARITY = [
  // empty / odd lengths
  ['', 18],
  ['', undefined],
  ['1', 18],
  ['123', undefined],
  ['1234567', 3],
  ['123456789012345678901234567890', 18],
  // signs / negative zero
  ['-0', 18],
  ['-0.0', 18],
  ['-0.000', undefined],
  ['-1.5', 6],
  ['-1.999', 2],
  ['-1e-10', 18],
  ['+1.5', 6],
  ['+0', undefined],
  // exponents
  ['1e-18', 18],
  ['1e-6', 18],
  ['1E+5', 18],
  ['2.5E2', 18],
  ['1.5e-3', 6],
  ['0e0', 18],
  ['1e0', undefined],
  ['5e-7', 6],
  ['1e21', undefined],
  ['1e-7', undefined],
  ['1e40', undefined],
  ['1e-40', undefined],
  ['.5e2', 18],
  ['1.23e4', 2],
  // leading / trailing zeros
  ['007', 18],
  ['0.500', 18],
  ['000.5', 6],
  ['5.000', undefined],
  ['0.0', 18],
  ['00', undefined],
  ['0.000000000000000001', 18],
  ['1.500', 18],
  ['10.0100', 4],
  // whitespace
  [' 1.5', 18],
  ['1.5 ', 18],
  ['1.5\t', 6],
  ['  ', 18],
  // radix-ish / hex / octal / binary
  ['0xff', 18],
  ['0xFF', 0],
  ['0b101', 18],
  ['0o17', undefined],
  // NaN / invalid
  ['NaN', 18],
  ['Infinity', 18],
  ['-Infinity', 18],
  ['abc', 18],
  ['1.2.3', 6],
  ['--1', 18],
  ['1e', 6],
  ['e5', undefined],
  ['.', 18],
  ['1,5', 6],
  ['0x', 18],
  // decimals variants
  ['1.5', undefined],
  ['1.5', -3],
  ['1.5', NaN],
  ['1.5', Infinity],
  ['1.5', -Infinity],
  ['1.5', -0.5],
  ['1.234567', 2.9],
  ['1.234567', 0],
  ['1.234567', 100],
  ['1.234567', '2'],
  ['1.234567', null],
  ['0.5', 0],
  // length limits
  ['1' + '0'.repeat(200), undefined],
  ['1' + '0'.repeat(200), 18],
  ['0.' + '123456789'.repeat(11), 18],
  ['0.' + '123456789'.repeat(11), undefined],
  ['0.' + '9'.repeat(50), 6],
  ['1234567890123456789012345.6789', 2],
  // pinned reference quirks (probed against frozen reference)
  ['1.234567', 1e21],
  ['1.5', -0],
  ['+.5', 18],
  ['1e+05', 18],
  ['0e-3', undefined],
  ['-0.5e2', 6],
  ['1.5e-2', 4],
  ['-1.5e2', 2],
  ['5', -0],
  // multiline / terminal newline: JS `$` (no `m` flag) must NOT admit a
  // terminal newline, and BigNumber trims \n/\r/\t/space — these inputs
  // must route to the BigNumber fallback to stay reference-identical.
  ['1.5\n', 6],
  ['1.5\n', undefined],
  ['\n1.5', 6],
  ['1.5\r', 6],
  ['1.5\r\n', 18],
  ['1.5\n\n', 6],
  ['0\n', undefined],
  ['\n', 18],
  ['1\n5', 6],
  ['-1.5\n', 6],
  ['1.5 \n ', 18],
  ['\t\n 1.5 \r\n', 6],
  [' 0.000000000000000001\n', 18],
  // negative-zero zoo
  ['-0', 0],
  ['-0.0', 0],
  ['-0.00e0', undefined],
  ['-0e5', 18],
  ['-0e-5', undefined],
  ['-.0', 2],
  ['-0.', 18],
  ['-0.000e999', 18],
  ['-0.500', 1],
  ['-0.5', 0],
  ['-0.05', 1],
  ['-0.005', 2],
  ['-0e999', 6],
  ['-0.0e999', 6],
  // huge-length significands
  ['1' + '0'.repeat(511), undefined],
  ['1' + '0'.repeat(511), 18],
  ['9'.repeat(512), 0],
  ['0.' + '0'.repeat(511) + '1', undefined],
  ['0.' + '0'.repeat(511) + '1', 18],
  ['1.' + '2'.repeat(511), 18],
  ['1' + '0'.repeat(511) + '.' + '0'.repeat(511), undefined],
  ['12345678901234567890.12345e6', 18],
  ['12345678901234567890.12345e-6', 18],
  ['0.' + '0'.repeat(500) + '12345e3', 18],
  ['1e999', undefined],
  ['1e-999', undefined],
  ['1.5e999', 6],
  ['9'.repeat(600) + 'e999', undefined],
  ['1' + '0'.repeat(2000), undefined],
];

var DECIMALS_POOL = [
  undefined, 0, 1, 2, 6, 18, 3.7, -1, -0.5, NaN, Infinity, 100,
];

function lcgSeed(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildFuzz(n) {
  var rnd = lcgSeed(0xC0FFEE);
  var digits = '0123456789';
  var extra = '.eE+-';
  var out = [];
  for (var i = 0; i < n; i++) {
    var len = 1 + Math.floor(rnd() * 24);
    var s = '';
    for (var j = 0; j < len; j++) {
      var pick = rnd();
      if (pick < 0.75) s += digits[Math.floor(rnd() * 10)];
      else if (pick < 0.93) s += extra[Math.floor(rnd() * 5)];
    }
    if (rnd() < 0.35) {
      s += (rnd() < 0.5 ? 'e' : 'E') + (rnd() < 0.5 ? '-' : '+') + Math.floor(rnd() * 30);
    }
    var dec = DECIMALS_POOL[Math.floor(rnd() * DECIMALS_POOL.length)];
    out.push([s, dec]);
  }
  // Deterministic extra fuzz around plain decimals with tricky zeros.
  var bases = ['0', '1', '9', '10', '007', '0.5', '0.0500', '-0.5', '123.456', '99999.99999'];
  for (var k = 0; k < bases.length; k++) {
    for (var d = 0; d < DECIMALS_POOL.length; d++) {
      out.push([bases[k], DECIMALS_POOL[d]]);
    }
  }
  return out;
}

var FUZZ = buildFuzz(600);

// Parity under a NON-DEFAULT global BigNumber config. The reference (frozen
// original) uses the same shared BigNumber instance, so both sides see the
// mutated config. Entries: [configObj, cases]. After each config block the
// harness restores defaults and pokes the candidate with a whitespace input
// (which must take the BigNumber fallback) so any config caching is fresh.
// bignumber.js 9.1.2 has no ERRORS config (errors always throw) — the ERRORS
// key is silently ignored, which the last block demonstrates.
var CONFIG_PARITY = [
  [
    { RANGE: 5 },
    [
      ['1234567890', undefined],
      ['1234567890', 18],
      ['9'.repeat(25), 0],
      ['0.00000000001', undefined],
      ['0.00000000001', 18],
      ['1e-20', 18],
      ['1e-20', 6],
      ['1e10', undefined],
      ['1e3', 18],
      ['0.5e2', 18],
      ['0.001e1', 6],
      ['999.99', 18],
      ['0.1', 18],
      ['0.000001', 18],
      ['1e-999', 18],
      ['-1.23e4', 2],
      ['0.1234567890123', 18],
      [' 1.5', 6],
      ['1.5', 6],
    ],
  ],
  [
    { RANGE: [-3, 50] },
    [
      ['9999', undefined],
      ['999', 18],
      ['1e-4', 18],
      ['1e-30', 6],
      ['1e40', undefined],
      ['1e60', undefined],
      ['0.001', 18],
    ],
  ],
  [
    { RANGE: 1e9 },
    [
      ['1e999', undefined],
      ['1e-999', 6],
      ['1234.567890123456789', 18],
    ],
  ],
  [
    { ERRORS: false, DECIMAL_PLACES: 3, EXPONENTIAL_AT: 0, CRYPTO: false },
    [
      // ERRORS does not exist in 9.1.2 — throws must still match.
      ['1.234567', 1e21],
      ['1.234567', undefined],
      ['1.5', 6],
      ['NaN', 18],
    ],
  ],
];

function selfCheck() {
  var failures = [];
  var suites = [
    ['parity', PARITY],
    ['fuzz', FUZZ],
  ];
  for (var si = 0; si < suites.length; si++) {
    var name = suites[si][0];
    var cases = suites[si][1];
    for (var i = 0; i < cases.length; i++) {
      var amount = cases[i][0];
      var decimals = cases[i][1];
      var expected;
      var actual;
      try {
        expected = __referenceImpl(amount, decimals);
      } catch (e) {
        expected = 'THREW:' + e.message;
      }
      try {
        actual = normalizeAmountString(amount, decimals);
      } catch (e) {
        actual = 'THREW:' + e.message;
      }
      if (expected !== actual) {
        failures.push(
          name + '[' + i + '] input=' + JSON.stringify(amount) +
            ' decimals=' + String(decimals) +
            ' expected=' + JSON.stringify(expected) +
            ' actual=' + JSON.stringify(actual),
        );
        if (failures.length >= 10) return failures;
      }
    }
  }
  // Parity under non-default global BigNumber config (RANGE etc.). The
  // candidate must track the configured range or explicitly fall back.
  // PARITY_SKIP_CONFIG=1 (build-time) skips these blocks — timing
  // isolation only, never a keep decision.
  if (PARITY_SKIP_CONFIG !== true)
  for (var ci = 0; ci < CONFIG_PARITY.length; ci++) {
    var cfg = CONFIG_PARITY[ci][0];
    var cases = CONFIG_PARITY[ci][1];
    BigNumberJS.config(cfg);
    // Poke the candidate with an input that must take the BigNumber
    // fallback, so any cached config view is refreshed before comparing.
    normalizeAmountString(' 1', undefined);
    for (var i = 0; i < cases.length; i++) {
      var amount = cases[i][0];
      var decimals = cases[i][1];
      var expected;
      var actual;
      try {
        expected = __referenceImpl(amount, decimals);
      } catch (e) {
        expected = 'THREW:' + e.message;
      }
      try {
        actual = normalizeAmountString(amount, decimals);
      } catch (e) {
        actual = 'THREW:' + e.message;
      }
      if (expected !== actual) {
        failures.push(
          'config' + ci + '[' + i + '] config=' + JSON.stringify(cfg) +
            ' input=' + JSON.stringify(amount) +
            ' decimals=' + String(decimals) +
            ' expected=' + JSON.stringify(expected) +
            ' actual=' + JSON.stringify(actual),
        );
        if (failures.length >= 10) {
          BigNumberJS.config({ RANGE: [-1e7, 1e7] });
          return failures;
        }
      }
    }
  }
  // Restore defaults (and refresh the candidate's cached view again).
  BigNumberJS.config({ RANGE: [-1e7, 1e7] });
  normalizeAmountString(' 1', undefined);
  return failures;
}

// Hot-path corpus: realistic balance strings hitting the controller boundary.
var HOT = [
  ['1234.567890123456789', 18],
  ['0.000000000000000001', 18],
  ['1e-18', 18],
  ['0.5', undefined],
  ['1000000000', 0],
  ['1.5', 6],
  ['2.5E2', 18],
  ['0', 18],
  ['1.2345678901234567899', 18],
  ['5e-6', 6],
  ['1.234567', 2.9],
  ['3.14159265358979', 18],
  ['99.999', 2],
  ['0.000001', 18],
  ['1e-6', 18],
  ['42', undefined],
  ['1.0001', 4],
  ['0.25', 18],
];

function timeCorpus(rounds) {
  var t0 = Date.now();
  var sink = 0;
  for (var r = 0; r < rounds; r++) {
    for (var i = 0; i < HOT.length; i++) {
      sink += normalizeAmountString(HOT[i][0], HOT[i][1]).length;
    }
  }
  var ms = Date.now() - t0;
  if (sink === -1) print('impossible');
  return ms;
}

var failures = selfCheck();
if (failures.length > 0) {
  for (var f = 0; f < failures.length; f++) {
    print('PARITY_FAIL ' + failures[f]);
  }
  print('SELF_CHECK=FAIL ' + failures.length + ' mismatches');
} else if (BENCH_MODE === 'sweep') {
  var s1 = timeCorpus(2000);
  var s2 = timeCorpus(8000);
  var s4 = timeCorpus(32000);
  print('METRIC sweep_2k_ms=' + s1);
  print('METRIC sweep_8k_ms=' + s2);
  print('METRIC sweep_32k_ms=' + s4);
  print('METRIC sweep_2k_percall_us=' + ((s1 * 1000) / (2000 * HOT.length)).toFixed(4));
  print('METRIC sweep_8k_percall_us=' + ((s2 * 1000) / (8000 * HOT.length)).toFixed(4));
  print('METRIC sweep_32k_percall_us=' + ((s4 * 1000) / (32000 * HOT.length)).toFixed(4));

  // Input-length scaling: per-call cost must grow linearly with digit count
  // (constant per-char cost, no quadratic surprises).
  var LENGTH_ROUNDS = 4000;
  var lengths = [1, 8, 32, 128, 512];
  for (var li = 0; li < lengths.length; li++) {
    var n = lengths[li];
    var intDigits = '1' + (n > 1 ? '9'.repeat(n - 1) : '');
    var lenInputs = [
      [intDigits, undefined],
      ['0.' + (n > 1 ? '9'.repeat(n - 1) : '') + '1', undefined],
      ['1.' + (n > 1 ? '9'.repeat(n - 1) : ''), 18],
    ];
    var t0 = Date.now();
    var sink2 = 0;
    for (var r2 = 0; r2 < LENGTH_ROUNDS; r2++) {
      for (var k2 = 0; k2 < lenInputs.length; k2++) {
        sink2 += normalizeAmountString(lenInputs[k2][0], lenInputs[k2][1]).length;
      }
    }
    var lms = Date.now() - t0;
    if (sink2 === -1) print('impossible');
    print('METRIC len_' + n + '_ms=' + lms);
    print('METRIC len_' + n + '_percall_us=' +
      ((lms * 1000) / (LENGTH_ROUNDS * lenInputs.length)).toFixed(4));
    print('METRIC len_' + n + '_perchar_ns=' +
      ((lms * 1e6) / (LENGTH_ROUNDS * lenInputs.length * n)).toFixed(2));
  }

  // Corpus cardinality: per-call cost must be independent of the number of
  // distinct inputs (no hidden caching effects).
  var CARD_ROUNDS = 4000;
  var cardinalities = [1, 4, 18, 64];
  for (var ci2 = 0; ci2 < cardinalities.length; ci2++) {
    var m = cardinalities[ci2];
    var cardInputs = [];
    for (var k3 = 0; k3 < m; k3++) {
      var base = HOT[k3 % HOT.length];
      cardInputs.push([
        base[0].slice(0, -1) + String.fromCharCode(48 + (k3 % 10)),
        base[1],
      ]);
    }
    var t1 = Date.now();
    var sink3 = 0;
    for (var r3 = 0; r3 < CARD_ROUNDS; r3++) {
      for (var k4 = 0; k4 < cardInputs.length; k4++) {
        sink3 += normalizeAmountString(cardInputs[k4][0], cardInputs[k4][1]).length;
      }
    }
    var cms = Date.now() - t1;
    if (sink3 === -1) print('impossible');
    print('METRIC card_' + m + '_ms=' + cms);
    print('METRIC card_' + m + '_percall_us=' +
      ((cms * 1000) / (CARD_ROUNDS * m)).toFixed(4));
  }
  print('SELF_CHECK=OK');
} else {
  var ms = timeCorpus(8000);
  print('METRIC primary_ms=' + ms);
  print('METRIC per_call_us=' + ((ms * 1000) / (8000 * HOT.length)).toFixed(4));
  print('SELF_CHECK=OK');
}
