import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPhoneMetadataEngine } from '../dist/esm/index.js';

const fixture = () => ({
  version: 'test-2026.1',
  rules: [
    {
      region: 'XA',
      callingCode: '91',
      nationalLengths: [6],
      prefixes: ['7', '8'],
      trunkPrefix: '0',
      groups: [3, 3],
    },
    { region: 'XB', callingCode: '44', nationalLengths: [4, 5], groups: [2] },
  ],
});
const engine = () => createPhoneMetadataEngine(fixture());

test('international matching returns caller version and exact digit strings', () => {
  assert.deepEqual(engine().parse('+91 (712) 345'), {
    version: 'test-2026.1',
    status: 'matched',
    candidates: [
      { region: 'XA', callingCode: '91', national: '712345', international: '+91712345' },
    ],
  });
});
test('national input removes exactly one configured trunk prefix', () => {
  assert.equal(engine().parse('0712-345', 'XA').candidates[0].national, '712345');
  assert.equal(engine().parse('00712345', 'XA').status, 'invalid');
});
test('national input requires a known explicit region', () => {
  assert.throws(() => engine().parse('712345'), TypeError);
  assert.throws(() => engine().parse('712345', 'ZZ'), TypeError);
  assert.throws(() => engine().parse('+91712345', 'xa'), TypeError);
});
test('known numbering prefix with wrong length or subscriber prefix is invalid', () => {
  for (const input of ['+9171234', '+91912345', '+91'])
    assert.equal(engine().parse(input).status, 'invalid');
});
test('unknown calling code differs from invalid known code', () => {
  assert.deepEqual(engine().parse('+331234'), {
    version: 'test-2026.1',
    status: 'unknown',
    candidates: [],
  });
});
test('shared calling code ambiguity retains all candidates in schema order', () => {
  const schema = fixture();
  schema.rules.push({ region: 'XC', callingCode: '91', nationalLengths: [6] });
  const result = createPhoneMetadataEngine(schema).parse('+91712345', 'XA');
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(
    result.candidates.map((entry) => entry.region),
    ['XA', 'XC'],
  );
});
test('overlapping calling codes are not guessed using longest prefix', () => {
  const e = createPhoneMetadataEngine({
    version: 'overlap',
    rules: [
      { region: 'XA', callingCode: '1', nationalLengths: [4] },
      { region: 'XB', callingCode: '12', nationalLengths: [3] },
    ],
  });
  assert.equal(e.parse('+12345').status, 'ambiguous');
});
test('format uses configured groups and preserves a remaining suffix', () => {
  assert.equal(engine().format('0712345', 'XA'), '+91 712 345');
  assert.equal(engine().format('+4412345'), '+44 12 345');
  assert.equal(engine().format('+44.12-34'), '+44 12 34');
});
test('format refuses invalid unknown and ambiguous values', () => {
  for (const input of ['+91', '+33123']) assert.throws(() => engine().format(input), RangeError);
  const schema = fixture();
  schema.rules.push({ region: 'XC', callingCode: '91', nationalLengths: [6] });
  assert.throws(() => createPhoneMetadataEngine(schema).format('+91712345'), RangeError);
});
test('punctuation is strict and balanced rather than arbitrary digit stripping', () => {
  for (const input of [
    '',
    'abc123',
    '+91+712345',
    '++91',
    '91/712345',
    '+91()',
    '+91(7(12))345',
    '+91(712345',
    '+91)712345(',
    '+91（712）345',
    '+９１７１２３４５',
    '+91😀712345',
  ]) {
    assert.throws(() => engine().parse(input, 'XA'), TypeError);
  }
});
test('nonstring inputs and nonASCII digits fail without coercion', () => {
  for (const value of [null, 123, {}, ['712345'], '٧١٢٣٤٥']) {
    assert.throws(() => engine().parse(value, 'XA'), TypeError);
  }
});
test('international digits enforce leading nonzero and fifteen digit ceiling', () => {
  assert.equal(engine().parse('+0123').status, 'invalid');
  assert.equal(engine().parse('+' + '1'.repeat(16)).status, 'invalid');
  assert.throws(() => engine().parse('+' + '1'.repeat(20)), RangeError);
  const e = createPhoneMetadataEngine({
    version: 'max',
    rules: [{ region: 'XA', callingCode: '1', nationalLengths: [14] }],
  });
  assert.equal(e.parse('+' + '1'.repeat(15)).status, 'matched');
});
test('input UTF16 size bound is checked before parsing', () => {
  assert.throws(() => engine().parse(' '.repeat(129)), RangeError);
  assert.equal(engine().parse('+91712345' + ' '.repeat(119)).status, 'matched');
});
test('schema and returned metadata are detached from engine state', () => {
  const schema = fixture();
  for (const array of [
    schema.rules,
    schema.rules[0].nationalLengths,
    schema.rules[0].prefixes,
    schema.rules[0].groups,
  ]) {
    Object.defineProperty(array, Symbol.iterator, {
      value() {
        throw new Error('Caller iterator invoked');
      },
    });
  }
  const e = createPhoneMetadataEngine(schema);
  schema.version = 'changed';
  schema.rules[0].prefixes[0] = '9';
  schema.rules[0].nationalLengths[0] = 1;
  const metadata = e.metadata();
  metadata.rules[0].groups[0] = 1;
  metadata.rules[0].region = 'ZZ';
  assert.equal(e.parse('+91712345').version, 'test-2026.1');
  assert.equal(e.format('+91712345'), '+91 712 345');
  const result = e.parse('+91712345');
  result.candidates[0].national = 'oops';
  assert.equal(e.parse('+91712345').candidates[0].national, '712345');
});
test('schema rejects wrong container versions duplicate or malformed regions', () => {
  for (const schema of [
    null,
    [],
    {},
    { version: '', rules: [] },
    { version: 'x'.repeat(129), rules: [] },
  ])
    assert.throws(() => createPhoneMetadataEngine(schema));
  for (const region of ['', 'x', 'xa', 'X_1', 'X'.repeat(9), null]) {
    const schema = fixture();
    schema.rules[0].region = region;
    assert.throws(() => createPhoneMetadataEngine(schema), TypeError);
  }
  const schema = fixture();
  schema.rules.push(schema.rules[0]);
  assert.throws(() => createPhoneMetadataEngine(schema), TypeError);
});
test('schema validates calling codes lengths and sparse arrays', () => {
  for (const callingCode of ['0', '01', '1234', '+1', 91]) {
    const schema = fixture();
    schema.rules[0].callingCode = callingCode;
    assert.throws(() => createPhoneMetadataEngine(schema), TypeError);
  }
  for (const nationalLengths of [[], [6, 6], [0], [14], [NaN], [1.5], new Array(1)]) {
    const schema = fixture();
    schema.rules[0].nationalLengths = nationalLengths;
    assert.throws(() => createPhoneMetadataEngine(schema), RangeError);
  }
  assert.throws(() => createPhoneMetadataEngine({ version: 'x', rules: new Array(1) }), TypeError);
});
test('schema validates optional prefix trunk and formatting bounds', () => {
  for (const patch of [
    { prefixes: [] },
    { prefixes: ['7777777'] },
    { prefixes: ['7', '7'] },
    { prefixes: ['x'] },
    { trunkPrefix: '' },
    { trunkPrefix: '12345' },
    { groups: [] },
    { groups: [0] },
    { groups: [8, 8] },
    { groups: [1.1] },
  ]) {
    const schema = fixture();
    Object.assign(schema.rules[0], patch);
    assert.throws(() => createPhoneMetadataEngine(schema));
  }
});
test('rule and prefix capacities accept boundary and reject overflow', () => {
  const rules = Array.from({ length: 256 }, (_, i) => ({
    region: `X${i}`,
    callingCode: '1',
    nationalLengths: [3],
  }));
  assert.equal(createPhoneMetadataEngine({ version: 'x', rules }).metadata().rules.length, 256);
  assert.throws(
    () => createPhoneMetadataEngine({ version: 'x', rules: [...rules, rules[0]] }),
    RangeError,
  );
  const schema = fixture();
  schema.rules[0].prefixes = Array.from({ length: 33 }, (_, i) => String(i));
  assert.throws(() => createPhoneMetadataEngine(schema), RangeError);
});
test('enumerated oracle checks every three digit national value', () => {
  const e = createPhoneMetadataEngine({
    version: 'oracle',
    rules: [{ region: 'XA', callingCode: '9', nationalLengths: [3], prefixes: ['2', '7'] }],
  });
  for (let i = 0; i < 1000; i++) {
    const value = String(i).padStart(3, '0');
    assert.equal(e.parse('+9' + value).status, /^[27]/.test(value) ? 'matched' : 'invalid');
  }
});
test('CommonJS surface works independently', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/cjs/index.js');
  assert.deepEqual(Object.keys(cjs), ['createPhoneMetadataEngine']);
  assert.equal(cjs.createPhoneMetadataEngine(fixture()).format('+91712345'), '+91 712 345');
});
