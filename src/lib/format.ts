export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function humanizeDuration(ms: number): string {
  const sec = ms / 1000;
  if (sec < 60) return "just now";
  const min = sec / 60;
  if (min < 60) return `${Math.floor(min)} minutes ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)} hours ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  return `${Math.floor(months / 12)} years ago`;
}

export function formatKeyDisplay(appName: string, machine: string, hint: string): string {
  const base = `${appName}_${machine}`;
  return hint ? `${base}_${hint}` : base;
}
