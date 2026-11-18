const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", or a date. */
export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = Math.max(0, now - timestamp);
  if (diff < MINUTE) {
    return 'Just now';
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} min ago`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} h ago`;
  }
  if (diff < 2 * DAY) {
    return 'Yesterday';
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)} days ago`;
  }
  return formatDay(timestamp);
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "28 Oct 2026" — a calendar day, no locale dependency. */
export function formatDay(timestamp) {
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
