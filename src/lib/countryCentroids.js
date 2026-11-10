// Approximate country centroids (lat, lng) keyed by common display names and
// ISO-2 codes, as they typically appear in Orchard royalty CSVs. Countries not
// listed here simply won't get a map marker (the summary table still shows them).
const RAW = {
  india: [22.59, 78.96],
  'united states': [37.09, -95.71],
  usa: [37.09, -95.71],
  'united kingdom': [55.37, -3.43],
  uk: [55.37, -3.43],
  britain: [55.37, -3.43],
  england: [52.35, -1.17],
  canada: [56.13, -106.35],
  australia: [25.27, 133.77],
  germany: [51.16, 10.45],
  france: [46.6, 2.21],
  ireland: [53.41, -8.24],
  spain: [40.46, -3.74],
  italy: [41.87, 12.56],
  portugal: [39.4, -8.22],
  netherlands: [52.13, 5.29],
  belgium: [50.5, 4.47],
  switzerland: [46.82, 8.23],
  austria: [47.52, 14.55],
  sweden: [60.13, 18.64],
  norway: [60.47, 8.47],
  denmark: [56.26, 9.5],
  finland: [61.92, 25.75],
  poland: [51.92, 19.15],
  'czech republic': [49.82, 15.47],
  czechia: [49.82, 15.47],
  greece: [39.07, 21.82],
  brazil: [14.24, -51.93],
  mexico: [23.63, -102.55],
  argentina: [38.42, -63.62],
  chile: [35.68, -71.54],
  colombia: [4.57, -74.3],
  peru: [9.19, -75.02],
  japan: [36.2, 138.25],
  'south korea': [35.91, 127.77],
  korea: [35.91, 127.77],
  china: [35.86, 104.2],
  singapore: [1.35, 103.82],
  malaysia: [4.21, 101.98],
  thailand: [15.87, 100.99],
  indonesia: [0.79, 113.92],
  philippines: [12.88, 121.77],
  vietnam: [14.06, 108.28],
  'hong kong': [22.32, 114.17],
  taiwan: [23.7, 120.96],
  'united arab emirates': [23.42, 53.85],
  uae: [23.42, 53.85],
  'saudi arabia': [23.89, 45.08],
  qatar: [25.35, 51.18],
  turkey: [38.96, 35.24],
  israel: [31.05, 34.85],
  egypt: [26.82, 30.8],
  'south africa': [30.56, 22.94],
  nigeria: [9.08, 8.68],
  kenya: [0.02, 37.91],
  ghana: [7.95, -1.02],
  morocco: [31.79, -7.09],
  russia: [61.52, 105.32],
  ukraine: [48.93, 31.17],
  romania: [45.94, 24.97],
  hungary: [47.16, 19.5],
  'new zealand': [-41.5, 174.89],
  bangladesh: [23.68, 90.36],
  pakistan: [30.38, 69.35],
  'sri lanka': [7.87, 80.77],
  nepal: [28.39, 84.12],
  jordan: [30.59, 36.81],
  lebanon: [33.85, 35.86]
};

export const COUNTRY_CENTROIDS = new Map(
  Object.entries(RAW).map(([k, v]) => [k, { lat: v[0], lng: v[1] }])
);

export function getCentroid(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return COUNTRY_CENTROIDS.get(key) || null;
}