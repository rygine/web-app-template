import { z } from "zod";

// Each option pins a locale as well as options: Intl decides field order from
// the locale, so "mdy" cannot be expressed by options alone.
type FormatSpec = {
  label: string;
  locale: string;
  options: Intl.DateTimeFormatOptions;
};

const SHORT_DATE_VALUES = ["mdy", "dmy", "ymd"] as const;
const LONG_DATE_VALUES = [
  "weekdayMonthDay",
  "weekdayDayMonth",
  "monthDay",
  "dayMonth",
] as const;
const TIME_VALUES = ["h12", "h24"] as const;

export const shortDateFormatSchema = z.enum(SHORT_DATE_VALUES, {
  error: "Short date format must be one of the offered formats.",
});
export const longDateFormatSchema = z.enum(LONG_DATE_VALUES, {
  error: "Long date format must be one of the offered formats.",
});
export const timeFormatSchema = z.enum(TIME_VALUES, {
  error: "Time format must be one of the offered formats.",
});

export type ShortDateFormat = z.infer<typeof shortDateFormatSchema>;
export type LongDateFormat = z.infer<typeof longDateFormatSchema>;
export type TimeFormat = z.infer<typeof timeFormatSchema>;

const SHORT_DATE_SPECS: Record<ShortDateFormat, FormatSpec> = {
  mdy: {
    label: "Month/Day/Year",
    locale: "en-US",
    options: { month: "2-digit", day: "2-digit", year: "numeric" },
  },
  dmy: {
    label: "Day/Month/Year",
    locale: "en-GB",
    options: { day: "2-digit", month: "2-digit", year: "numeric" },
  },
  ymd: {
    label: "Year-Month-Day",
    locale: "sv-SE",
    options: { year: "numeric", month: "2-digit", day: "2-digit" },
  },
};

const LONG_DATE_SPECS: Record<LongDateFormat, FormatSpec> = {
  weekdayMonthDay: {
    label: "Weekday, Month Day, Year",
    locale: "en-US",
    options: {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  },
  weekdayDayMonth: {
    label: "Weekday, Day Month Year",
    locale: "en-GB",
    options: {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  },
  monthDay: {
    label: "Month Day, Year",
    locale: "en-US",
    options: { month: "long", day: "numeric", year: "numeric" },
  },
  dayMonth: {
    label: "Day Month Year",
    locale: "en-GB",
    options: { day: "numeric", month: "long", year: "numeric" },
  },
};

const TIME_SPECS: Record<TimeFormat, FormatSpec> = {
  h12: {
    label: "12-hour",
    locale: "en-US",
    options: { hour: "numeric", minute: "2-digit", hour12: true },
  },
  h24: {
    label: "24-hour",
    locale: "en-GB",
    options: { hour: "2-digit", minute: "2-digit", hour12: false },
  },
};

// The timezone is deliberately left ambient — everything is stored in UTC and
// rendered in the viewer's own zone, which is why /items carries
// ssr: "data-only". Each formatter is built on first use and kept: constructing
// one costs forty times what formatting with it does, and a table builds
// several per row.
const formatters = new Map<FormatSpec, Intl.DateTimeFormat>();

const render = (spec: FormatSpec, date: Date) => {
  let formatter = formatters.get(spec);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(spec.locale, spec.options);
    formatters.set(spec, formatter);
  }
  return formatter.format(date);
};

// Driven by the value tuple rather than Object.entries, which would lose the
// key type and need an assertion to get it back.
const toOptions = <T extends string>(
  values: readonly T[],
  specs: Record<T, FormatSpec>,
) => values.map((value) => ({ value, label: specs[value].label }));

export const SHORT_DATE_FORMATS = toOptions(
  SHORT_DATE_VALUES,
  SHORT_DATE_SPECS,
);
export const LONG_DATE_FORMATS = toOptions(LONG_DATE_VALUES, LONG_DATE_SPECS);
export const TIME_FORMATS = toOptions(TIME_VALUES, TIME_SPECS);

export const formatShortDate = (value: ShortDateFormat, date: Date) =>
  render(SHORT_DATE_SPECS[value], date);

export const formatLongDate = (value: LongDateFormat, date: Date) =>
  render(LONG_DATE_SPECS[value], date);

export const formatTime = (value: TimeFormat, date: Date) =>
  render(TIME_SPECS[value], date);

export type DateTimeFormats = {
  shortDateFormat: ShortDateFormat;
  timeFormat: TimeFormat;
};

export const formatDateTime = (formats: DateTimeFormats, date: Date) =>
  `${formatShortDate(formats.shortDateFormat, date)} ${formatTime(formats.timeFormat, date)}`;

// The settings page renders every option's example through the same functions
// the app formats with, so an option cannot describe itself incorrectly.
export const DATE_FORMAT_SAMPLE = new Date(2026, 7, 21, 14, 45);
