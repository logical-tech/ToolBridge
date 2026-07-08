const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
]

/** "3 minutes ago" from an ISO timestamp. */
export function relativeTime(iso: string): string {
  const diff = (Date.parse(iso) - Date.now()) / 1000
  for (const [unit, secs] of STEPS) {
    if (Math.abs(diff) >= secs || unit === "second")
      return rtf.format(Math.round(diff / secs), unit)
  }
  return "now"
}
