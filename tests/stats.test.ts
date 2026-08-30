import { describe, it, expect } from "vitest";
import { validateAndFixStats } from "../supabase/functions/_shared/utils.ts";

describe("validateAndFixStats", () => {
  it("returns default stats when input is empty", () => {
    const result = validateAndFixStats(null);
    // empty input => all 10 => sum 60 => diff +12 clamped to STR max 18
    expect(result.STR).toBe(18);
    expect(result.DEX).toBe(10);
    expect(result.CON).toBe(10);
    expect(result.INT).toBe(10);
    expect(result.WIS).toBe(10);
    expect(result.CHA).toBe(10);
  });

  it("clamps values to 3-18 range", () => {
    const result = validateAndFixStats({ STR: 1, DEX: 20, CON: -5, INT: 25 });
    expect(result.STR).toBe(3);
    expect(result.DEX).toBe(18);
    expect(result.CON).toBe(3);
    expect(result.INT).toBe(18);
  });

  it("keeps sum exactly 72 for valid balanced input", () => {
    const input = { STR: 14, DEX: 12, CON: 13, INT: 10, WIS: 11, CHA: 12 };
    const result = validateAndFixStats(input);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBe(72);
  });

  it("does not break valid input", () => {
    const input = { STR: 16, DEX: 10, CON: 12, INT: 10, WIS: 14, CHA: 10 };
    const result = validateAndFixStats(input);
    expect(result.STR).toBe(16);
    expect(result.WIS).toBe(14);
  });

  it("handles partial input by filling missing stats with 10", () => {
    const result = validateAndFixStats({ STR: 18 });
    expect(result.STR).toBe(18);
    expect(result.DEX).toBe(10);
    expect(result.CON).toBe(10);
    expect(result.INT).toBe(10);
    expect(result.WIS).toBe(10);
    expect(result.CHA).toBe(10);
  });

  it("adjusts within bounds when fixing sum", () => {
    // STR=18, others sum=56, total=74, diff=-2
    const input = { STR: 18, DEX: 13, CON: 13, INT: 10, WIS: 10, CHA: 10 };
    const result = validateAndFixStats(input);
    expect(result.STR).toBe(16);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBe(72);
  });

  it("clamps low sum adjustment and keeps values within 3-18", () => {
    // all 3 => sum 18, diff +54. Only STR can be increased to 18 (+15), remainder 39 cannot be applied to one stat.
    const input = { STR: 3, DEX: 3, CON: 3, INT: 3, WIS: 3, CHA: 3 };
    const result = validateAndFixStats(input);
    expect(result.STR).toBe(18);
    Object.values(result).forEach((v) => expect(v).toBeGreaterThanOrEqual(3));
    Object.values(result).forEach((v) => expect(v).toBeLessThanOrEqual(18));
  });
});
