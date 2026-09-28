import { useEffect, useRef, useState } from 'react'
import { findLevels, dayStart } from './levels'
import { analyzeLevel } from './levelAnalysis'
import { distancePercent } from './breakout'
import { formatPrice } from './prices'
import { fetchBars } from './marketBars'

export type ScanMarket = { symbol: string; quoteVolume?: number; change: number }
type Row = { symbol: string; price: number; level: number; kind: string; strength: number | null; distance: number; volume: number; change: number; at: number }

export function BreakoutScanner({ markets, onSelect }: { markets: ScanMarket[]; onSelect: (symbol: string) => void }) {
  const latest = useRef(markets)
  useEffect(() => { latest.current = markets }, [markets])
  const [distance, setDistance] = useState(1)
  const [volume, setVolume] = useState(100)
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(0)
  const hasMarkets = markets.some((market) => Number.isFinite(market.quoteVolume) && market.quoteVolume! >= volume * 1e6)
  useEffect(() => {
    const controller = new AbortController()
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const scan = async () => {
      setRunning(true)
      setRows([])
      const candidates = latest.current.filter((market) => Number.isFinite(market.quoteVolume) && market.quoteVolume! >= volume * 1e6).sort((a, b) => b.quoteVolume! - a.quoteVolume!).slice(0, 12)
      let failed = 0
      let completed = 0
      for (const market of candidates) {
        if (stopped) return
        setStatus(`Перевірка ${++completed}/${candidates.length} · ${market.symbol}`)
        try {
          let end = dayStart() - 1
          let history: Awaited<ReturnType<typeof fetchBars>> = []
          for (let page = 0; page < 3; page++) {
            const batch = await fetchBars(market.symbol, '1H', controller.signal, end)
            history = [...batch, ...history]
            if (batch.length < 1000) break
            end = batch[0].time * 1000 - 1
          }
          const recent = await fetchBars(market.symbol, '1H', controller.signal)
          const closed = [...new Map([...history, ...recent].map((bar) => [bar.time, bar])).values()].sort((a, b) => a.time - b.time).filter((bar) => (bar.time + 3600) * 1000 <= Date.now())
          const price = recent.at(-1)?.close
          if (!price) throw new Error('No price')
          const levels = findLevels(history.filter((bar) => (bar.time + 3600) * 1000 <= dayStart()))
          const nearest = levels.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0]
          if (!stopped && nearest) {
            const analysis = analyzeLevel(nearest, closed)
            setRows((current) => [...current, { symbol: market.symbol, price, level: nearest.price, kind: nearest.kind, strength: analysis.strength, distance: distancePercent(price, nearest.price), volume: market.quoteVolume!, change: market.change, at: Date.now() }])
          }
        } catch { failed++ }
      }
      if (stopped) return
      setRunning(false)
      setStatus(candidates.length ? `Перевірено ${candidates.length} · помилок ${failed}` : 'Немає актуальних монет за порогом обсягу')
      timer = setTimeout(() => { void scan() }, 300000)
    }
    void scan()
    return () => { stopped = true; controller.abort(); clearTimeout(timer) }
  }, [volume, run, hasMarkets])
  const visibleRows = rows.filter((row) => row.distance <= distance).sort((a, b) => a.distance - b.distance)
  return <div className="breakout-scanner">
    <strong>Полювання на пробій · 1H</strong>
    <p>12 найбільших монет за обсягом. Оновлення кожні 5 хв. Сила без збігів старших ТФ.</p>
    <label>Відстань до рівня<select value={distance} onChange={(e) => setDistance(Number(e.target.value))}>{[0.25, 0.5, 1, 2, 5].map((v) => <option key={v} value={v}>{v}%</option>)}</select></label>
    <label>Обсяг 24 год, USDT<select value={volume} onChange={(e) => setVolume(Number(e.target.value))}>{[0, 50, 100, 200, 300].map((v) => <option key={v} value={v}>≥ {v} млн</option>)}</select></label>
    <button disabled={running} onClick={() => setRun((v) => v + 1)}>Оновити</button>
    <p role="status">{status}</p>
    {!running && !visibleRows.length && <p>Поблизу рівнів за цими умовами нічого не знайдено.</p>}
    {visibleRows.map((row) => <button className="scan-row" key={row.symbol} onClick={() => onSelect(row.symbol)}>
      <strong>{row.symbol} <span>{row.distance.toFixed(2)}%</span></strong>
      <small>{row.kind === 'high' ? 'Опір' : 'Підтримка'} {formatPrice(row.level)} · {row.strength ?? '—'}/100</small>
      <small>Ціна {formatPrice(row.price)} · {row.change.toFixed(2)}%</small>
      <small>{(row.volume / 1e6).toFixed(0)} млн USDT · {new Date(row.at).toLocaleTimeString('uk-UA')}</small>
    </button>)}
  </div>
}
