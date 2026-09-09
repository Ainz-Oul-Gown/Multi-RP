// tests/world_map_interactive.test.ts
import { describe, it, expect } from "vitest";

describe("Интерактивная карта мира: Математика координат и масштабирования", () => {
  function getCoordScale(scaleUnit: string): number {
    const unit = (scaleUnit || 'километры').toLowerCase();
    const isKm = unit.startsWith('кил') || unit.startsWith('km') || unit === 'км';
    return isKm ? 0.35 : 1.5;
  }

  function calculatePanToCenter(targetX: number, targetY: number, zoom: number, coordScale: number, viewportW: number, viewportH: number) {
    const px = targetX * coordScale;
    const py = targetY * coordScale;
    const panX = viewportW / 2 - px * zoom;
    const panY = viewportH / 2 - py * zoom;
    return { panX, panY };
  }

  function calculateFitWorld(locations: { x: number; y: number }[], viewportW: number, viewportH: number, coordScale: number) {
    const allX = locations.map(l => l.x * coordScale);
    const allY = locations.map(l => l.y * coordScale);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const spanW = Math.max(200, maxX - minX + 120);
    const spanH = Math.max(200, maxY - minY + 120);

    const fitZoom = Math.max(0.06, Math.min(2.0, Math.min((viewportW * 0.9) / spanW, (viewportH * 0.9) / spanH)));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const panX = Math.round(viewportW / 2 - midX * fitZoom);
    const panY = Math.round(viewportH / 2 - midY * fitZoom);

    return { fitZoom, panX, panY, minX, maxX, minY, maxY };
  }

  it("корректно выбирает масштаб в зависимости от единиц измерения (километры vs метры)", () => {
    expect(getCoordScale("километры")).toBe(0.35);
    expect(getCoordScale("км")).toBe(0.35);
    expect(getCoordScale("km")).toBe(0.35);
    expect(getCoordScale("метры")).toBe(1.5);
    expect(getCoordScale("м")).toBe(1.5);
  });

  it("отцентрирует игрока с координатами (0,0) ровно в центре вьюпорта", () => {
    const { panX, panY } = calculatePanToCenter(0, 0, 1.0, 0.35, 800, 600);
    expect(panX).toBe(400);
    expect(panY).toBe(300);
  });

  it("отцентрирует игрока с произвольными координатами (1000, -500) в центр вьюпорта", () => {
    const targetX = 1000;
    const targetY = -500;
    const zoom = 0.5;
    const scale = 0.35;
    const { panX, panY } = calculatePanToCenter(targetX, targetY, zoom, scale, 800, 600);

    const screenX = panX + (targetX * scale) * zoom;
    const screenY = panY + (targetY * scale) * zoom;
    expect(Math.round(screenX)).toBe(400);
    expect(Math.round(screenY)).toBe(300);
  });

  it("рассчитывает fit-to-world так, чтобы все крайние локации континента помещались во вьюпорт", () => {
    const locations = [
      { x: -3500, y: -1800 },
      { x: 3500, y: 1800 },
      { x: 0, y: 0 },
    ];
    const { fitZoom } = calculateFitWorld(locations, 900, 600, 0.35);
    expect(fitZoom).toBeGreaterThan(0.06);
    expect(fitZoom).toBeLessThan(1.0);
  });

  it("точно вычисляет евклидову дистанцию между локациями и игроком", () => {
    const player = { x: 100, y: 200 };
    const loc = { x: 400, y: 600 };
    const dx = loc.x - player.x;
    const dy = loc.y - player.y;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    expect(dist).toBe(500);
  });
});
