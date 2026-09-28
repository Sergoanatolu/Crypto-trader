import type { Bar, Level } from './levels'

// Major swing boundaries of the displayed history, including today's candles.
// A level starts at a real wick and survives only while its original side holds.
export function findStructureLevels(history: Bar[]): Level[] {
  const bars = history.slice(-2200)
  const radius = 24
  if (bars.length < radius * 2 + 1) return []
  const atr = bars.reduce((sum, bar, i) => sum + Math.max(bar.high - bar.low,
    Math.abs(bar.high - (bars[i - 1]?.close ?? bar.open)),
    Math.abs(bar.low - (bars[i - 1]?.close ?? bar.open))), 0) / bars.length
  const range = Math.max(...bars.map((bar) => bar.high)) - Math.min(...bars.map((bar) => bar.low))
  if (atr <= 0 || range <= 0) return []
  const prominenceThreshold = Math.max(atr * 3, range * 0.06)
  const tolerance = Math.max(atr * 0.6, range * 0.003)
  const candidates: Level[] = []
  for (const kind of ['high', 'low'] as const) {
    const direction = kind === 'high' ? 1 : -1
    for (let i = radius; i < bars.length - radius; i++) {
      const price = bars[i][kind]
      const window = bars.slice(i - radius, i + radius + 1)
      if (window.some((bar) => direction * (bar[kind] - price) > 0)) continue
      const retreat = (part: Bar[]) => Math.max(...part.map((bar) => direction * (price - bar.close)))
      const prominence = Math.min(retreat(bars.slice(i - radius, i)), retreat(bars.slice(i + 1, i + radius + 1)))
      if (prominence < prominenceThreshold || direction * (bars.at(-1)!.close - price) > tolerance) continue
      let broken = false
      let consecutive = 0
      for (let j = i + 1; j < bars.length; j++) {
        consecutive = direction * (bars[j].close - price) > tolerance ? consecutive + 1 : 0
        if (consecutive >= 2) { broken = true; break }
      }
      if (!broken) candidates.push({ time: bars[i].time, price, kind, score: prominence / atr, pivotCount: 1 })
    }
  }
  const result: Level[] = []
  for (const kind of ['high', 'low'] as const) {
    const clusters: Level[][] = []
    for (const candidate of candidates.filter((level) => level.kind === kind).sort((a, b) => a.price - b.price)) {
      const cluster = clusters.at(-1)
      if (cluster && candidate.price - cluster[0].price <= tolerance) cluster.push(candidate)
      else clusters.push([candidate])
    }
    const grouped = clusters.map((cluster) => {
      const outer = cluster.reduce((best, level) => (kind === 'high' ? level.price > best.price : level.price < best.price) ? level : best)
      const independent = cluster.sort((a, b) => a.time - b.time).filter((level, index, all) => index === 0 || level.time - all[index - 1].time >= radius * (bars[1].time - bars[0].time))
      return { ...outer, pivotCount: independent.length, score: Math.max(...cluster.map((level) => level.score)) }
    }).sort((a, b) => (b.score + Math.min(3, b.pivotCount) * 2) - (a.score + Math.min(3, a.pivotCount) * 2) || b.time - a.time)
    const selected: Level[] = []
    for (const level of grouped) {
      if (selected.some((other) => Math.abs(other.price - level.price) < tolerance * 2)) continue
      selected.push(level)
      if (selected.length === 2) break
    }
    result.push(...selected)
  }
  return result
}
