import assert from 'node:assert';
import { WEIGHTS, weightOf, setWeight } from '../src/lib/weight.js';

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; } };

t('the three DP-1 tiers, in order', () => {
  assert.deepEqual(WEIGHTS, ['trivial', 'standard', 'significant']);
});

t('a proposal with no weight (or an unknown one) reads as standard', () => {
  assert.equal(weightOf({}), 'standard');
  assert.equal(weightOf({ weight: 'huge' }), 'standard');
  assert.equal(weightOf({ weight: 'trivial' }), 'trivial');
});

t("a reviewer override keeps the agent's value once", () => {
  const p = { weight: 'trivial' };
  assert.equal(setWeight(p, 'significant'), true);
  assert.deepEqual(p, { weight: 'significant', weight_agent: 'trivial' });
  setWeight(p, 'standard');
  assert.deepEqual(p, { weight: 'standard', weight_agent: 'trivial' });
});

t('setting the same tier records nothing; an unknown tier is refused', () => {
  const p = { weight: 'standard' };
  assert.equal(setWeight(p, 'standard'), true);
  assert.deepEqual(p, { weight: 'standard' });
  assert.equal(setWeight(p, 'huge'), false);
  assert.deepEqual(p, { weight: 'standard' });
});

console.log(`weight: ${pass} passed`);
