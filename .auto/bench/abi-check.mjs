import { defaultAbiCoder } from '@ethersproject/abi';
const WORD = (n) => n.toString(16).padStart(64, '0');
function mine(shapes) {
  const n = shapes.length;
  if (n === 0) return '0x' + WORD(0x20) + WORD(0);
  const bl = [], pb = [], tw = [];
  for (let i = 0; i < n; i++) {
    const b = shapes[i][1] || '';
    const p = b.length % 64 === 0 ? b : b.padEnd(64 * Math.ceil(b.length / 64), '0');
    bl[i] = b.length / 2; pb[i] = p; tw[i] = 3 + p.length / 64;
  }
  const ts = []; let cur = 1 + n;
  for (let i = 0; i < n; i++) { ts[i] = cur; cur += tw[i]; }
  let out = WORD(0x20) + WORD(n);
  for (let i = 0; i < n; i++) out += WORD((ts[i] - 1) * 32);
  for (let i = 0; i < n; i++) {
    out += shapes[i][0] ? WORD(1) : WORD(0);
    out += WORD(0x40); out += WORD(bl[i]); out += pb[i];
  }
  return '0x' + out;
}
const toHexBody = (b) => (b === '' ? '0x' : b.length % 2 ? '0x' + b + '0' : '0x' + b);
const cases = [
  [[true, 'ab'.repeat(31)]],
  [[true, 'ab'.repeat(31)], [false, 'cd'.repeat(2)], [true, '']],
  [[false, '']],
  [[true, 'aa'.repeat(32)], [true, 'bb'.repeat(33)], [false, ''], [true, '00'.repeat(1)]],
];
for (const c of cases) {
  const ref = defaultAbiCoder.encode(
    ['(bool,bytes)[]'],
    [c.map((x) => [x[0], toHexBody(x[1])])],
  );
  const mineHex = mine(c.map((x) => [x[0], x[1].length % 2 ? x[1] + '0' : x[1]]));
  console.log(ref === mineHex ? 'MATCH  len=' + ref.length : 'DIFF');
  if (ref !== mineHex) {
    console.log('ref :', ref);
    console.log('mine:', mineHex);
  }
}
