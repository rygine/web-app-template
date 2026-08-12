import { describe, expect, it } from "vitest";

import {
  DATE_FORMAT_SAMPLE,
  formatDateTime,
  formatLongDate,
  formatShortDate,
  formatTime,
  LONG_DATE_FORMATS,
  SHORT_DATE_FORMATS,
  TIME_FORMATS,
} from "@/app/shared/utils/dates";

// Built from local components so the rendering is the same in every timezone.
const sample = new Date(2026, 7, 21, 14, 45);

describe("formatShortDate", () => {
  it("renders each option in the order its name claims", () => {
    expect(formatShortDate("mdy", sample)).toBe("08/21/2026");
    expect(formatShortDate("dmy", sample)).toBe("21/08/2026");
    expect(formatShortDate("ymd", sample)).toBe("2026-08-21");
  });
});

describe("formatLongDate", () => {
  it("renders each option in the order its name claims", () => {
    expect(formatLongDate("weekdayMonthDay", sample)).toBe(
      "Friday, August 21, 2026",
    );
    expect(formatLongDate("weekdayDayMonth", sample)).toBe(
      "Friday, 21 August 2026",
    );
    expect(formatLongDate("monthDay", sample)).toBe("August 21, 2026");
    expect(formatLongDate("dayMonth", sample)).toBe("21 August 2026");
  });
});

describe("formatTime", () => {
  it("renders each option in the clock its name claims", () => {
    expect(formatTime("h12", sample)).toBe("2:45 PM");
    expect(formatTime("h24", sample)).toBe("14:45");
  });
});

describe("formatDateTime", () => {
  it("joins the chosen date and time formats", () => {
    expect(
      formatDateTime({ shortDateFormat: "ymd", timeFormat: "h24" }, sample),
    ).toBe("2026-08-21 14:45");
  });
});

describe("the option tables", () => {
  it("gives every short date format a label and an example", () => {
    for (const { value, label } of SHORT_DATE_FORMATS) {
      expect(label.length).toBeGreaterThan(0);
      expect(formatShortDate(value, DATE_FORMAT_SAMPLE).length).toBeGreaterThan(
        0,
      );
    }
  });

  it("gives every long date format a label and an example", () => {
    for (const { value, label } of LONG_DATE_FORMATS) {
      expect(label.length).toBeGreaterThan(0);
      expect(formatLongDate(value, DATE_FORMAT_SAMPLE).length).toBeGreaterThan(
        0,
      );
    }
  });

  it("gives every time format a label and an example", () => {
    for (const { value, label } of TIME_FORMATS) {
      expect(label.length).toBeGreaterThan(0);
      expect(formatTime(value, DATE_FORMAT_SAMPLE).length).toBeGreaterThan(0);
    }
  });

  it("labels the mdy option by what it produces, not by its identifier", () => {
    const mdy = SHORT_DATE_FORMATS.find(({ value }) => value === "mdy");

    expect(mdy?.label).toBe("Month/Day/Year");
  });
});
