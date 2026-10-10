type SendingWindow = { timezone: string; sendWindowStart: string; sendWindowEnd: string; sendDays: unknown };

export function campaignStepTime(from: Date, settings: SendingWindow) {
  const days = Array.isArray(settings.sendDays) ? new Set(settings.sendDays.filter((day): day is number => Number.isInteger(day))) : new Set([1, 2, 3, 4, 5]);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const minute = 60_000;
  const start = Math.ceil(from.getTime() / minute) * minute;
  for (let offset = 0; offset <= 8 * 24 * 60; offset += 1) {
    const candidate = new Date(start + offset * minute);
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(({ type, value }) => [type, value]));
    const localTime = `${parts.hour}:${parts.minute}`;
    if (days.has(weekdays[parts.weekday ?? ""] ?? -1) && localTime >= settings.sendWindowStart && localTime < settings.sendWindowEnd) return candidate;
  }
  throw new Error("No allowed automation send time was found in the next eight days");
}
