import { describe, expect, it } from "vitest";
import { computeBudget, SPEC_MIN_LOADED } from "../app/lib/model-slots";

const nav = (hints: object) => hints as Navigator;

describe("3D model budget", () => {
  it("never goes below the spec's 4", () => {
    expect(computeBudget(nav({ deviceMemory: 1 }), false)).toBe(SPEC_MIN_LOADED);
  });
  it("drops to the minimum with data saver or a slow network", () => {
    expect(computeBudget(nav({ deviceMemory: 8, connection: { saveData: true } }), true)).toBe(4);
    expect(computeBudget(nav({ deviceMemory: 8, connection: { effectiveType: "3g" } }), true)).toBe(4);
  });
  it("covers a phone screen (2 columns × 3 rows)", () => {
    expect(computeBudget(nav({ deviceMemory: 4 }), false)).toBe(6);
    expect(computeBudget(nav({}), false)).toBe(6); // Safari: no deviceMemory
  });
  it("covers a desktop grid", () => {
    expect(computeBudget(nav({}), true)).toBe(12);
    expect(computeBudget(nav({ deviceMemory: 8 }), true)).toBe(24);
  });
});
