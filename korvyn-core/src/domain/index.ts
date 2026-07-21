/**
 * Canonical accounting model — the source of truth.
 *
 * ARCHITECTURAL RULE: nothing in this directory may import from
 * `../integration` or from any external SDK. The dependency arrow points one
 * way only: integration -> domain. If you find yourself wanting the reverse,
 * the thing you need belongs in the domain, expressed in the domain's own
 * vocabulary.
 */
export * from './primitives.js';
export * from './account.js';
export * from './entity.js';
export * from './dimension.js';
export * from './period.js';
export * from './journal.js';
export * from './validation.js';
