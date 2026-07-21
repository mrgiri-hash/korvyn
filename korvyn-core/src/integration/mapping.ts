import type { CanonicalEntityType } from './adapter';

/**
 * Field mapping configuration — the TYPE ONLY. No engine, no UI, no evaluation.
 *
 * Why this is data rather than code:
 *
 * Every customer's NetSuite is different. Their custom segment `custcol_job_no`
 * is another customer's `department`. If those differences live in TypeScript,
 * each one is a deploy; if they live in a row in a table, they are configuration
 * a consultant can change. This type is the contract for that row.
 *
 * The hard constraint that follows: a MappingConfig must be SERIALISABLE. No
 * functions anywhere in this file. Every transform is a tagged descriptor that
 * a future engine interprets. The moment a `(v) => ...` appears here, the config
 * stops being storable and the whole design collapses back into code.
 */

export interface MappingConfig {
  /** Schema version of this config document, for migration. */
  readonly version: 1;
  readonly connectorId: string;
  /** Optional customer/tenant scope; absent means the connector default. */
  readonly tenantId?: string;
  readonly entityMappings: readonly EntityMapping[];
  /** Reusable value lookup tables referenced by `LookupTransform`. */
  readonly lookupTables?: readonly LookupTable[];
}

export interface EntityMapping {
  readonly canonicalType: CanonicalEntityType;
  /** The external system's name for this record type, e.g. "JournalEntry". */
  readonly externalType: string;
  readonly fields: readonly FieldMapping[];
  /**
   * Records the adapter should skip entirely, as a simple predicate descriptor.
   * Keeps "we don't import voided entries" out of connector code.
   */
  readonly filters?: readonly FilterRule[];
}

export interface FieldMapping {
  /**
   * Dot path into the canonical object, e.g. "lines[].accountId".
   * `[]` marks the collection level at which the mapping repeats.
   */
  readonly canonicalPath: string;
  /** Dot path into the external payload, e.g. "custcol_job_no". */
  readonly externalPath: string;
  readonly transform?: TransformSpec;
  readonly required: boolean;
  /** Applied when the external value is absent. Must be a literal. */
  readonly defaultValue?: string | number | boolean | null;
  readonly direction: 'INBOUND' | 'OUTBOUND' | 'BOTH';
}

/**
 * Tagged union of transforms. Deliberately small — a config language that grows
 * general-purpose becomes a programming language with none of the tooling, and
 * anything genuinely bespoke belongs in the adapter, not the config.
 */
export type TransformSpec =
  | { readonly kind: 'direct' }
  | { readonly kind: 'constant'; readonly value: string | number | boolean }
  | { readonly kind: 'lookup'; readonly tableId: string; readonly onMissing: 'ERROR' | 'PASSTHROUGH' | 'NULL' }
  | { readonly kind: 'dateFormat'; readonly from: string; readonly to: string }
  | {
      readonly kind: 'money';
      /** Where to read the currency, if not fixed. */
      readonly currencyPath?: string;
      readonly fixedCurrency?: string;
      /** Minor-unit exponent of the SOURCE value. */
      readonly sourceScale: number;
    }
  | { readonly kind: 'concat'; readonly sources: readonly string[]; readonly separator: string }
  | { readonly kind: 'negate' }
  | {
      readonly kind: 'signFromField';
      /** Path to a debit/credit indicator; `debitWhen` values mean positive. */
      readonly indicatorPath: string;
      readonly debitWhen: readonly string[];
    };

export interface LookupTable {
  readonly id: string;
  readonly description?: string;
  /** External value -> canonical value. Both sides strings; caller coerces. */
  readonly entries: Readonly<Record<string, string>>;
}

export interface FilterRule {
  readonly externalPath: string;
  readonly op: 'equals' | 'notEquals' | 'in' | 'notIn' | 'exists' | 'notExists';
  readonly value?: string | number | boolean | readonly string[];
}

/**
 * Result shape a future mapping engine would return. Declared now so callers
 * can be written against it; nothing implements it yet.
 */
export interface MappingDiagnostics {
  readonly unmappedCanonicalPaths: readonly string[];
  readonly unmappedExternalPaths: readonly string[];
  readonly missingRequired: readonly string[];
}
