import { describe, it, expect } from "vitest";
import { parseAIJson, cleanTextForAI, sanitizeKey, resolveAIEndpoint, extractAIMessageText } from "../supabase/functions/_shared/utils.ts";

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

  it("removes data URI image references", () => {
    const input = "Avatar: data:image/png;base64,AAAA";
    const cleaned = cleanTextForAI(input);
    expect(cleaned).not.toContain("image/png");
    expect(cleaned).not.toContain("base64");
    expect(cleaned.trim()).toBe("Avatar:");
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
    const input = "Hello, world! 123";
    const cleaned = cleanTextForAI(input);
    expect(cleaned).toBe("Hello, world! 123");
  });

  it("preserves Russian/Cyrillic text", () => {
    const input = "Привет, мир! Это тест.";
    const cleaned = cleanTextForAI(input);
    expect(cleaned).toBe("Привет, мир! Это тест.");
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

describe("resolveAIEndpoint", () => {
  it("resolves standard OpenRouter key", () => {
    const res = resolveAIEndpoint("sk-or-v1-abc123");
    expect(res.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(res.apiKey).toBe("sk-or-v1-abc123");
    expect(res.isCustomEndpoint).toBe(false);
  });

  it("resolves local LM Studio URL and normalizes /v1/chat/completions", () => {
    const res = resolveAIEndpoint("http://localhost:1234");
    expect(res.url).toBe("http://localhost:1234/v1/chat/completions");
    expect(res.apiKey).toBe("lm-studio");
    expect(res.isCustomEndpoint).toBe(true);
    expect(res.timeoutMs).toBe(90000);
  });

  it("resolves tunnel URL (localhost.run / pinggy / cloudflare) with optional token", () => {
    const res = resolveAIEndpoint("https://demo.lhr.life|my-secret");
    expect(res.url).toBe("https://demo.lhr.life/v1/chat/completions");
    expect(res.apiKey).toBe("my-secret");
    expect(res.isCustomEndpoint).toBe(true);
  });
});

describe("extractAIMessageText", () => {
  it("returns message.content when present", () => {
    expect(extractAIMessageText({ content: '{"status":"success"}' })).toBe('{"status":"success"}');
  });

  it("rescues Russian narrative drafts from reasoning_content when content is empty (truncated max_tokens)", () => {
    const msg = {
      content: "",
      reasoning_content: `*Drafting Para 1:*\nВоздух здесь пахнет влажной древесиной и озоном, словно перед грозой, но солнце щедро льет свет через густую крону древних деревьев.\n*Critique:* Good sensory start.\n*Drafting Para 2:*\nОн направил взгляд на группу эльфов у корней дуба и увидел, как Эйрин Светлая касается светящегося лепестка, её голос звучал тихо, словно шепот ветра в листве.\n*Drafting Para 3:*\nЭйрин прервала пение и медленно обернулась, её золотые волосы зашевелились в потоке воздуха: «Твой приход нарушил тишину священной рощи, но не испугал сердца лесных духов.»`,
    };
    const extracted = extractAIMessageText(msg);
    expect(extracted).toContain("Воздух здесь пахнет влажной древесиной");
    expect(extracted).toContain("Эйрин прервала пение");
    expect(extracted).not.toContain("Critique");
  });
});

