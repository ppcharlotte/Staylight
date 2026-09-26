import assert from "node:assert/strict";
import test from "node:test";
import { addDaysToDateInput, getDefaultTripDates, getTodayDateInputValue } from "../lib/trip";

test("formats today's local date for native date input limits", () => {
  assert.equal(getTodayDateInputValue(new Date(2026, 8, 26, 12)), "2026-09-26");
});

test("creates future default trip dates instead of fixed dates that expire", () => {
  assert.deepEqual(getDefaultTripDates(new Date(2026, 8, 26, 12)), {
    checkIn: "2026-09-27",
    checkOut: "2026-10-02"
  });
});

test("advances date input values across month and year boundaries", () => {
  assert.equal(addDaysToDateInput("2026-12-31", 1), "2027-01-01");
});
