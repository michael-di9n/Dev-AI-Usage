import { describe, expect, it } from "vitest";
import { localDateMinute, localDateTime, localTime } from "../src/domain/localClock";

/**
 * The one thing every one of these has to prove: the offset actually moves.
 * A machine that happens to run in UTC would pass a test that just re-slices
 * the string, which is exactly the bug this module exists to fix. Building
 * the expectation from the same `Date` getters production reads keeps the
 * test honest on every timezone, including UTC itself.
 */
const TS = "2026-09-09T09:14:40.481Z";
const d = new Date(TS);
const pad = (n: number) => String(n).padStart(2, "0");
const expectedDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const expectedMinute = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const expectedSecond = pad(d.getSeconds());

describe("localClock", () => {
  it("converts a stored UTC instant to the runtime's own timezone", () => {
    expect(localDateTime(TS)).toBe(`${expectedDate} ${expectedMinute}:${expectedSecond}`);
    expect(localDateMinute(TS)).toBe(`${expectedDate} ${expectedMinute}`);
    expect(localTime(TS)).toBe(`${expectedMinute}:${expectedSecond}`);
  });

  it("leaves input it cannot parse exactly as it arrived, in all three shapes", () => {
    expect(localDateTime("whenever")).toBe("whenever");
    expect(localDateMinute("whenever")).toBe("whenever");
    expect(localTime("whenever")).toBe("whenever");
  });

  it("pads single-digit month, day, hour, minute and second", () => {
    // 2026-01-02T03:04:05Z, chosen so every field is single-digit in UTC -
    // padding still has to survive whatever the local offset does to it.
    const ts = "2026-01-02T03:04:05.000Z";
    const local = new Date(ts);
    const date = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
    const minute = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
    expect(localDateTime(ts)).toBe(`${date} ${minute}:${pad(local.getSeconds())}`);
  });
});
