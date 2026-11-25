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
  print('SELF_CHECK=OK');
} else {
  var ms = timeCorpus(8000);
  print('METRIC primary_ms=' + ms);
  print('METRIC per_call_us=' + ((ms * 1000) / (8000 * HOT.length)).toFixed(4));
  print('SELF_CHECK=OK');
}
