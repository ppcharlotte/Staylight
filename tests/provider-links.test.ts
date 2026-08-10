import assert from "node:assert/strict";
import test from "node:test";
import { buildProviderSearchUrl } from "../lib/provider-links";

const trip = {
  checkIn: "2026-09-15",
  checkOut: "2026-09-20",
  adults: 2,
  rooms: 1
};

test("builds Booking and Agoda searches with hotel and trip details", () => {
  const booking = new URL(buildProviderSearchUrl("Booking.com", "Hotel Niwa", "Tokyo", trip, "https://google.example"));
  const agoda = new URL(buildProviderSearchUrl("Agoda", "Hotel Niwa", "Tokyo", trip, "https://google.example"));

  assert.equal(booking.hostname, "www.booking.com");
  assert.equal(booking.searchParams.get("ss"), "Hotel Niwa, Tokyo");
  assert.equal(booking.searchParams.get("checkin"), trip.checkIn);
  assert.equal(agoda.hostname, "www.agoda.com");
  assert.equal(agoda.searchParams.get("text"), "Hotel Niwa, Tokyo");
  assert.equal(agoda.searchParams.get("rooms"), "1");
});

test("keeps the supplied fallback for an unknown provider", () => {
  assert.equal(
    buildProviderSearchUrl("Independent provider", "Hotel Niwa", "Tokyo", trip, "https://google.example"),
    "https://google.example"
  );
});
