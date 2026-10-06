import { expect, it } from 'vitest';
import { acquisitionGroup, summarizeAcquisition } from './acquisition-source.mjs';
it.each([
  ['chatgpt.com','ai_referral'], ['https://chatgpt.com/share/test','ai_referral'], ['gemini.google.com','ai_referral'],
  ['www.google.co.uk','search'], ['google','search'], ['https://t.co/example','social'], ['tXco','other'],
  ['chatgpt.com.evil.example','other'], ['t.co.evil.example','other'], ['reddit.com','social'], [null,'missing'], ['direct','direct'],
])('groups %s without substring collisions', (input,group)=>expect(acquisitionGroup(input)).toBe(group));
it('deduplicates identities within groups, without combining groups into a false traffic total',()=> {
  expect(summarizeAcquisition([{identity:'a',source:'chatgpt.com'}, {identity:'a',source:'chatgpt'}, {identity:'a',source:'google'}])).toEqual([{source:'ai_referral',recordedIdentities:1},{source:'search',recordedIdentities:1}]);
});
