export type Platform = "mac" | "win";

export function getPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("macintosh") || ua.includes("mac os")) return "mac";
  return "win";
}

/** Apply platform class to <html> element on startup */
export function applyPlatformClass(): void {
  const platform = getPlatform();
  document.documentElement.classList.add(`platform-${platform}`);
}
