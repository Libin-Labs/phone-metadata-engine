export interface NumberingRule {
  region: string;
  callingCode: string;
  nationalLengths: readonly number[];
  prefixes?: readonly string[];
  trunkPrefix?: string;
  groups?: readonly number[];
}
export interface NumberingSchema {
  version: string;
  rules: readonly NumberingRule[];
}
export interface PhoneCandidate {
  region: string;
  callingCode: string;
  national: string;
  international: string;
}
export interface PhoneResult {
  version: string;
  status: 'matched' | 'ambiguous' | 'unknown' | 'invalid';
  candidates: PhoneCandidate[];
}
export interface PhoneMetadataEngine {
  parse(input: string, defaultRegion?: string): PhoneResult;
  format(input: string, defaultRegion?: string): string;
  metadata(): NumberingSchema;
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected an object.');
}
function digits(value: unknown, maximum: number): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value) || value.length > maximum)
    throw new TypeError(`Expected 1..${maximum} ASCII digits.`);
}
function region(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9-]{1,7}$/.test(value))
    throw new TypeError('Region must be 2..8 uppercase ASCII identifier characters.');
}
function compact(input: string): string {
  if (typeof input !== 'string') throw new TypeError('Phone input must be a string.');
  if (input.length > 128) throw new RangeError('Phone input exceeds 128 UTF-16 units.');
  const trimmed = input.trim();
  if (!/^\+?[0-9 ().-]+$/.test(trimmed))
    throw new TypeError(
      'Only ASCII digits, leading +, spaces, parentheses, dot and hyphen allowed.',
    );
  let open = false;
  let inside = 0;
  for (const char of trimmed) {
    if (char === '(') {
      if (open) throw new TypeError('Nested parentheses are not supported.');
      open = true;
      inside = 0;
    } else if (char === ')') {
      if (!open || inside === 0) throw new TypeError('Unbalanced or empty parentheses.');
      open = false;
    } else if (open && /[0-9]/.test(char)) inside++;
  }
  if (open) throw new TypeError('Unclosed parenthesis.');
  const result = trimmed.replace(/[ ().-]/g, '');
  const count = result.startsWith('+') ? result.length - 1 : result.length;
  if (count < 1 || count > 19) throw new RangeError('Expected 1..19 input digits.');
  return result;
}
export function createPhoneMetadataEngine(schema: NumberingSchema): PhoneMetadataEngine {
  object(schema);
  if (typeof schema.version !== 'string' || !schema.version || schema.version.length > 128)
    throw new TypeError('Schema version must contain 1..128 UTF-16 units.');
  const inputRules = schema.rules;
  if (!Array.isArray(inputRules) || inputRules.length < 1 || inputRules.length > 256)
    throw new RangeError('Schema must contain 1..256 rules.');
  const seen = new Set<string>();
  const rules: NumberingRule[] = Array.from({ length: inputRules.length }, (_, index) => {
    const rule = inputRules[index]!;
    object(rule);
    region(rule.region);
    if (seen.has(rule.region)) throw new TypeError('Duplicate region.');
    seen.add(rule.region);
    digits(rule.callingCode, 3);
    if (rule.callingCode.startsWith('0'))
      throw new TypeError('Calling code cannot start with zero.');
    const callingCode = rule.callingCode;
    const inputLengths = rule.nationalLengths;
    if (!Array.isArray(inputLengths) || !inputLengths.length || inputLengths.length > 14)
      throw new RangeError('Expected 1..14 national lengths.');
    const lengths = Array.from({ length: inputLengths.length }, (_, i) => inputLengths[i]!);
    if (
      lengths.some((n) => !Number.isSafeInteger(n) || n < 1 || n + callingCode.length > 15) ||
      new Set(lengths).size !== lengths.length
    )
      throw new RangeError('National lengths must be unique and fit 15 international digits.');
    const copied: NumberingRule = {
      region: rule.region,
      callingCode: rule.callingCode,
      nationalLengths: lengths,
    };
    const inputPrefixes = rule.prefixes;
    if (inputPrefixes !== undefined) {
      if (!Array.isArray(inputPrefixes) || !inputPrefixes.length || inputPrefixes.length > 32)
        throw new RangeError('Expected 1..32 prefixes.');
      const prefixes = Array.from({ length: inputPrefixes.length }, (_, i) => inputPrefixes[i]!);
      for (const prefix of prefixes) {
        digits(prefix, 14);
        if (!lengths.some((n) => prefix.length <= n))
          throw new RangeError('Prefix cannot fit any national length.');
      }
      if (new Set(prefixes).size !== prefixes.length) throw new TypeError('Duplicate prefix.');
      copied.prefixes = prefixes;
    }
    if (rule.trunkPrefix !== undefined) {
      digits(rule.trunkPrefix, 4);
      copied.trunkPrefix = rule.trunkPrefix;
    }
    const inputGroups = rule.groups;
    if (inputGroups !== undefined) {
      if (!Array.isArray(inputGroups) || !inputGroups.length || inputGroups.length > 14)
        throw new RangeError('Expected 1..14 format groups.');
      const groups = Array.from({ length: inputGroups.length }, (_, i) => inputGroups[i]!);
      if (
        groups.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 14) ||
        groups.reduce((a, b) => a + b, 0) > 14
      )
        throw new RangeError('Format group sizes must be positive with total <=14.');
      copied.groups = groups;
    }
    return copied;
  });
  const version = schema.version;
  const parse = (input: string, defaultRegion?: string): PhoneResult => {
    const value = compact(input);
    let selected: NumberingRule | undefined;
    if (defaultRegion !== undefined) {
      region(defaultRegion);
      selected = rules.find((rule) => rule.region === defaultRegion);
      if (!selected) throw new TypeError('Unknown default region.');
    }
    const international = value.startsWith('+');
    if (!international && !selected) throw new TypeError('National input requires defaultRegion.');
    const body = international ? value.slice(1) : value;
    const candidates: PhoneCandidate[] = [];
    let recognized = false;
    if (international && (body.startsWith('0') || body.length > 15))
      return { version, status: 'invalid', candidates };
    for (const rule of international ? rules : [selected!]) {
      if (international && !body.startsWith(rule.callingCode)) continue;
      recognized = true;
      let national = international ? body.slice(rule.callingCode.length) : body;
      if (!international && rule.trunkPrefix && national.startsWith(rule.trunkPrefix))
        national = national.slice(rule.trunkPrefix.length);
      if (
        !rule.nationalLengths.includes(national.length) ||
        (rule.prefixes && !rule.prefixes.some((prefix) => national.startsWith(prefix)))
      )
        continue;
      candidates.push({
        region: rule.region,
        callingCode: rule.callingCode,
        national,
        international: `+${rule.callingCode}${national}`,
      });
    }
    return {
      version,
      status:
        candidates.length > 1
          ? 'ambiguous'
          : candidates.length === 1
            ? 'matched'
            : recognized
              ? 'invalid'
              : 'unknown',
      candidates,
    };
  };
  return {
    parse,
    format(input, defaultRegion) {
      const result = parse(input, defaultRegion);
      if (result.status !== 'matched')
        throw new RangeError(`Cannot format ${result.status} number.`);
      const candidate = result.candidates[0]!;
      const rule = rules.find((entry) => entry.region === candidate.region)!;
      const parts: string[] = [];
      let index = 0;
      for (const size of rule.groups ?? []) {
        if (index === candidate.national.length) break;
        parts.push(candidate.national.slice(index, index + size));
        index = Math.min(candidate.national.length, index + size);
      }
      if (index < candidate.national.length) parts.push(candidate.national.slice(index));
      return `+${candidate.callingCode} ${parts.join(' ')}`;
    },
    metadata: () => ({
      version,
      rules: rules.map((rule) => ({
        ...rule,
        nationalLengths: [...rule.nationalLengths],
        ...(rule.prefixes ? { prefixes: [...rule.prefixes] } : {}),
        ...(rule.groups ? { groups: [...rule.groups] } : {}),
      })),
    }),
  };
}
