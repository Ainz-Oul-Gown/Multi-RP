import { describe, it, expect, vi } from "vitest";
import {
  calculateRelationshipTier,
  getRelationshipTierLabel,
  getMemoryTierFromVividness,
  buildMemoryEvaluationPrompt,
  buildFallbackMemoryEvaluation,
} from "../supabase/functions/_shared/npc_relationship_engine.ts";
import { processNpcInteractions } from "../supabase/functions/process-turn/steps/npc_memory_updater.ts";

describe("NPC Relationship Engine", () => {
  describe("calculateRelationshipTier", () => {
    it("correctly identifies sworn_enemy (-100..-70)", () => {
      expect(calculateRelationshipTier(-100)).toBe("sworn_enemy");
      expect(calculateRelationshipTier(-85)).toBe("sworn_enemy");
      expect(calculateRelationshipTier(-70)).toBe("sworn_enemy");
      // Clamping
      expect(calculateRelationshipTier(-120)).toBe("sworn_enemy");
    });

    it("correctly identifies hostile (-69..-35)", () => {
      expect(calculateRelationshipTier(-69)).toBe("hostile");
      expect(calculateRelationshipTier(-50)).toBe("hostile");
      expect(calculateRelationshipTier(-35)).toBe("hostile");
    });

    it("correctly identifies unfriendly (-34..-10)", () => {
      expect(calculateRelationshipTier(-34)).toBe("unfriendly");
      expect(calculateRelationshipTier(-20)).toBe("unfriendly");
      expect(calculateRelationshipTier(-10)).toBe("unfriendly");
    });

    it("correctly identifies neutral (-9..+15)", () => {
      expect(calculateRelationshipTier(-9)).toBe("neutral");
      expect(calculateRelationshipTier(0)).toBe("neutral");
      expect(calculateRelationshipTier(15)).toBe("neutral");
    });

    it("correctly identifies friendly (+16..+50)", () => {
      expect(calculateRelationshipTier(16)).toBe("friendly");
      expect(calculateRelationshipTier(35)).toBe("friendly");
      expect(calculateRelationshipTier(50)).toBe("friendly");
    });

    it("correctly identifies trusted (+51..+80)", () => {
      expect(calculateRelationshipTier(51)).toBe("trusted");
      expect(calculateRelationshipTier(70)).toBe("trusted");
      expect(calculateRelationshipTier(80)).toBe("trusted");
    });

    it("correctly identifies devoted (+81..+100)", () => {
      expect(calculateRelationshipTier(81)).toBe("devoted");
      expect(calculateRelationshipTier(100)).toBe("devoted");
      // Clamping
      expect(calculateRelationshipTier(150)).toBe("devoted");
    });
  });

  describe("getRelationshipTierLabel", () => {
    it("returns correct Russian labels for each tier", () => {
      expect(getRelationshipTierLabel("sworn_enemy")).toBe("Заклятый враг");
      expect(getRelationshipTierLabel("hostile")).toBe("Враждебность");
      expect(getRelationshipTierLabel("unfriendly")).toBe("Неприязнь");
      expect(getRelationshipTierLabel("neutral")).toBe("Нейтралитет");
      expect(getRelationshipTierLabel("friendly")).toBe("Симпатия");
      expect(getRelationshipTierLabel("trusted")).toBe("Доверие");
      expect(getRelationshipTierLabel("devoted")).toBe("Преданность");
    });
  });

  describe("getMemoryTierFromVividness", () => {
    it("maps 1..3 to impression", () => {
      expect(getMemoryTierFromVividness(1)).toBe("impression");
      expect(getMemoryTierFromVividness(2)).toBe("impression");
      expect(getMemoryTierFromVividness(3)).toBe("impression");
      expect(getMemoryTierFromVividness(0)).toBe("impression");
    });

    it("maps 4..7 to regular", () => {
      expect(getMemoryTierFromVividness(4)).toBe("regular");
      expect(getMemoryTierFromVividness(5)).toBe("regular");
      expect(getMemoryTierFromVividness(7)).toBe("regular");
    });

    it("maps 8..10 to vivid", () => {
      expect(getMemoryTierFromVividness(8)).toBe("vivid");
      expect(getMemoryTierFromVividness(9)).toBe("vivid");
      expect(getMemoryTierFromVividness(10)).toBe("vivid");
      expect(getMemoryTierFromVividness(12)).toBe("vivid");
    });
  });

  describe("buildMemoryEvaluationPrompt", () => {
    it("compiles prompt with subjective rules and character context", () => {
      const prompt = buildMemoryEvaluationPrompt({
        npc: {
          name: "Торговец Лиор",
          race: "Человек",
          role: "Купец",
          background: "Бывший контрабандист",
          habits: ["поглаживает бороду"],
          catchphrases: ["Золото любит тишину"],
        },
        player: {
          name: "Торин",
          race: "Дворф",
          class: "Воин",
        },
        current_relationship: {
          score: 10,
          tier: "neutral",
          status_tags: ["знакомый"],
        },
        action_text: "Предлагаю Лиору редкий амулет в обмен на карту",
        action_type: "trade",
        outcome_text: "Лиор с интересом изучает амулет",
      });

      expect(prompt).toContain("Торговец Лиор");
      expect(prompt).toContain("Торин");
      expect(prompt).toContain("Бывший контрабандист");
      expect(prompt).toContain("vividness");
      expect(prompt).toContain("relationship_delta");
      expect(prompt).toContain("status_tags");
      expect(prompt).toContain("Субъективность (POV)");
    });
  });

  describe("buildFallbackMemoryEvaluation", () => {
    it("creates dramatic vivid memory on attack", () => {
      const evalResult = buildFallbackMemoryEvaluation({
        npc: { name: "Стражник" },
        player: { name: "Вор" },
        action_text: "Атаковать стражника кинжалом в спину",
        action_type: "attack",
        is_attack: true,
      });

      expect(evalResult.vividness).toBe(9);
      expect(evalResult.tier).toBe("vivid");
      expect(evalResult.relationship_delta).toBe(-25);
      expect(evalResult.emotional_tone).toBe("fear_hatred");
      expect(evalResult.status_tags).toContain("враг");
    });

    it("creates gratitude memory on rescue/help", () => {
      const evalResult = buildFallbackMemoryEvaluation({
        npc: { name: "Крестьянин" },
        player: { name: "Паладин" },
        action_text: "Защитить крестьянина от волков и спасти его семью",
        action_type: "help",
      });

      expect(evalResult.vividness).toBe(8);
      expect(evalResult.tier).toBe("vivid");
      expect(evalResult.relationship_delta).toBe(20);
      expect(evalResult.emotional_tone).toBe("gratitude");
      expect(evalResult.status_tags).toContain("благодарен");
    });

    it("creates impression for short trivial phrase", () => {
      const evalResult = buildFallbackMemoryEvaluation({
        npc: { name: "Трактирщик" },
        player: { name: "Герой" },
        action_text: "Привет.",
        action_type: "talk",
      });

      expect(evalResult.vividness).toBe(2);
      expect(evalResult.tier).toBe("impression");
      expect(evalResult.relationship_delta).toBe(1);
    });
  });

  describe("processNpcInteractions", () => {
    it("updates relationship and inserts memory when NPC is targeted", async () => {
      const mockInsertMem = vi.fn().mockResolvedValue({ error: null });
      const mockInsertRel = vi.fn().mockResolvedValue({ error: null });
      const mockSelectRel = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "rel-1",
                score: 10,
                tier: "neutral",
                status_tags: ["знакомый"],
                interactions_count: 2,
              },
            }),
          }),
        }),
      });
      const mockUpdateRel = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabase = {
        from: (table: string) => {
          if (table === "npc_memories") {
            return { insert: mockInsertMem };
          }
          if (table === "npc_relationships") {
            return {
              select: mockSelectRel,
              update: mockUpdateRel,
              insert: mockInsertRel,
            };
          }
          return {};
        },
      };

      const result = await processNpcInteractions({
        supabase: mockSupabase as any,
        session_id: "session-1",
        acting_player: { id: "p1", name: "Торин", race: "Дворф", class: "Воин" },
        action_text: "Предлагаю Лиору выпить лучшего эля и угощаю за свой счёт",
        router_result: {
          actions: [{ action_type: "talk", target_entity_id: "npc-10" }],
        },
        engine_result: { success: true },
        narrator_output: { players: { p1: "Лиор с удовольствием принимает кружку." } },
        all_npcs: [
          { id: "npc-10", name: "Лиор", race: "Человек", role: "Торговец", status_tags: ["нейтрал"] },
        ],
      });

      expect(result.length).toBe(1);
      expect(result[0].npc_name).toBe("Лиор");
      expect(result[0].score).toBeGreaterThan(10);
      expect(mockInsertMem).toHaveBeenCalledWith(
        expect.objectContaining({
          npc_id: "npc-10",
          player_id: "p1",
          vividness: expect.any(Number),
        })
      );
      expect(mockUpdateRel).toHaveBeenCalledWith(
        expect.objectContaining({
          score: expect.any(Number),
          tier: expect.any(String),
        })
      );
    });

    it("returns empty array if no NPCs are interacted with", async () => {
      const mockSupabase = { from: vi.fn() };
      const result = await processNpcInteractions({
        supabase: mockSupabase as any,
        session_id: "session-1",
        acting_player: { id: "p1", name: "Торин" },
        action_text: "Смотрю на облака",
        router_result: { actions: [{ action_type: "inspect_environment" }] },
        engine_result: { success: true },
        narrator_output: {},
        all_npcs: [{ id: "npc-10", name: "Лиор" }],
      });

      expect(result).toEqual([]);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });
});
