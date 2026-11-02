export function normalizeTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(String(value))
    ? `${String(value).replace(' ', 'T')}Z`
    : value
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  }).format(new Date(normalizeTimestamp(value)))
}
