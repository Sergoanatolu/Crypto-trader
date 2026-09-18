export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number }
export type Level = { time: number; price: number; kind: 'high' | 'low'; score: number }

// Confirm pivots with twelve closed bars on both sides; merge nearby prices.
export function findLevels(bars: Bar[]): Level[] {
  const radius = 12
  if (bars.length < radius * 2 + 1) return []
  const atr = bars.reduce((sum, bar, i) => sum + Math.max(bar.high - bar.low, Math.abs(bar.high - (bars[i - 1]?.close ?? bar.open)), Math.abs(bar.low - (bars[i - 1]?.close ?? bar.open))), 0) / bars.length
  if (atr <= 0) return []
  const candidates: Level[] = []
  for (let i = radius; i < bars.length - radius; i++) {
    const bar = bars[i]
    const neighbors = bars.slice(i - radius, i + radius + 1)
    for (const kind of ['high', 'low'] as const) {
      const price = bar[kind]
      const pivot = neighbors.every((other) => kind === 'high' ? price >= other.high : price <= other.low)
      const left = bars.slice(i - radius, i)
      const right = bars.slice(i + 1, i + radius + 1)
      const prominence = kind === 'high'
        ? Math.min(price - Math.min(...left.map((b) => b.low)), price - Math.min(...right.map((b) => b.low)))
        : Math.min(Math.max(...left.map((b) => b.high)) - price, Math.max(...right.map((b) => b.high)) - price)
      if (pivot && prominence >= atr * 2) candidates.push({ time: bar.time, price, kind, score: prominence / atr })
    }
  }
  const result: Level[] = []
  for (const kind of ['high', 'low'] as const) {
    const selected: Level[] = []
    for (const candidate of candidates.filter((level) => level.kind === kind).sort((a, b) => b.score - a.score || b.time - a.time)) {
      if (selected.every((level) => Math.abs(level.price - candidate.price) > atr * 1.5)) selected.push(candidate)
      if (selected.length === 3) break
    }
    result.push(...selected)
  }
  return result
}

export function kyivDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Resolve local midnight through timezone conversion, including DST changes.
export function dayStart(now = new Date()): number {
  const day = kyivDay(now)
  let low = now.getTime() - 27 * 3600000
  let high = now.getTime()
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (kyivDay(new Date(mid)) === day) high = mid
    else low = mid
  }
  return high
}
