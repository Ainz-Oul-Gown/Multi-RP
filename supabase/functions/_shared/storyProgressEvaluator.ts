// supabase/functions/_shared/storyProgressEvaluator.ts — Автоматическая проверка и продвижение целей сюжета
export interface StoryArc {
  id: string;
  act: number;
  title: string;
  description: string;
  goals: string[];
  completed_goals: string[];
  key_npcs?: string[];
  key_locations?: string[];
  status: "active" | "completed" | "pending";
}

export interface StorylineData {
  title: string;
  summary: string;
  prologue?: string;
  current_arc_index: number;
  status: "active" | "in_progress" | "completed" | "sandbox";
  arcs: StoryArc[];
  created_at?: string;
  updated_at?: string;
}

export function evaluateStoryProgress({
  storyline,
  playerAction,
  systemFacts = [],
  narrativeText = "",
  currentLocation = "",
  nearbyNpcs = [],
}: {
  storyline: StorylineData | any;
  playerAction: string;
  systemFacts?: string[];
  narrativeText?: string;
  currentLocation?: string;
  nearbyNpcs?: Array<{ name: string }>;
}): {
  updatedStoryline: StorylineData;
  completedGoalTitles: string[];
  advancedArc: boolean;
  announcements: string[];
} {
  const result = {
    updatedStoryline: storyline,
    completedGoalTitles: [] as string[],
    advancedArc: false,
    announcements: [] as string[],
  };

  if (!storyline || !Array.isArray(storyline.arcs) || storyline.arcs.length === 0) {
    return result;
  }

  const arcIdx = Number(storyline.current_arc_index) || 0;
  const currentArc: StoryArc = storyline.arcs[arcIdx];
  if (!currentArc || !Array.isArray(currentArc.goals) || currentArc.goals.length === 0) {
    return result;
  }

  if (!Array.isArray(currentArc.completed_goals)) {
    currentArc.completed_goals = [];
  }

  const combinedText = [
    playerAction || "",
    ...(systemFacts || []),
    narrativeText || "",
    currentLocation || "",
    ...(nearbyNpcs || []).map((n) => n.name || ""),
  ].join(" ").toLowerCase();

  // Очистка основ слов для надёжного сопоставления
  const cleanStem = (w: string) =>
    w.replace(/(?:а|ов|ев|и|ы|у|е|ом|ам|ами|ях|ых|их|ого|его|ому|ему|ым|им|ую|ею|ей|я)$/i, "").toLowerCase();

  const textWords = combinedText.split(/[\s,.-:;!?()]+/).map(cleanStem).filter((w) => w.length >= 3);

  for (const goal of currentArc.goals) {
    if (currentArc.completed_goals.includes(goal)) {
      continue;
    }

    const goalWords = goal
      .split(/[\s,.-:;!?()]+/)
      .map(cleanStem)
      .filter((w) => w.length >= 3 && !["осмотреть", "поговорить", "найти", "исследовать", "узнать", "отыскать"].includes(w));

    // Проверяем ключевые именованные сущности (NPC и локации)
    const hasNpcMatch = (currentArc.key_npcs || []).some((npc) => {
      const npcLower = npc.toLowerCase();
      return goal.toLowerCase().includes(npcLower) && combinedText.includes(npcLower);
    });

    const hasLocationMatch = (currentArc.key_locations || []).some((loc) => {
      const locLower = loc.toLowerCase();
      return goal.toLowerCase().includes(locLower) && currentLocation.toLowerCase().includes(locLower);
    });

    // Совпадение значимых слов из цели
    const matchedWordsCount = goalWords.filter((gw) =>
      textWords.some((tw) => tw.includes(gw) || gw.includes(tw))
    ).length;

    const wordMatchThreshold = Math.max(2, Math.ceil(goalWords.length * 0.45));
    const isGoalAchieved = hasNpcMatch || (hasLocationMatch && matchedWordsCount >= 2) || (matchedWordsCount >= wordMatchThreshold);

    if (isGoalAchieved) {
      currentArc.completed_goals.push(goal);
      result.completedGoalTitles.push(goal);
      result.announcements.push(`[Сюжетная цель выполнена: "${goal}"]`);
    }
  }

  // Проверка завершения всей арки
  const allCompleted = currentArc.goals.length > 0 && currentArc.goals.every((g) => currentArc.completed_goals.includes(g));

  if (allCompleted && currentArc.status !== "completed") {
    currentArc.status = "completed";
    result.advancedArc = true;

    if (arcIdx + 1 < storyline.arcs.length) {
      storyline.current_arc_index = arcIdx + 1;
      const nextArc = storyline.arcs[arcIdx + 1];
      nextArc.status = "active";
      result.announcements.push(`[Сюжет: Завершена арка "${currentArc.title}"! Начало следующей арки: "${nextArc.title}"]`);
    } else {
      storyline.status = "completed";
      result.announcements.push(`[Сюжет: Основная сюжетная линия "${storyline.title}" успешно завершена!]`);
    }
  }

  result.updatedStoryline = storyline;
  return result;
}
