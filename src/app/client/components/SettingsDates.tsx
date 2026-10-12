import { Stack, Switch, Title } from "@mantine/core";
import { useState } from "react";

import { SettingSelect } from "@/app/client/components/SettingSelect";
import type { Settings } from "@/app/shared/schemas/settings";
import {
  DATE_FORMAT_SAMPLE,
  formatLongDate,
  formatShortDate,
  formatTime,
  LONG_DATE_FORMATS,
  longDateFormatSchema,
  SHORT_DATE_FORMATS,
  shortDateFormatSchema,
  TIME_FORMATS,
  timeFormatSchema,
} from "@/app/shared/utils/dates";

// Rendered through the same functions the app formats with, so an option
// cannot describe itself incorrectly. The sample is a fixed local time, which
// formats identically on the server and in the browser — so once, at import.
const withExample = <T extends string>(
  options: { value: T; label: string }[],
  format: (value: T, date: Date) => string,
) =>
  options.map(({ value, label }) => ({
    value,
    label: `${label} — ${format(value, DATE_FORMAT_SAMPLE)}`,
  }));

const SHORT_DATE_OPTIONS = withExample(SHORT_DATE_FORMATS, formatShortDate);
const LONG_DATE_OPTIONS = withExample(LONG_DATE_FORMATS, formatLongDate);
const TIME_OPTIONS = withExample(TIME_FORMATS, formatTime);

type DateSettings = Pick<
  Settings,
  "shortDateFormat" | "longDateFormat" | "timeFormat" | "showRelativeDates"
>;

// Every control here holds its own value so it answers the click immediately;
// the write and the loader that follows it land afterwards.
export const SettingsDates = ({
  settings,
  commitNow,
}: {
  settings: DateSettings;
  commitNow: (patch: Partial<DateSettings>) => void;
}) => {
  const [dates, setDates] = useState<DateSettings>({
    shortDateFormat: settings.shortDateFormat,
    longDateFormat: settings.longDateFormat,
    timeFormat: settings.timeFormat,
    showRelativeDates: settings.showRelativeDates,
  });

  const change = (patch: Partial<DateSettings>) => {
    setDates((current) => ({ ...current, ...patch }));
    commitNow(patch);
  };

  return (
    <Stack>
      <Title order={2} size="h4">
        Dates
      </Title>

      <SettingSelect
        label="Short date format"
        data={SHORT_DATE_OPTIONS}
        value={dates.shortDateFormat}
        schema={shortDateFormatSchema}
        onChange={(shortDateFormat) => change({ shortDateFormat })}
      />

      <SettingSelect
        label="Long date format"
        data={LONG_DATE_OPTIONS}
        value={dates.longDateFormat}
        schema={longDateFormatSchema}
        onChange={(longDateFormat) => change({ longDateFormat })}
      />

      <SettingSelect
        label="Time format"
        data={TIME_OPTIONS}
        value={dates.timeFormat}
        schema={timeFormatSchema}
        onChange={(timeFormat) => change({ timeFormat })}
      />

      <Switch
        label="Show relative dates"
        description="Show “2 hours ago” instead of a timestamp, with the exact time on hover."
        checked={dates.showRelativeDates}
        onChange={(event) =>
          change({ showRelativeDates: event.currentTarget.checked })
        }
      />
    </Stack>
  );
};
