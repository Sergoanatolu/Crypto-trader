import type { LevelAnalysis } from './levelAnalysis'

export function distancePercent(price: number, level: number) {
  return Math.abs(price - level) / level * 100
}

export function checklist(item: LevelAnalysis, unavailable: string[], volumeThreshold: number) {
  return [
    { label: 'Збіг зі старшим таймфреймом', passed: item.matchingFrames.length ? true : unavailable.length ? null : false },
    { label: 'Щонайменше 2 окремі тести', passed: item.tests >= 2 },
    { label: 'Підтискання до рівня', passed: item.strength === null ? null : item.reasons.some((reason) => reason.includes('наближаються') || reason.includes('скорочуються')) },
    { label: `Обсяг ≥ ×${volumeThreshold}`, passed: item.relativeVolume === null ? null : item.relativeVolume >= volumeThreshold },
  ]
}

// Emit transitions only: enabling a watch does not replay historical signals.
export function alertTransitions(previous: string[] | undefined, next: string[]) {
  return previous === undefined ? [] : next.filter((event) => !previous.includes(event))
}
