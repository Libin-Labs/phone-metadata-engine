# @lp-labs/phone-metadata-engine

Original, bounded phone-number matching against **caller-supplied, versioned metadata**.
No bundled country database, runtime dependencies, peer dependencies or network calls.
Matching a rule cannot establish ownership, reachability, assignment, consent or world accuracy.
The fictional identifiers and codes below are test data, not authoritative numbering plans.

## Install

```bash
npm install @lp-labs/phone-metadata-engine
```

Node >=18, ES2022 ESM/CommonJS and strict TypeScript declarations.
CommonJS: `const { createPhoneMetadataEngine } = require('@lp-labs/phone-metadata-engine')`.

## Quickstart

```js
import { createPhoneMetadataEngine } from '@lp-labs/phone-metadata-engine';

const engine = createPhoneMetadataEngine({
  version: 'app-fixture-1',
  rules: [
    {
      region: 'XA',
      callingCode: '9',
      nationalLengths: [6],
      prefixes: ['7'],
      trunkPrefix: '0',
      groups: [3, 3],
    },
  ],
});
const result = engine.parse('0712-345', 'XA');
if (result.status !== 'matched' || result.candidates[0].international !== '+9712345') {
  throw new Error('Rule matching failed');
}
if (engine.format('+9 (712) 345') !== '+9 712 345') throw new Error('Formatting failed');
if (engine.metadata().version !== 'app-fixture-1') throw new Error('Version lost');
```

## Full API and types

The only runtime export is `createPhoneMetadataEngine(schema: NumberingSchema): PhoneMetadataEngine`.
All definitions and returned metadata are detached copies. Result arrays can be edited without
changing the engine. Caller arrays are read by bounded indexes; overridden iterators are not used.

```ts
interface NumberingRule {
  region: string;
  callingCode: string;
  nationalLengths: readonly number[];
  prefixes?: readonly string[];
  trunkPrefix?: string;
  groups?: readonly number[];
}
interface NumberingSchema {
  version: string;
  rules: readonly NumberingRule[];
}
interface PhoneCandidate {
  region: string;
  callingCode: string;
  national: string;
  international: string;
}
interface PhoneResult {
  version: string;
  status: 'matched' | 'ambiguous' | 'unknown' | 'invalid';
  candidates: PhoneCandidate[];
}
interface PhoneMetadataEngine {
  parse(input: string, defaultRegion?: string): PhoneResult;
  format(input: string, defaultRegion?: string): string;
  metadata(): NumberingSchema;
}
```

Every interface above is exported as a TypeScript type.

- `version`: nonempty string, <=128 UTF-16 units. It is a caller label, not a validated date/version.
- `rules`: 1..256 entries, in deterministic candidate order.
- `region`: unique, 2..8 characters matching `[A-Z][A-Z0-9-]{1,7}`; arbitrary application IDs.
- `callingCode`: 1..3 ASCII digits, first nonzero. Sharing/overlapping codes is allowed.
- `nationalLengths`: 1..14 unique positive integers; each plus calling-code length must be <=15.
- `prefixes`: optional 1..32 unique, nonempty ASCII digit strings, <=14 units.
  Each must fit at least one national length. Omission accepts every prefix; presence is OR matching.
- `trunkPrefix`: optional 1..4 ASCII digits, removed **once**, only for national input.
  Nothing is inferred about international dial-out prefixes such as `00`.
- `groups`: optional 1..14 positive integer sizes with total <=14. Formatting consumes these
  groups, clips the last group if necessary, and appends any remaining national suffix.
  Without groups, the national number remains one digit string.

### Parsing, ambiguity and customization

`parse` trims outer ECMAScript whitespace, then accepts only ASCII digits, one leading `+`,
ASCII spaces, `(`, `)`, `.`, `-`. Parentheses must be balanced, nonnested and contain digits.
This is a strict presentation subset, not a telephone URI or extension parser.

International input starts with `+`; it has at most 15 digits and cannot start with zero.
Every calling-code prefix is tried: no longest-prefix guess. A supplied `defaultRegion` must
exist but does **not** filter international candidates. National input requires that region;
after optional trunk removal it is checked only against that rule.

`matched` means exactly one rule passed length and prefix checks; `ambiguous` means multiple.
`unknown` means no international calling-code prefix was recognized; `invalid` means a recognized
code failed constraints or the international digit shape violated the 15-digit contract.
Only passing candidates include a canonical `international` string.

```js
import { createPhoneMetadataEngine } from '@lp-labs/phone-metadata-engine';

const engine = createPhoneMetadataEngine({
  version: 'shared-code-fixture',
  rules: [
    { region: 'XA', callingCode: '9', nationalLengths: [3] },
    { region: 'XB', callingCode: '9', nationalLengths: [3], prefixes: ['1'] },
  ],
});
if (engine.parse('+9123').status !== 'ambiguous') throw new Error('Ambiguity was hidden');
if (engine.parse('+8123').status !== 'unknown') throw new Error('Unknown code not reported');
if (engine.parse('+912').status !== 'invalid') throw new Error('Length was not checked');
```

`format` accepts the same inputs and requires a unique match, returning `+code group group`.
Update metadata by creating a new engine; no mutable global registry exists.

## Errors, bounds and scope

- Wrong types, malformed schema labels/digits, duplicate regions/prefixes, presentation syntax
  and absent/unknown default regions throw `TypeError`.
- Schema array/length/group capacity errors throw `RangeError`.
- Input is <=128 UTF-16 units and 1..19 digits before trunk handling; exceeding either
  bound throws `RangeError`. Empty/nondigit presentation is `TypeError`.
- `format` throws `RangeError` for every non-`matched` result.

Matching scans at most 256 rules and 32 prefixes per rule against bounded digit strings.
Construction/listing cost is proportional to bounded metadata size. Number strings are never
converted to numeric values, preserving leading zeros in subscriber numbers.

No global numbering accuracy claim, extension support, carrier/geolocation inference,
automatic Unicode digit conversion or number ownership verification is included.
The application is responsible for metadata sources, updates, overlap policy and verification.

## Development

`npm ci --offline`, `npm run build`, `npm run typecheck`, `npm test`,
`npm run format`, `npm run format:check`. Offline install needs the cached dev packages.
Only TypeScript ^5.9.3 and Prettier ^3.6.2 are development dependencies.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
