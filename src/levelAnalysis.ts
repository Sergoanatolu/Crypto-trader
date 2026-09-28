import type { Bar, Level } from './levels'

export type FrameLevels = { frame: string; levels: Level[] } 
export type LevelAnalysis = ReturnType<typeof analyzeLevel>

export function averageRange(bars: Bar[]): number {
  return bars.length ? bars.reduce((sum, bar, i) => sum + Math.max(bar.high - bar.low, Math.abs(bar.high - (bars[i - 1]?.close ?? bar.open)), Math.abs(bar.low - (bars[i - 1]?.close ?? bar.open))), 0) / bars.length : 0
}

// Input contains closed candles only. Scores are explanatory heuristics, not probabilities.
export function analyzeLevel(level: Level, bars: Bar[], otherFrames: FrameLevels[] = []) {
  const atr = averageRange(bars.slice(-21))
  const zone = atr * 0.25
  const direction = level.kind === 'high' ? 1 : -1
  const away = (price: number) => direction * (level.price - price)
  const matchingFrames = otherFrames.filter(({ levels }) => levels.some((other) => other.kind === level.kind && Math.abs(other.price - level.price) <= zone)).map(({ frame }) => frame)
  const last = bars.at(-1)
  const base = { level, atr, zone, matchingFrames }
  if (!last || atr <= 0) return { ...base, strength: null, tests: 0, rebounds: 0, averageBounce: null, relativeVolume: null, pressure: null, reasons: ['Недостатньо даних'], state: 'Недостатньо даних' }

  let tests = 0
  let active = false
  let armed = true
  const bounces: number[] = []
  let excursion = 0
  let observing = false
  for (const bar of bars.filter((bar) => bar.time >= level.time)) {
    const touches = bar.high >= level.price - zone && bar.low <= level.price + zone
    if (armed && touches) {
      if (observing) bounces.push(excursion / atr)
      observing = false
      excursion = 0
      tests++
      active = true
      armed = false
    }
    if (active && away(bar.close) >= atr) {
      active = false
      observing = true
      excursion = away(bar.close)
      armed = true
    } else if (active && away(bar.close) < -zone) {
      active = false
    }
    if (observing) excursion = Math.max(excursion, away(bar.close))
    // A new test needs a separate approach from the original side.
    if (!active && away(bar.close) >= atr) armed = true
  }
  const completed = observing ? [...bounces, excursion / atr] : bounces
  const averageBounce = completed.length ? completed.reduce((a, b) => a + b, 0) / completed.length : null
  const baseline = bars.slice(-21, -1)
  const meanVolume = baseline.length === 20 ? baseline.reduce((sum, bar) => sum + bar.volume, 0) / 20 : 0
  const relativeVolume = meanVolume > 0 ? last.volume / meanVolume : null
  const distance = away(last.close) / atr
  const previous = bars.at(-2)
  const state = distance < -0.3 && previous && away(previous.close) / atr < -0.3
    ? 'Закріплення за рівнем' : distance < -0.25 ? 'Закриття за рівнем' : 'Рівень утримується'
  const recent = bars.slice(-4)
  const approaching = recent.length === 4 && recent.every((bar, i) => i === 0 || away(bar.close) < away(recent[i - 1].close))
  const shrinking = completed.length >= 3 && completed.slice(-3).every((value, i, values) => i === 0 || value < values[i - 1])
  const near = distance >= -0.25 && distance <= 1
  const reasons: string[] = []
  let pressurePoints = 0
  if (near) { pressurePoints++; reasons.push('Ціна в межах 1 ATR від рівня') }
  if (near && approaching) { pressurePoints += 2; reasons.push('Чотири закриття поспіль наближаються до рівня') }
  if (near && shrinking) { pressurePoints += 2; reasons.push('Останні три відскоки скорочуються') }
  if (near && relativeVolume !== null && relativeVolume >= 1.5 && previous && away(last.close) < away(previous.close)) { pressurePoints++; reasons.push('Рух до рівня на підвищеному обсязі') }
  if (!near) reasons.push(distance < -0.25 ? 'Ціна вже за рівнем' : 'Ціна далеко від рівня')
  const pressure = distance < -0.25 ? null : pressurePoints >= 4 ? 'Високий' : pressurePoints >= 2 ? 'Помірний' : 'Низький'
  const strength = Math.round(Math.min(25, level.score * 5) + Math.min(30, completed.length * 7.5) + Math.min(30, (averageBounce ?? 0) * 10) + Math.min(15, matchingFrames.length * 5))
  return { ...base, strength, tests, rebounds: completed.length, averageBounce, relativeVolume, pressure, reasons, state }
}
