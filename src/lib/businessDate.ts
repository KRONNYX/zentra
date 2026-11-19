// Matches public.current_business_date(): Nairobi time, rolling over at 06:00
// so a shift that runs past midnight is one business day.
const BUSINESS_DAY_CUTOFF_HOURS = 6;

export function currentBusinessDate(now = new Date()) {
  const shifted = new Date(now.getTime() - BUSINESS_DAY_CUTOFF_HOURS * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}
