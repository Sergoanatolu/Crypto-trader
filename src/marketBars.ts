import type { Bar } from './levels'
import { dayStart, findLevels } from './levels'

export async function fetchHuntLevels(symbol: string, signal: AbortSignal, loader = fetchBars) {
  const cutoff = dayStart()
  const groups = []
  for (const [frame, seconds] of [['1H', 3600], ['4H', 14400]] as const) {
    const bars = await loader(symbol, frame, signal, cutoff - 1)
    groups.push({ frame, levels: findLevels(bars.filter((bar) => (bar.time + seconds) * 1000 <= cutoff)).map((level) => ({ ...level, sourceFrame: frame })) })
  }
  return groups
}

export class MarketRateLimitError extends Error {
  retryMs: number
  constructor(status: number, retryAfter: string | null) {
    super(`Binance: ${status}`)
    const seconds = Number(retryAfter)
    const until = Date.parse(retryAfter ?? '') - Date.now()
    this.retryMs = Math.max(300000, Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(until) ? until : 0)
  }
}

export async function fetchBars(symbol: string, frame: string, signal: AbortSignal, end?: number): Promise<Bar[]> {
  const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${frame.toLowerCase()}&limit=1000${end === undefined ? '' : `&endTime=${end}`}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
  if (response.status === 429 || response.status === 418) throw new MarketRateLimitError(response.status, response.headers.get('Retry-After'))
  if (!response.ok) throw new Error(`Binance: ${response.status}`)
  const rows: unknown = await response.json()
  if (!Array.isArray(rows)) throw new Error('Invalid candles')
  return rows.map((row) => {
    const bar = { time: Number(row[0]) / 1000, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }
    if (!Object.values(bar).every(Number.isFinite)) throw new Error('Invalid candle')
    return bar
  })
}

