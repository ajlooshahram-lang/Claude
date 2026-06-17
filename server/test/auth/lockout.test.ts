import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  recordFailedAttempt,
  isLocked,
  resetAttempts,
  clearLockoutStore,
} from "../../src/auth/lockout.js";

beforeEach(() => {
  clearLockoutStore();
  mock.timers.reset();
});

test("lockout: first attempt is not locked", () => {
  const result = recordFailedAttempt("user@test.com");
  assert.equal(result.locked, false);
  assert.equal(result.attemptsRemaining, 4);
});

test("lockout: four attempts are not locked", () => {
  for (let i = 0; i < 3; i++) {
    recordFailedAttempt("user@test.com");
  }
  const result = recordFailedAttempt("user@test.com");
  assert.equal(result.locked, false);
  assert.equal(result.attemptsRemaining, 1);
});

test("lockout: fifth attempt triggers lockout", () => {
  for (let i = 0; i < 4; i++) {
    recordFailedAttempt("user@test.com");
  }
  const result = recordFailedAttempt("user@test.com");
  assert.equal(result.locked, true);
  assert.equal(result.attemptsRemaining, 0);
});

test("lockout: isLocked returns true after lockout", () => {
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt("user@test.com");
  }
  assert.equal(isLocked("user@test.com"), true);
});

test("lockout: isLocked is case-insensitive", () => {
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt("User@Test.COM");
  }
  assert.equal(isLocked("user@test.com"), true);
});

test("lockout: locked account stays locked within 15 minutes", () => {
  mock.timers.enable({ apis: ["Date"] });
  const start = Date.now();
  mock.timers.setTime(start);

  for (let i = 0; i < 5; i++) {
    recordFailedAttempt("user@test.com");
  }
  assert.equal(isLocked("user@test.com"), true);

  // Advance 14 minutes - still locked
  mock.timers.setTime(start + 14 * 60 * 1000);
  assert.equal(isLocked("user@test.com"), true);

  mock.timers.reset();
});

test("lockout: lockout expires after 15 minutes", () => {
  mock.timers.enable({ apis: ["Date"] });
  const start = Date.now();
  mock.timers.setTime(start);

  for (let i = 0; i < 5; i++) {
    recordFailedAttempt("user@test.com");
  }
  assert.equal(isLocked("user@test.com"), true);

  // Advance past 15 minutes
  mock.timers.setTime(start + 15 * 60 * 1000 + 1);
  assert.equal(isLocked("user@test.com"), false);

  mock.timers.reset();
});

test("lockout: resetAttempts clears lockout", () => {
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt("user@test.com");
  }
  assert.equal(isLocked("user@test.com"), true);

  resetAttempts("user@test.com");
  assert.equal(isLocked("user@test.com"), false);
});

test("lockout: isLocked returns false for unknown email", () => {
  assert.equal(isLocked("unknown@test.com"), false);
});

test("lockout: subsequent attempts while locked return locked", () => {
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt("user@test.com");
  }
  const result = recordFailedAttempt("user@test.com");
  assert.equal(result.locked, true);
  assert.equal(result.attemptsRemaining, 0);
});
