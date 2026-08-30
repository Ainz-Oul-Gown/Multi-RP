import { describe, it, expect } from "vitest";
import { validateAndFixStats } from "../supabase/functions/_shared/utils.ts";
import { calculateHpFromStats, calculateInitiative, calculateArmorClass, calculateSavingThrows, calculateDerivedStats } from "../src/config.js";

describe("validateAndFixStats", () => {
  it("returns default stats when input is empty", () => {
    const result = validateAndFixStats(null);
    expect(result.STR).toBe(10);
    expect(result.DEX).toBe(10);
    expect(result.CON).toBe(10);
    expect(result.INT).toBe(10);
    expect(result.WIS).toBe(10);
    expect(result.CHA).toBe(10);
  });

  it("preserves values above 18 without clamping", () => {
    const result = validateAndFixStats({ STR: 20, DEX: 22, CON: 25 });
    expect(result.STR).toBe(20);
    expect(result.DEX).toBe(22);
    expect(result.CON).toBe(25);
  });

  it("preserves values below 3 without clamping", () => {
    const result = validateAndFixStats({ STR: -5, DEX: 0, CON: 1 });
    expect(result.STR).toBe(-5);
    expect(result.DEX).toBe(0);
    expect(result.CON).toBe(1);
  });

  it("does not force sum to 72", () => {
    const result = validateAndFixStats({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 });
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBe(60);
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
});

describe("calculateHpFromStats", () => {
  it("calculates HP from CON using D&D-like formula", () => {
    expect(calculateHpFromStats({ CON: 10 })).toBe(30);
    expect(calculateHpFromStats({ CON: 14 })).toBe(38);
    expect(calculateHpFromStats({ CON: 8 })).toBe(26);
  });

  it("falls back to 10 when stats object is empty or CON is missing", () => {
    expect(calculateHpFromStats({})).toBe(30);
    expect(calculateHpFromStats(null)).toBe(30);
    expect(calculateHpFromStats(undefined)).toBe(30);
  });
});

describe("calculateInitiative", () => {
  it("returns DEX modifier", () => {
    expect(calculateInitiative({ DEX: 10 })).toBe(0);
    expect(calculateInitiative({ DEX: 14 })).toBe(2);
    expect(calculateInitiative({ DEX: 8 })).toBe(-1);
  });

  it("falls back to 0 when DEX is missing", () => {
    expect(calculateInitiative({})).toBe(0);
    expect(calculateInitiative(null)).toBe(0);
  });
});

describe("calculateArmorClass", () => {
  it("calculates AC from DEX, race and equipment", () => {
    expect(calculateArmorClass({ DEX: 10 }, 'Человек', [])).toBe(10);
    expect(calculateArmorClass({ DEX: 14 }, 'Эльф', [])).toBe(12);
    expect(calculateArmorClass({ DEX: 8 }, 'Дварф', [])).toBe(10);
    expect(calculateArmorClass({ DEX: 14 }, 'Человек', [{ ac_bonus: 2 }])).toBe(14);
  });

  it("falls back to base 10 when stats are missing", () => {
    expect(calculateArmorClass({}, 'Человек', [])).toBe(10);
  });
});

describe("calculateSavingThrows", () => {
  it("calculates saving throws for all stats", () => {
    const stats = { STR: 10, DEX: 14, CON: 12, INT: 8, WIS: 16, CHA: 10 };
    const result = calculateSavingThrows(stats, 2);
    expect(result.STR).toBe(2);
    expect(result.DEX).toBe(4);
    expect(result.CON).toBe(3);
    expect(result.INT).toBe(1);
    expect(result.WIS).toBe(5);
    expect(result.CHA).toBe(2);
  });

  it("falls back to default stats when missing", () => {
    const result = calculateSavingThrows({}, 2);
    expect(result.STR).toBe(2);
    expect(result.DEX).toBe(2);
  });
});

describe("calculateDerivedStats", () => {
  it("returns initiative, armor_class and saving_throws", () => {
    const result = calculateDerivedStats({ STR: 10, DEX: 14, CON: 12, INT: 8, WIS: 16, CHA: 10 }, 'Эльф', []);
    expect(result.initiative).toBe(2);
    expect(result.armor_class).toBe(12);
    expect(result.saving_throws.STR).toBe(2);
    expect(result.saving_throws.WIS).toBe(5);
  });

  it("adds equipment bonus to AC", () => {
    const result = calculateDerivedStats({ DEX: 14 }, 'Человек', [{ ac_bonus: 3 }]);
    expect(result.armor_class).toBe(15);
  });
});
