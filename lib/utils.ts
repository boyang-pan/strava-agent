import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format pace in seconds/meter to mm:ss/km */
export function formatPace(secondsPerMeter: number): string {
  const secondsPerKm = secondsPerMeter * 1000;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}/km`;
}

/** Format distance in meters to human-readable string */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/** Format duration in seconds to h:mm:ss or mm:ss */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Group conversations by recency */
export function groupByRecency<T extends { created_at: string }>(
  items: T[]
): { today: T[]; thisWeek: T[]; earlier: T[] } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  return items.reduce(
    (acc, item) => {
      const date = new Date(item.created_at);
      if (date >= startOfToday) {
        acc.today.push(item);
      } else if (date >= startOfWeek) {
        acc.thisWeek.push(item);
      } else {
        acc.earlier.push(item);
      }
      return acc;
    },
    { today: [] as T[], thisWeek: [] as T[], earlier: [] as T[] }
  );
}
