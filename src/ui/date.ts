const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatDisplayDate(value?: string | number | Date | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = DATE_FORMATTER.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  if (!day || !month || !year) {
    return null;
  }

  return `${month} ${day}, ${year}`;
}

export function formatDisplayTimestamp(value?: string | number | Date | null): string | null {
  const dateLabel = formatDisplayDate(value);
  if (!dateLabel) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value as any);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = TIME_FORMATTER.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;

  if (!hour || !minute || !dayPeriod) {
    return dateLabel;
  }

  return `${dateLabel} - ${hour}:${minute}${dayPeriod.toLowerCase()}`;
}
