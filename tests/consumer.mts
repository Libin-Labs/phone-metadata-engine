import {
  createPhoneMetadataEngine,
  type NumberingRule,
  type NumberingSchema,
  type PhoneCandidate,
  type PhoneResult,
  type PhoneMetadataEngine,
} from '@lp-labs/phone-metadata-engine';
const rule: NumberingRule = {
  region: 'XA',
  callingCode: '9',
  nationalLengths: [3],
  prefixes: ['1'],
  groups: [3],
};
const schema: NumberingSchema = { version: 'test', rules: [rule] };
const engine: PhoneMetadataEngine = createPhoneMetadataEngine(schema);
const result: PhoneResult = engine.parse('+9123');
const candidate: PhoneCandidate | undefined = result.candidates[0];
const formatted: string = engine.format('+9123');
const metadata: NumberingSchema = engine.metadata();
createPhoneMetadataEngine({
  version: 'x',
  // @ts-expect-error numbering lengths are numbers
  rules: [{ region: 'XA', callingCode: '9', nationalLengths: ['3'] }],
});
void [candidate, formatted, metadata];
