/** Presentation helpers shared across the workspace routes. */

export function shortHash(value: string, start = 8, end = 6) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function seconds(value: number) {
  return `${value.toFixed(3)}s`;
}

export function timestamp(value: number) {
  const minutes = Math.floor(value / 60);
  const remaining = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining
    .toFixed(3)
    .padStart(6, "0")}`;
}

export function percent(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${Math.abs(value * 100).toFixed(2)}%`;
}

export function readableAction(value: string) {
  return value.replaceAll("_", " ");
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

export function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
