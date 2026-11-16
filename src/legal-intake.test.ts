import assert from "node:assert/strict";
import { deadlineState } from "./legal-intake.ts";

const now = new Date("2026-01-10T00:00:00.000Z");
assert.equal(deadlineState("2026-01-09T00:00:00.000Z", now), "follow-up");
assert.equal(deadlineState("2026-01-11T00:00:00.000Z", now), "scheduled");
console.log("deadline decision: follow-up for due matters, scheduled for future matters");
