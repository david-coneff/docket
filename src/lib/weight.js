// weight.js — a proposal's weight tier (roadmap DP-1): how much of the lifecycle it takes.
//
// The agent sets an initial value (docket-propose.py --weight); the reviewer can override it
// here. The agent's own value is kept in `weight_agent` the first time the reviewer changes
// it, so the agent reading the resolved JSON sees both. A proposal written before the field
// existed reads as `standard`.

export const WEIGHTS = ['trivial', 'standard', 'significant'];
export const DEFAULT_WEIGHT = 'standard';

export const WEIGHT_HINT = {
  trivial: 'Typo, formatting, link fix: approve commits it, no separate disposition',
  standard: 'Proposal → disposition → action; confirmation optional',
  significant: 'Intent, architecture or hypothesis: the full cycle, confirmation expected',
};

export function weightOf(proposal) {
  return WEIGHTS.includes(proposal?.weight) ? proposal.weight : DEFAULT_WEIGHT;
}

/** Set the reviewer's weight. Returns false (and changes nothing) for an unknown tier. */
export function setWeight(proposal, weight) {
  if (!WEIGHTS.includes(weight)) return false;
  const current = weightOf(proposal);
  if (weight === current) return true;
  if (!('weight_agent' in proposal)) proposal.weight_agent = current;
  proposal.weight = weight;
  return true;
}
