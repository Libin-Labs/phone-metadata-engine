import { createPhoneMetadataEngine, type PhoneResult } from '@lp-labs/phone-metadata-engine';
const result: PhoneResult = createPhoneMetadataEngine({
  version: 'x',
  rules: [{ region: 'XA', callingCode: '9', nationalLengths: [3] }],
}).parse('+9123');
void result;
