import type { LevelAnalysis } from './levelAnalysis'

export function selectQualityLevels(items: LevelAnalysis[]): LevelAnalysis[] {
  const selected: LevelAnalysis[] = []
  const candidates = items.filter((item) => (item.level.pivotCount ?? 1) >= 2 && item.strength !== null && item.strength >= 40 && item.state === 'Рівень утримується')
    .sort((a, b) => (b.level.pivotCount ?? 1) - (a.level.pivotCount ?? 1) || (b.strength ?? 0) - (a.strength ?? 0))
  // Input is ordered by distance; stable sorting keeps nearer levels on tied quality.
  for (const item of candidates) {
    if (selected.filter((other) => other.level.kind === item.level.kind).length >= 2) continue
    if (selected.some((other) => Math.abs(other.level.price - item.level.price) <= Math.max(other.atr, item.atr) * 0.5)) continue
    selected.push(item)
  }
  return selected
}
