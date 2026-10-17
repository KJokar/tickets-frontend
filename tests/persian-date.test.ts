import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPersianDate, fromPersianDate, persianMonthLength, toPersianDate } from "../src/lib/persian-date";

test("Persian calendar handles Nowruz and leap Esfand correctly", () => {
  assert.deepEqual(toPersianDate("2024-03-20"), { year: 1403, month: 1, day: 1 });
  assert.equal(fromPersianDate(1403, 1, 1), "2024-03-20");
  assert.equal(fromPersianDate(1403, 12, 30), "2025-03-20");
  assert.equal(fromPersianDate(1404, 1, 1), "2025-03-21");
  assert.equal(fromPersianDate(1404, 12, 30), "");
  assert.equal(persianMonthLength(1403, 12), 30);
  assert.equal(persianMonthLength(1404, 12), 29);
  assert.equal(formatPersianDate("2025-03-21"), "۱۴۰۴/۰۱/۰۱");
});

test("Persian calendar round-trips report date boundaries and rejects invalid days", () => {
  for (const iso of ["2000-01-01", "2026-10-16", "2100-12-31"]) {
    const p = toPersianDate(iso); assert.equal(fromPersianDate(p.year, p.month, p.day), iso);
  }
  assert.equal(fromPersianDate(1405, 7, 31), "");
  assert.equal(fromPersianDate(1405, 13, 1), "");
});
