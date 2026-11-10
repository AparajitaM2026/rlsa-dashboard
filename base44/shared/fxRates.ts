// Shared FX rate lookup for PDL vendor INR→USD conversion.
// Checks the MonthlyFxRate entity first, then auto-fetches from the
// Frankfurter API (free, no API key required) and caches in the DB.

const API_BASE = "https://api.frankfurter.app";

// In-memory cache for the current processing session: "YYYY-MM" -> rate
const rateCache = new Map<string, number>();

/**
 * Get the monthly USD→INR exchange rate for a given year/month.
 * Checks: in-memory cache → MonthlyFxRate DB entity → Frankfurter API (auto-cached).
 * Returns null if the rate cannot be determined.
 */
export async function getMonthlyFxRate(
  base44: any,
  year: number,
  month: number
): Promise<number | null> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  if (rateCache.has(key)) return rateCache.get(key)!;

  // 1. Check DB
  try {
    const existing = await base44.asServiceRole.entities.MonthlyFxRate.filter(
      { year, month },
      "-created_date",
      1
    );
    if (existing.length > 0 && existing[0].rate) {
      rateCache.set(key, existing[0].rate);
      return existing[0].rate;
    }
  } catch {
    // Entity might not exist yet — continue to API fetch
  }

  // 2. Fetch from Frankfurter API (first day of the month; API returns
  //    the most recent business day's rate if the 1st is a weekend/holiday)
  try {
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    const res = await fetch(`${API_BASE}/${date}?from=USD&to=INR`);
    if (!res.ok) throw new Error(`FX API returned HTTP ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.INR;
    if (!rate || !Number.isFinite(rate)) throw new Error("No INR rate in API response");

    // 3. Cache in DB for future use
    try {
      await base44.asServiceRole.entities.MonthlyFxRate.create({
        year,
        month,
        rate,
        source: "frankfurter",
      });
    } catch {
      // Ignore DB write errors — the rate is still usable for this session
    }

    rateCache.set(key, rate);
    return rate;
  } catch (err) {
    console.error(`[FX] Failed to fetch rate for ${key}:`, err.message);
    return null;
  }
}