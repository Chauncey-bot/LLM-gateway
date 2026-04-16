export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function formatWindowDuration(seconds: number, isZh: boolean): string {
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return isZh ? `${days}天` : `${days}d`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return isZh ? `${hours}小时` : `${hours}h`;
  }
  const minutes = Math.floor(seconds / 60);
  return isZh ? `${minutes}分钟` : `${minutes}m`;
}

export function formatResetTime(unixSec: number, isZh: boolean): string {
  const d = new Date(unixSec * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return time;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  ) {
    return (isZh ? "\u660e\u5929 " : "Tomorrow ") + time;
  }

  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return date + " " + time;
}
