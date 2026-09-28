import type { LevelAnalysis } from './levelAnalysis'

export function distancePercent(price: number, level: number) {
  return Math.abs(price - level) / level * 100
}

export function selectReboundSetup(items: LevelAnalysis[], price: number, repeatedOnly = true) {
  return items.filter((item) => !repeatedOnly || (item.rebounds >= 3 && item.state === 'Рівень утримується' && (item.level.kind === 'high' ? price <= item.level.price : price >= item.level.price)))
    .sort((a, b) => Math.abs(a.level.price - price) - Math.abs(b.level.price - price))[0]
}

export function checklist(item: LevelAnalysis, unavailable: string[], volumeThreshold: number) {
  return [
    { label: 'Збіг зі старшим таймфреймом', passed: item.matchingFrames.length ? true : unavailable.length ? null : false },
    { label: 'Щонайменше 3 підтверджені відскоки', passed: item.rebounds >= 3 },
    { label: 'Підтискання до рівня', passed: item.strength === null ? null : item.reasons.some((reason) => reason.includes('наближаються') || reason.includes('скорочуються')) },
    { label: `Обсяг ≥ ×${volumeThreshold}`, passed: item.relativeVolume === null ? null : item.relativeVolume >= volumeThreshold },
  ]
}

// Emit transitions only: enabling a watch does not replay historical signals.
export function alertTransitions(previous: string[] | undefined, next: string[]) {
  return previous === undefined ? [] : next.filter((event) => !previous.includes(event))
}
