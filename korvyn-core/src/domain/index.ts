/**
 * Canonical accounting model — the source of truth.
 *
 * ARCHITECTURAL RULE: nothing in this directory may import from
 * `../integration` or from any external SDK. The dependency arrow points one
 * way only: integration -> domain. If you find yourself wanting the reverse,
 * the thing you need belongs in the domain, expressed in the domain's own
 * vocabulary.
 */
export * from './primitives';
export * from './account';
export * from './entity';
export * from './dimension';
export * from './period';
export * from './journal';
export * from './validation';
