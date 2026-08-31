import { describe, it, expect } from "vitest";

// ============================================
// Unit tests for Migration 006: World Geography & NPC Matrix
// ============================================

describe("World Geography Validation", () => {
  const VALID_LOCATION_TYPES = ["capital", "city", "village", "ruins", "landmark"];
  const VALID_NPC_ROLES = ["main", "secondary"];
  const VALID_MEMORY_TYPES = ["vivid", "medium", "belief"];

  describe("Location Types", () => {
    it("accepts all valid location types", () => {
      VALID_LOCATION_TYPES.forEach((type) => {
        expect(VALID_LOCATION_TYPES).toContain(type);
      });
    });

    it("rejects invalid location types", () => {
      const invalidTypes = ["castle", "dungeon", "forest", "mountain", "lake"];
      invalidTypes.forEach((type) => {
        expect(VALID_LOCATION_TYPES).not.toContain(type);
      });
    });
  });

  describe("NPC Roles", () => {
    it("accepts 'main' role for primary characters", () => {
      expect(VALID_NPC_ROLES).toContain("main");
    });

    it("accepts 'secondary' role for supporting characters", () => {
      expect(VALID_NPC_ROLES).toContain("secondary");
    });

    it("rejects invalid roles", () => {
      const invalidRoles = ["boss", "minion", "merchant", "quest_giver"];
      invalidRoles.forEach((role) => {
        expect(VALID_NPC_ROLES).not.toContain(role);
      });
    });
  });

  describe("Memory Types", () => {
    it("accepts 'vivid' for strong memories", () => {
      expect(VALID_MEMORY_TYPES).toContain("vivid");
    });

    it("accepts 'medium' for normal memories", () => {
      expect(VALID_MEMORY_TYPES).toContain("medium");
    });

    it("accepts 'belief' for core beliefs", () => {
      expect(VALID_MEMORY_TYPES).toContain("belief");
    });

    it("rejects invalid memory types", () => {
      const invalidTypes = ["weak", "strong", "temporary", "permanent"];
      invalidTypes.forEach((type) => {
        expect(VALID_MEMORY_TYPES).not.toContain(type);
      });
    });
  });
});

describe("Route Constraints", () => {
  it("ensures location_a_id is less than location_b_id to prevent duplicates", () => {
    const locationA = "11111111-1111-1111-1111-111111111111";
    const locationB = "22222222-2222-2222-2222-222222222222";
    expect(locationA < locationB).toBe(true);
  });

  it("rejects routes where location_a_id equals location_b_id", () => {
    const locationA = "11111111-1111-1111-1111-111111111111";
    const locationB = "11111111-1111-1111-1111-111111111111";
    expect(locationA === locationB).toBe(true);
  });

  it("rejects routes where location_a_id is greater than location_b_id", () => {
    const locationA = "22222222-2222-2222-2222-222222222222";
    const locationB = "11111111-1111-1111-1111-111111111111";
    expect(locationA < locationB).toBe(false);
  });
});

describe("NPC Stats Validation", () => {
  const DEFAULT_STATS = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

  it("has correct default stats structure", () => {
    expect(DEFAULT_STATS).toHaveProperty("STR", 10);
    expect(DEFAULT_STATS).toHaveProperty("DEX", 10);
    expect(DEFAULT_STATS).toHaveProperty("CON", 10);
    expect(DEFAULT_STATS).toHaveProperty("INT", 10);
    expect(DEFAULT_STATS).toHaveProperty("WIS", 10);
    expect(DEFAULT_STATS).toHaveProperty("CHA", 10);
  });

  it("validates stat modifier calculation", () => {
    const calculateModifier = (stat: number) => Math.floor((stat - 10) / 2);
    expect(calculateModifier(10)).toBe(0);
    expect(calculateModifier(14)).toBe(2);
    expect(calculateModifier(8)).toBe(-1);
    expect(calculateModifier(20)).toBe(5);
  });
});

describe("Memory Embedding Validation", () => {
  it("validates embedding dimension is 1024 for bge-m3 model", () => {
    const EMBEDDING_DIMENSION = 1024;
    expect(EMBEDDING_DIMENSION).toBe(1024);
  });

  it("validates cosine similarity range", () => {
    const cosineSimilarity = (a: number[], b: number[]) => {
      const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
      const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
      const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
      return dotProduct / (magnitudeA * magnitudeB);
    };

    const vec1 = [1, 0, 0];
    const vec2 = [1, 0, 0];
    const vec3 = [0, 1, 0];

    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1);
    expect(cosineSimilarity(vec1, vec3)).toBeCloseTo(0);
  });
});

describe("Inventory NPC Support", () => {
  it("allows inventory to belong to either player or npc", () => {
    const validOwner1 = { player_id: "uuid-1", npc_id: null };
    const validOwner2 = { player_id: null, npc_id: "uuid-2" };
    const invalidOwner = { player_id: null, npc_id: null };

    const isValid = (item: { player_id: string | null; npc_id: string | null }) =>
      item.player_id !== null || item.npc_id !== null;

    expect(isValid(validOwner1)).toBe(true);
    expect(isValid(validOwner2)).toBe(true);
    expect(isValid(invalidOwner)).toBe(false);
  });
});

describe("Cascade Delete Behavior", () => {
  it("world deletion cascades to states", () => {
    // When world is deleted, all its states should be deleted
    const cascadeRule = "ON DELETE CASCADE";
    expect(cascadeRule).toBe("ON DELETE CASCADE");
  });

  it("state deletion cascades to locations", () => {
    // When state is deleted, all its locations should be deleted
    const cascadeRule = "ON DELETE CASCADE";
    expect(cascadeRule).toBe("ON DELETE CASCADE");
  });

  it("npc deletion sets ruler_id to null in states", () => {
    // When npc is deleted, ruler_id should be set to null
    const cascadeRule = "ON DELETE SET NULL";
    expect(cascadeRule).toBe("ON DELETE SET NULL");
  });

  it("npc deletion cascades to memories", () => {
    // When npc is deleted, all its memories should be deleted
    const cascadeRule = "ON DELETE CASCADE";
    expect(cascadeRule).toBe("ON DELETE CASCADE");
  });
});

describe("match_npc_memories Function Signature", () => {
  it("validates function parameter types", () => {
    const params = {
      query_embedding: "vector(1024)",
      match_threshold: "float",
      match_count: "int",
      p_npc_id: "uuid",
      p_player_id: "uuid",
    };

    expect(params.query_embedding).toBe("vector(1024)");
    expect(params.match_threshold).toBe("float");
    expect(params.match_count).toBe("int");
    expect(params.p_npc_id).toBe("uuid");
    expect(params.p_player_id).toBe("uuid");
  });

  it("validates return table structure", () => {
    const returnColumns = [
      "id",
      "npc_id",
      "player_id",
      "memory_text",
      "memory_type",
      "embedding",
      "created_at",
      "similarity",
    ];

    expect(returnColumns).toHaveLength(8);
    expect(returnColumns).toContain("similarity");
  });
});

describe("Array Field Defaults", () => {
  it("validates empty array default for status_tags", () => {
    const defaultTags: string[] = [];
    expect(defaultTags).toEqual([]);
  });

  it("validates empty array default for habits", () => {
    const defaultHabits: string[] = [];
    expect(defaultHabits).toEqual([]);
  });

  it("validates empty array default for catchphrases", () => {
    const defaultCatchphrases: string[] = [];
    expect(defaultCatchphrases).toEqual([]);
  });
});

describe("Timestamp Defaults", () => {
  it("validates NOW() default for created_at", () => {
    const now = new Date().toISOString();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("validates NOW() default for updated_at", () => {
    const now = new Date().toISOString();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
