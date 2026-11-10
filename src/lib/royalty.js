const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});
const currencyFmtMicro = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});
const numberFmt = new Intl.NumberFormat('en-US');

export const formatCurrency = (n) => {
  const v = Number(n) || 0;
  // Show micro-earnings (under $0.01) with up to 4 decimals instead of $0.00.
  return v !== 0 && Math.abs(v) < 0.01 ? currencyFmtMicro.format(v) : currencyFmt.format(v);
};
export const formatNumber = (n) => numberFmt.format(Number(n) || 0);

// Scale a gross amount by the client's revenue share percentage.
export const scaleRevenue = (gross, sharePct) =>
  (Number(gross) || 0) * ((Number(sharePct) || 0) / 100);

// Sum a field across rows.
export const sumField = (rows, field) =>
  rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

// Group rows by a key function and sum a value field (defaults to gross_revenue).
export const aggregate = (rows, keyFn, valueFn = (r) => Number(r.gross_revenue) || 0) => {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r) || 'Unknown';
    map.set(k, (map.get(k) || 0) + valueFn(r));
  }
  return Array.from(map, ([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
};