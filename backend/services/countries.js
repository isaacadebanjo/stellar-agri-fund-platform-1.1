// Multi-country reference taxonomy. The platform's initial operating markets,
// each with its local reporting currency and the regions/provinces produce is
// grown in. Kept as one source of truth shared by the geography rollups, project
// validation and the frontend selectors. Additive — adding a country here makes
// it available everywhere without code changes elsewhere.
export const COUNTRIES = [
  {
    code: 'ZA', name: 'South Africa', currency: 'ZAR',
    regions: ['Western Cape', 'Eastern Cape', 'KwaZulu-Natal', 'Gauteng', 'Limpopo', 'Mpumalanga', 'Free State', 'North West', 'Northern Cape']
  },
  {
    code: 'CM', name: 'Cameroon', currency: 'XAF',
    regions: ['Centre', 'Littoral', 'West', 'North West', 'South West', 'Adamawa', 'East', 'Far North', 'North', 'South']
  },
  {
    code: 'KE', name: 'Kenya', currency: 'KES',
    regions: ['Rift Valley', 'Central', 'Eastern', 'Nyanza', 'Western', 'Coast', 'Nairobi', 'North Eastern']
  },
  {
    code: 'NG', name: 'Nigeria', currency: 'NGN',
    regions: ['North Central', 'North East', 'North West', 'South East', 'South South', 'South West']
  }
];

const BY_CODE = new Map(COUNTRIES.map(c => [c.code, c]));

export function isValidCountry(code) {
  return BY_CODE.has(code);
}

export function getCountry(code) {
  return BY_CODE.get(code) || null;
}

export function countryName(code) {
  return BY_CODE.get(code)?.name || code || '';
}

export function defaultCurrency(code) {
  return BY_CODE.get(code)?.currency || '';
}
