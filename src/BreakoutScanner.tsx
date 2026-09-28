import { useEffect, useRef, useState } from 'react'
import { analyzeLevel } from './levelAnalysis'
import { distancePercent } from './breakout'
import { formatPrice } from './prices'
import { fetchBars, fetchHuntLevels, MarketRateLimitError } from './marketBars'
import { kyivDay, nearestApproachLevel } from './levels'
import { selectScannerRows } from './scannerResults'

export type ScanMarket = { symbol: string; quoteVolume?: number; change: number }
type Row = { symbol: string; price: number; level: number; kind: string; strength: number | null; distance: number; volume: number; change: number; at: number; sourceFrame?: string; pressure: string | null; relativeVolume: number | null; state: string; outdated?: boolean; pivotCount?: number }

export function BreakoutScanner({ markets, onSelect }: { markets: ScanMarket[]; onSelect: (symbol: string) => void }) {
  const latest = useRef(markets)
  useEffect(() => { latest.current = markets }, [markets])
  const [distance, setDistance] = useState(1)
  const [volume, setVolume] = useState(100)
  const [limit, setLimit] = useState(200)
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(0)
  const [minStrength, setMinStrength] = useState(0)
  const [order, setOrder] = useState<'distance' | 'strength'>('distance')
  const [repeatedOnly, setRepeatedOnly] = useState(true)
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState(Date.now)
  const levelCache = useRef(new Map<string, { day: string; groups: Awaited<ReturnType<typeof fetchHuntLevels>> }>())
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(clock)
  }, [])
  const cooldownUntil = useRef(0)
  const hasMarkets = markets.some((market) => Number.isFinite(market.quoteVolume) && market.quoteVolume! >= volume * 1e6)
  useEffect(() => {
    if (paused) return
    const controller = new AbortController()
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const pacedFetch: typeof fetchBars = async (...args) => {
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(pause); controller.signal.removeEventListener('abort', finish); resolve() }
        const pause = setTimeout(finish, 400)
        controller.signal.addEventListener('abort', finish, { once: true })
        if (controller.signal.aborted) finish()
      })
      controller.signal.throwIfAborted()
      return fetchBars(...args)
    }
    const scan = async () => {
      if (stopped) return
      if (Date.now() < cooldownUntil.current) {
        setRunning(true)
        setStatus(`Пауза Binance до ${new Date(cooldownUntil.current).toLocaleTimeString('uk-UA')}`)
        timer = setTimeout(() => { void scan() }, Math.min(cooldownUntil.current - Date.now(), 2147483647))
        return
      }
      setRunning(true)
      const candidates = latest.current.filter((market) => Number.isFinite(market.quoteVolume) && market.quoteVolume! >= volume * 1e6).sort((a, b) => b.quoteVolume! - a.quoteVolume!).slice(0, limit || undefined)
      const symbols = new Set(candidates.map((market) => market.symbol))
      setRows((current) => current.filter((row) => symbols.has(row.symbol)).map((row) => ({ ...row, outdated: true })))
      let failed = 0
      let completed = 0
      for (const market of candidates) {
        if (stopped) return
        setStatus(`Перевірка ${++completed}/${candidates.length} · ${market.symbol}`)
        try {
          const cacheDay = kyivDay()
          const cached = levelCache.current.get(market.symbol)
          const groups = cached?.day === cacheDay ? cached.groups : await fetchHuntLevels(market.symbol, controller.signal, pacedFetch)
          if (stopped) return
          levelCache.current.set(market.symbol, { day: cacheDay, groups })
          const recent = await pacedFetch(market.symbol, '5m', controller.signal)
          const closed = recent.filter((bar) => (bar.time + 300) * 1000 <= Date.now()).slice(-999)
          const price = recent.at(-1)?.close
          if (!price) throw new Error('No price')
          const levels = groups.flatMap((group) => group.levels)
          const nearest = nearestApproachLevel(levels, price, repeatedOnly)
          if (!stopped && nearest) {
            const analysis = analyzeLevel(nearest, closed, groups)
            setRows((current) => [...current.filter((row) => row.symbol !== market.symbol), { symbol: market.symbol, price, level: nearest.price, kind: nearest.kind, strength: analysis.strength, distance: distancePercent(price, nearest.price), volume: market.quoteVolume!, change: market.change, at: Date.now(), sourceFrame: nearest.sourceFrame, pressure: analysis.pressure, relativeVolume: analysis.relativeVolume, state: analysis.state, pivotCount: nearest.pivotCount }])
          } else if (!stopped) {
            setRows((current) => current.filter((row) => row.symbol !== market.symbol))
          }
        } catch (error) {
          if (stopped) return
          failed++
          if (error instanceof MarketRateLimitError) {
            cooldownUntil.current = Date.now() + error.retryMs
            setStatus(`Ліміт Binance · перевірено ${completed}/${candidates.length}. Продовжимо новим циклом о ${new Date(cooldownUntil.current).toLocaleTimeString('uk-UA')}`)
            timer = setTimeout(() => { void scan() }, Math.min(error.retryMs, 2147483647))
            return
          }
        }
      }
      if (stopped) return
      setRunning(false)
      setStatus(candidates.length ? `Перевірено ${candidates.length} · помилок ${failed}` : 'Немає актуальних монет за порогом обсягу')
      timer = setTimeout(() => { void scan() }, 300000)
    }
    void scan()
    return () => { stopped = true; controller.abort(); clearTimeout(timer) }
  }, [volume, limit, run, hasMarkets, paused, repeatedOnly])
  const visibleRows = selectScannerRows(rows, distance, minStrength, order, now)
  return <div className="breakout-scanner">
    <strong>Полювання · 5M</strong>
    <label>Тип рівнів<select value={repeatedOnly ? 'repeated' : 'all'} onChange={(e) => { setRows([]); setRepeatedOnly(e.target.value === 'repeated') }}><option value="repeated">Повторні відбої</option><option value="all">Усі рівні</option></select></label>
    <p>«Повторні відбої»: щонайменше дві окремі вершини або западини в межах 0,5 ATR із відходом між ними. Ціна під опором або над підтримкою; відстань обмежує фільтр нижче. Це пошук форми рівня, а не гарантія пробою.</p>
    <p>Рівні 5M / 1H / 4H · сигнали 5M. Шукаємо найближчий рівень серед усіх трьох ТФ. Реакції, обсяг і пробій оцінюються за останніми 999 закритими свічками 5M.</p>
    <p>{limit === 0 ? 'Усі доступні монети' : `До ${limit} найбільших монет за обсягом`}, які проходять фільтр. Великий список перевіряється кілька хвилин; результати з’являються поступово. Новий цикл через 5 хв після завершення.</p>
    <label>Кількість монет<select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[12, 25, 50, 100, 200, 500, 0].map((v) => <option key={v} value={v}>{v === 0 ? 'Усі' : v}</option>)}</select></label>
    <label>Відстань до рівня<select value={distance} onChange={(e) => setDistance(Number(e.target.value))}>{[0.25, 0.5, 1, 2, 5].map((v) => <option key={v} value={v}>{v}%</option>)}</select></label>
    <label>Обсяг 24 год, USDT<select value={volume} onChange={(e) => setVolume(Number(e.target.value))}>{[0, 5, 10, 25, 50, 100, 200, 300].map((v) => <option key={v} value={v}>{v === 0 ? 'Без мінімуму' : `≥ ${v} млн`}</option>)}</select></label>
    <label>Мінімальна сила<select value={minStrength} onChange={(e) => setMinStrength(Number(e.target.value))}>{[0, 40, 60, 80].map((v) => <option key={v} value={v}>{v === 0 ? 'Будь-яка' : `${v}/100`}</option>)}</select></label>
    <label>Сортування<select value={order} onChange={(e) => setOrder(e.target.value as 'distance' | 'strength')}><option value="distance">Найближчі</option><option value="strength">Найсильніші</option></select></label>
    <button disabled={running && !paused} onClick={() => { setPaused(false); setRun((v) => v + 1) }}>{paused ? 'Продовжити' : 'Оновити'}</button>
    {!paused && <button onClick={() => { setPaused(true); setRunning(false); setStatus('Зупинено · автоматичне оновлення вимкнено') }}>Зупинити</button>}
    <p>Знайдено: {visibleRows.length}. Свіжі результати показуємо першими. Рівні кешуються до нового дня за Києвом.</p>
    <p role="status">{status}</p>
    {!running && !visibleRows.length && <p>Поблизу рівнів за цими умовами нічого не знайдено.</p>}
    {visibleRows.map((row) => <button className="scan-row" key={row.symbol} onClick={() => onSelect(row.symbol)}>
      {(row.outdated || now - row.at > 600000) && <small className="scan-stale">{row.outdated ? 'Попередній результат · ще не оновлено' : 'Дані старші 10 хв · перевірте графік'}</small>}
      <strong>{row.symbol} <span>{row.distance.toFixed(2)}%</span></strong>
      <small>{row.kind === 'high' ? 'Опір' : 'Підтримка'} {formatPrice(row.level)} · {row.sourceFrame} · {row.strength ?? '—'}/100</small>
      <small>Окремих екстремумів на {row.sourceFrame}: {row.pivotCount ?? 1}</small>
      <small>5M: {row.state} · Тиск {row.pressure ?? '—'} · Обсяг {row.relativeVolume === null ? '—' : `×${row.relativeVolume.toFixed(2)}`}</small>
      <small>Ціна {formatPrice(row.price)} · {row.change.toFixed(2)}%</small>
      <small>{(row.volume / 1e6).toFixed(0)} млн USDT · {new Date(row.at).toLocaleTimeString('uk-UA')}</small>
    </button>)}
  </div>
}
