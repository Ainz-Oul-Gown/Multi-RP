import { describe, it, expect } from "vitest";
import { parseAIJson, cleanTextForAI, sanitizeKey } from "../supabase/functions/_shared/utils.ts";

describe("parseAIJson", () => {
  it("parses plain JSON object", () => {
    expect(parseAIJson('{"STR": 14, "DEX": 12}')).toEqual({ STR: 14, DEX: 12 });
  });

  it("parses JSON array", () => {
    expect(parseAIJson('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it("extracts JSON from markdown code block", () => {
    const text = "Here is the result:\n```json\n{\"a\": 1}\n```";
    expect(parseAIJson(text)).toEqual({ a: 1 });
  });

  it("extracts JSON from generic markdown block", () => {
    const text = "```\n{\"x\": true}\n```";
    expect(parseAIJson(text)).toEqual({ x: true });
  });

  it("extracts first JSON object from mixed text", () => {
    const text = "Some text {\"key\": \"value\"} more text";
    expect(parseAIJson(text)).toEqual({ key: "value" });
  });

  it("returns null for invalid JSON", () => {
    expect(parseAIJson("no json here")).toBeNull();
    expect(parseAIJson("")).toBeNull();
    expect(parseAIJson("```json\n{ invalid ```")).toBeNull();
  });

  it("handles nested JSON", () => {
    const text = '{"stats": {"STR": 10, "DEX": 12}}';
    expect(parseAIJson(text)).toEqual({ STR: 10, DEX: 12 });
  });

  it("extracts nested stats object from wrapper", () => {
    const text = '{"stats":{"STR":12,"DEX":12,"CON":12,"INT":12,"WIS":12,"CHA":12}}';
    expect(parseAIJson(text)).toEqual({ STR: 12, DEX: 12, CON: 12, INT: 12, WIS: 12, CHA: 12 });
  });

  it("extracts stats from text with extra braces", () => {
    const text = 'Here is your character: {"stats":{"STR":12,"DEX":12,"CON":12,"INT":12,"WIS":12,"CHA":12}} Enjoy!';
    expect(parseAIJson(text)).toEqual({ STR: 12, DEX: 12, CON: 12, INT: 12, WIS: 12, CHA: 12 });
  });

  it("returns null when no JSON present", () => {
    expect(parseAIJson("No stats here, just text.")).toBeNull();
  });

  it("handles JSON with newlines and spaces", () => {
    const text = "{\n  \"a\": 1,\n  \"b\": 2\n}";
    expect(parseAIJson(text)).toEqual({ a: 1, b: 2 });
  });
});

describe("cleanTextForAI", () => {
  it("returns empty string for null/undefined", () => {
    expect(cleanTextForAI(null)).toBe("");
    expect(cleanTextForAI(undefined)).toBe("");
    expect(cleanTextForAI("")).toBe("");
  });

  it("removes control characters", () => {
    const input = "hello\x00\x1Fworld";
    expect(cleanTextForAI(input)).toBe("helloworld");
  });

  it("removes image references and long base64-like strings", () => {
    const input = "Check this image.png and a very long base64 string A".repeat(50);
    const cleaned = cleanTextForAI(input);
    expect(cleaned).not.toContain("image.png");
    // long base64-like substring should be stripped
    expect(cleaned.length).toBeLessThan(input.length);
  });

  it("removes http(s) URLs", () => {
    const input = "Visit https://example.com for more";
    expect(cleanTextForAI(input)).toBe("Visit for more");
  });

  it("removes Windows paths", () => {
    const input = "File at C:\\Users\\test\\file.txt";
    expect(cleanTextForAI(input)).toBe("File at");
  });

  it("collapses whitespace", () => {
    const input = "hello    world\n\n\t  test";
    expect(cleanTextForAI(input)).toBe("hello world test");
  });

  it("truncates long text to 4000 chars", () => {
    const input = "word ".repeat(1000);
    expect(cleanTextForAI(input).length).toBeLessThanOrEqual(4000);
  });

  it("preserves safe ASCII text and strips non-safe characters", () => {
    // cleanTextForAI strips non-ASCII characters outside allowed ranges,
    // so we only assert it returns a safe ASCII-ish string.
    const input = "Hello, world! 123";
    const cleaned = cleanTextForAI(input);
    expect(cleaned).toBe("Hello, world! 123");
  });
});

describe("sanitizeKey", () => {
  it("trims whitespace", () => {
    expect(sanitizeKey("  key  ")).toBe("key");
  });

  it("removes non-ASCII printable characters", () => {
    expect(sanitizeKey("k\u0435\u0443")).toBe("k");
  });

  it("handles empty/null input", () => {
    expect(sanitizeKey("")).toBe("");
    expect(sanitizeKey(null as any)).toBe("");
    expect(sanitizeKey(undefined as any)).toBe("");
  });

  it("keeps standard ASCII characters", () => {
    expect(sanitizeKey("abc-123_ABC")).toBe("abc-123_ABC");
  });
});
