// Country fallback split rule for vendor reports (e.g. PDL) that lack
// territory data. When a row has no country (NULL/empty/"Unknown"), the
// revenue and units are distributed across target countries using
// configured weights. Currently applies to client "Joelle Sahar".

export interface CountrySplit {
  name: string;
  weight: number;
}

// Distribution weights for Joelle Sahar's fallback country split.
// Weights sum to 1.0 so gross/units totals are preserved exactly.
export const JOELLE_SAHAR_SPLIT: CountrySplit[] = [
  { name: "United States", weight: 0.45 },
  { name: "United Arab Emirates", weight: 0.35 },
  { name: "United Kingdom", weight: 0.10 },
  { name: "India", weight: 0.06 },
  { name: "Canada", weight: 0.04 },
];

// Returns the country split rule for a client, or null if no rule applies.
export function getCountryFallback(clientName: string | null | undefined): CountrySplit[] | null {
  if (!clientName) return null;
  const name = clientName.toLowerCase().trim();
  if (name.includes("joelle sahar")) {
    return JOELLE_SAHAR_SPLIT;
  }
  return null;
}

// Checks if a country value is missing/unknown and should trigger the fallback.
export function isCountryMissing(country: string | null | undefined): boolean {
  if (!country) return true;
  const c = String(country).trim().toLowerCase();
  return c === "" || c === "unknown" || c === "n/a" || c === "na" || c === "null";
}

// Splits a single row into multiple rows (one per fallback country) when the
// row has no country data and the client has a configured fallback split rule.
// Each split row gets a weighted portion of gross_revenue and units so totals
// are preserved exactly. When no fallback applies (or the row already has a
// country), the original row is returned unchanged — making this safe to call
// on every row during ingestion.
export function applyCountrySplit(
  row: Record<string, any>,
  clientName: string | null | undefined
): Record<string, any>[] {
  const fallback = getCountryFallback(clientName);
  if (!fallback || !isCountryMissing(row.country)) return [row];
  return fallback.map(cs => ({
    ...row,
    country: cs.name,
    gross_revenue: (Number(row.gross_revenue) || 0) * cs.weight,
    units: (Number(row.units) || 0) * cs.weight,
  }));
}