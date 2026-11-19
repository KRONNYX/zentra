export const DEFAULT_BUSINESS_DAY_CUTOFF = "06:00";

// Matches public.current_business_date(bar_id): Nairobi time, rolling over at
// the bar's cutoff so a shift that runs past midnight is one business day.
export function currentBusinessDate(cutoff?: string | null, now = new Date()) {
  const [hours = 6, minutes = 0] = (cutoff || DEFAULT_BUSINESS_DAY_CUTOFF)
    .split(":")
    .map(Number);
  const shifted = new Date(now.getTime() - (hours * 60 + minutes) * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}
