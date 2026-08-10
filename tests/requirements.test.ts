import assert from "node:assert/strict";
import test from "node:test";
import { extractRequirementPriorities, isExplicitInterviewFinish, isNoMoreAnswer } from "../lib/requirements";

test("extracts meaningful priorities and normalizes misspelled cleanliness", () => {
  assert.deepEqual(
    extractRequirementPriorities("Safety matters, and I don't want a dirty room. Cleaness is essential."),
    ["Late-night safety", "Cleanliness"]
  );
});

test("does not turn unrelated conversation into priorities", () => {
  assert.deepEqual(extractRequirementPriorities("I am visiting a friend for a few days."), []);
});

test("extracts hostel avoidance only from an explicit negative preference", () => {
  assert.deepEqual(extractRequirementPriorities("I will not stay in a hostel."), ["Avoid hostels"]);
  assert.deepEqual(extractRequirementPriorities("Is this hotel near a hostel?"), []);
});

test("extracts an explicit private bathroom requirement", () => {
  assert.deepEqual(extractRequirementPriorities("I need a private bathroom, not shared facilities."), ["Private bathroom"]);
});

test("recognizes natural interview completion phrases with punctuation", () => {
  assert.equal(isNoMoreAnswer("no,that would be all"), true);
  assert.equal(isExplicitInterviewFinish("No, that would be all."), true);
  assert.equal(isNoMoreAnswer("没有更多问题了。"), true);
  assert.equal(isExplicitInterviewFinish("no"), false);
});
