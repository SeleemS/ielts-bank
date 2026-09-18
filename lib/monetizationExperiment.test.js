import { expect, it } from 'vitest';
import { checkoutAttribution, FUNNEL_VERSION } from './monetizationExperiment';
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
it('accepts only a versioned random intent, never arbitrary client metadata', () => {
  expect(checkoutAttribution({ funnel_intent_id: id, funnel_version: FUNNEL_VERSION, email: 'private', essay: 'private' })).toEqual({ funnel_intent_id: id, funnel_version: FUNNEL_VERSION });
  for (const input of [undefined, {}, { funnel_intent_id: 'private@email', funnel_version: FUNNEL_VERSION }, { funnel_intent_id: id, funnel_version: 'old' }]) expect(checkoutAttribution(input)).toEqual({});
});
