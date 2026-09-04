// tests/story_and_race.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNpcRace } from '../src/utils/npcRaceResolver.js';
import { evaluateStoryProgress } from '../supabase/functions/_shared/storyProgressEvaluator.ts';

describe('NPC Race Resolver', () => {
  it('resolves monstrous and beast races accurately', () => {
    expect(resolveNpcRace('Джунглевый кровосос', 'monster')).toBe('Насекомое');
    expect(resolveNpcRace('Пепельный гоблин', 'monster')).toBe('Гоблин');
    expect(resolveNpcRace('Болотная слизь', 'monster')).toBe('Слизь');
    expect(resolveNpcRace('Теневой сталкер', 'monster')).toBe('Монстр');
    expect(resolveNpcRace('Личинка песчаного червя', 'beast')).toBe('Червь');
    expect(resolveNpcRace('Матриарх пауков', 'beast')).toBe('Арахнид');
    expect(resolveNpcRace('Степной лютоволк', 'beast')).toBe('Зверь');
    expect(resolveNpcRace('Древний костяной лич', 'undead')).toBe('Нежить');
  });

  it('defaults humanoids to Human', () => {
    expect(resolveNpcRace('Гордон', 'npc')).toBe('Человек');
    expect(resolveNpcRace('Торговец зерном', 'merchant')).toBe('Человек');
  });
});

describe('Story Progress Evaluator', () => {
  const sampleStoryline = {
    title: 'Песнь Двух Лун: Тайна Раскола',
    summary: 'Древний катаклизм грозит вернуться.',
    prologue: 'Вы прибываете в Ривервуд...',
    current_arc_index: 0,
    status: 'active' as const,
    arcs: [
      {
        id: 'arc_1',
        act: 1,
        title: 'Акт I: Тени над Ривервудом',
        description: 'Жители Ривервуда шепчутся о ночных огнях на опушке леса.',
        goals: [
          'Осмотреть Ривервуд и расспросить торговца Гордона о ночных огнях',
          'Исследовать опушку леса и обнаружить следы раскола',
        ],
        completed_goals: [],
        key_npcs: ['Гордон'],
        key_locations: ['Ривервуд', 'Опушка леса'],
        status: 'active' as const,
      },
      {
        id: 'arc_2',
        act: 2,
        title: 'Акт II: Шепот древних камней',
        description: 'Следы ведут к руинам.',
        goals: ['Найти руины в предгорьях'],
        completed_goals: [],
        key_npcs: [],
        key_locations: [],
        status: 'pending' as const,
      },
    ],
  };

  it('marks a goal completed when matching player action and NPC dialogue', () => {
    const result = evaluateStoryProgress({
      storyline: JSON.parse(JSON.stringify(sampleStoryline)),
      playerAction: 'Расспрашиваю торговца Гордона о странных ночных огнях в лесу',
      systemFacts: ['Гордон рассказал герою о пугающих огнях на опушке.'],
      narrativeText: 'Гордон тревожно огляделся и поделился слухами.',
      currentLocation: 'Ривервуд',
      nearbyNpcs: [{ name: 'Гордон' }],
    });

    expect(result.completedGoalTitles).toContain(
      'Осмотреть Ривервуд и расспросить торговца Гордона о ночных огнях'
    );
    expect(result.advancedArc).toBe(false);
    expect(result.updatedStoryline.arcs[0].completed_goals.length).toBe(1);
  });

  it('advances arc when all goals of current arc are completed', () => {
    const storylineWithOneGoalLeft = JSON.parse(JSON.stringify(sampleStoryline));
    storylineWithOneGoalLeft.arcs[0].completed_goals = [
      'Осмотреть Ривервуд и расспросить торговца Гордона о ночных огнях',
    ];

    const result = evaluateStoryProgress({
      storyline: storylineWithOneGoalLeft,
      playerAction: 'Иду исследовать опушку леса, ищу следы раскола',
      systemFacts: ['Герой обнаружил кристаллы и следы раскола на опушке леса.'],
      currentLocation: 'Опушка леса',
    });

    expect(result.completedGoalTitles).toContain(
      'Исследовать опушку леса и обнаружить следы раскола'
    );
    expect(result.advancedArc).toBe(true);
    expect(result.updatedStoryline.current_arc_index).toBe(1);
    expect(result.updatedStoryline.arcs[0].status).toBe('completed');
    expect(result.updatedStoryline.arcs[1].status).toBe('active');
  });

  it('does not advance or change goals in sandbox mode', () => {
    const sandboxStory = {
      ...JSON.parse(JSON.stringify(sampleStoryline)),
      status: 'sandbox' as const,
    };

    const result = evaluateStoryProgress({
      storyline: sandboxStory,
      playerAction: 'Исследую всё вокруг',
    });

    expect(result.completedGoalTitles.length).toBe(0);
    expect(result.advancedArc).toBe(false);
  });
});
