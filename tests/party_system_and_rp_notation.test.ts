import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      return null;
    }),
  },
});

vi.stubGlobal("window", {
  addEventListener: vi.fn(),
  location: { hash: "", pathname: "/" },
});

vi.stubGlobal("document", {
  addEventListener: vi.fn(),
  createElement: vi.fn(() => ({
    textContent: "",
    innerHTML: "",
  })),
});

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: vi.fn(),
    from: vi.fn(),
  }),
}));

import { formatRpText, escapeHtml } from "../src/pages/game.js";
import { buildRouterSystemPrompt } from "../supabase/functions/process-turn/steps/step1_router.ts";
import { buildNarratorSystemPrompt } from "../supabase/functions/process-turn/steps/step5_narrator.ts";
import { SUPABASE_FULL_SCHEMA_SQL } from "../src/utils/supabaseFullSchema.js";

describe("Roleplay Notation System & Client Formatting", () => {
  it("correctly escapes html while preserving safe content", () => {
    const raw = '<script>alert("hack")</script> & "quotes"';
    const escaped = escapeHtml(raw);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&amp;");
  });

  it("correctly highlights speech in quotes and actions in asterisks for user RP example", () => {
    const userExample = '(*Я встал со стула и громко крикнул* "Эля ИДИ СЮДА!" после чего сделал для себя вывод что вино сегодня было вкусное)';
    const formatted = formatRpText(userExample);

    // Action/thought in asterisks should have rp-action class
    expect(formatted).toContain("<span class='rp-action'>*Я встал со стула и громко крикнул*</span>");
    // Spoken speech in quotes should have rp-speech class with «...»
    expect(formatted).toContain("<span class='rp-speech'>«Эля ИДИ СЮДА!»</span>");
    // Narrative thought/description should remain intact
    expect(formatted).toContain("после чего сделал для себя вывод что вино сегодня было вкусное");
  });

  it("handles double asterisks **action** and Russian quotes «speech»", () => {
    const text = '**Быстро выхватывает клинок** «Назад, чудовище!» — подумал он, отступая на шаг.';
    const formatted = formatRpText(text);

    expect(formatted).toContain("<span class='rp-action'>*Быстро выхватывает клинок*</span>");
    expect(formatted).toContain("<span class='rp-speech'>«Назад, чудовище!»</span>");
    expect(formatted).toContain('— подумал он, отступая на шаг.');
  });
});

describe("AI Step 1 Router & Step 5 Narrator Prompts", () => {
  it("Step 1 Router prompt includes Rule 0 explaining RP notation", () => {
    const prompt = buildRouterSystemPrompt();

    expect(prompt).toContain("РОЛЕВАЯ РАЗМЕТКА И НОТАЦИЯ ТЕКСТА");
    expect(prompt).toContain("Текст в кавычках");
    expect(prompt).toContain("Текст в звёздочках");
  });

  it("Step 5 Narrator prompt includes Rule 11 with squad travel and RP notation rules", () => {
    const prompt = buildNarratorSystemPrompt("Артур", "Человек", "Воин", "Лор");

    expect(prompt).toContain("РОЛЕВАЯ РАЗМЕТКА И ОТЫГРЫШ ОТРЯДА");
    expect(prompt).toContain("СКАЗАННОЕ ВСЛУХ В КАВЫЧКАХ");
    expect(prompt).toContain("ДЕЙСТВИЯ В ЗВЁЗДОЧКАХ");
    expect(prompt).toContain("СОВМЕСТНЫЙ ОТРЯД (Party)");
  });
});

describe("Party System & Schema Verification", () => {
  it("schema includes party_groups in sessions and party_id in players", () => {
    expect(SUPABASE_FULL_SCHEMA_SQL).toContain("party_groups JSONB DEFAULT '[]'");
    expect(SUPABASE_FULL_SCHEMA_SQL).toContain("party_id UUID DEFAULT NULL");
  });

  it("correctly identifies party membership and movement synchronization logic", () => {
    const session = {
      party_groups: [
        {
          id: "party-alpha",
          name: "Отряд героев",
          leader_id: "p1",
          members: ["p1", "p2"],
        },
      ],
    };

    const p1 = { id: "p1", name: "Артур", party_id: "party-alpha", current_zone: "зал" };
    const p2 = { id: "p2", name: "Эля", party_id: "party-alpha", current_zone: "зал" };
    const p3 = { id: "p3", name: "Одиночка", party_id: null, current_zone: "зал" };

    function arePlayersInSameParty(playerA: any, playerB: any, sess: any): boolean {
      if (!playerA || !playerB) return false;
      if (playerA.party_id && playerB.party_id && playerA.party_id === playerB.party_id) {
        return true;
      }
      if (Array.isArray(sess?.party_groups)) {
        for (const g of sess.party_groups) {
          if (Array.isArray(g.members) && g.members.includes(playerA.id) && g.members.includes(playerB.id)) {
            return true;
          }
        }
      }
      return false;
    }

    expect(arePlayersInSameParty(p1, p2, session)).toBe(true);
    expect(arePlayersInSameParty(p1, p3, session)).toBe(false);

    // Synchronous movement logic: only fellows who are in the same starting zone move together
    const allPlayers = [p1, p2, p3];
    const playerStartingZone = p1.current_zone;
    const newZone = "кухня";

    const partyFellowsInSameZone = allPlayers.filter((p) =>
      p.id !== p1.id &&
      arePlayersInSameParty(p1, p, session) &&
      (p.current_zone || null) === playerStartingZone
    );

    expect(partyFellowsInSameZone).toHaveLength(1);
    expect(partyFellowsInSameZone[0].id).toBe("p2");

    // Move fellows
    for (const fellow of partyFellowsInSameZone) {
      fellow.current_zone = newZone;
    }
    p1.current_zone = newZone;

    expect(p1.current_zone).toBe("кухня");
    expect(p2.current_zone).toBe("кухня");
    // p3 stays in "зал"
    expect(p3.current_zone).toBe("зал");
  });
});
