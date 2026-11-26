/** Device label for the login log: "Android · Chrome", "Windows · Firefox". */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return '—';
  const ua = userAgent.toLowerCase();

  const platform = /android/.test(ua)
    ? 'Android'
    : /iphone/.test(ua)
      ? 'iPhone'
      : /ipad/.test(ua)
        ? 'iPad'
        : /windows/.test(ua)
          ? 'Windows'
          : /mac os x|macintosh/.test(ua)
            ? 'macOS'
            : /cros/.test(ua)
              ? 'ChromeOS'
              : /linux/.test(ua)
                ? 'Linux'
                : null;

  // Order matters: Edge and Opera also call themselves Chrome, Chrome calls
  // itself Safari.
  const browser = /edg\//.test(ua)
    ? 'Edge'
    : /opr\/|opera/.test(ua)
      ? 'Opera'
      : /yabrowser/.test(ua)
        ? 'Yandex'
        : /firefox|fxios/.test(ua)
          ? 'Firefox'
          : /chrome|crios/.test(ua)
            ? 'Chrome'
            : /safari/.test(ua)
              ? 'Safari'
              : null;

  if (!platform && !browser) return '—';
  return [platform, browser].filter(Boolean).join(' · ');
}
