import type { Bar } from './levels'

export async function fetchBars(symbol: string, frame: string, signal: AbortSignal, end?: number): Promise<Bar[]> {
  const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${frame.toLowerCase()}&limit=1000${end === undefined ? '' : `&endTime=${end}`}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
  if (!response.ok) throw new Error(`Binance: ${response.status}`)
  const rows: unknown = await response.json()
  if (!Array.isArray(rows)) throw new Error('Invalid candles')
  return rows.map((row) => {
    const bar = { time: Number(row[0]) / 1000, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }
    if (!Object.values(bar).every(Number.isFinite)) throw new Error('Invalid candle')
    return bar
  })
}

