import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries } from 'lightweight-charts'
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { dayStart, findLevels, kyivDay } from './levels'
import type { Bar } from './levels'
import { DrawingTools } from './DrawingTools'
import type { DrawingChart } from './DrawingTools'
import { formatPrice } from './prices'

const frames = ['1m', '5m', '15m', '1H', '4H', '1D', '1W']

async function fetchBars(symbol: string, frame: string, signal: AbortSignal, end?: number): Promise<Bar[]> {
  const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${frame.toLowerCase()}&limit=1000${end === undefined ? '' : `&endTime=${end}`}`, { signal })
  if (!response.ok) throw new Error(`Binance: ${response.status}`)
  const rows: unknown = await response.json()
  if (!Array.isArray(rows)) throw new Error('Invalid candles')
  return rows.map((row) => {
    const bar = { time: Number(row[0]) / 1000, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }
    if (!Object.values(bar).every(Number.isFinite)) throw new Error('Invalid candle')
    return bar
  })
}

export function AutoChart({ symbol, onPrice }: { symbol: string; onPrice: (symbol: string, price: number) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const [drawingApi, setDrawingApi] = useState<(DrawingChart & { identity: string }) | null>(null)
  const [frame, setFrame] = useState('5m')
  const [day, setDay] = useState(kyivDay)
  const [retry, setRetry] = useState(0)
  const [showLevels, setShowLevels] = useState(true)
  const [status, setStatus] = useState('Завантаження…')
  const [error, setError] = useState(false)
  const lines = useRef<ISeriesApi<'Line'>[]>([])
  const visible = useRef(showLevels)

  useEffect(() => {
    const check = () => setDay(kyivDay())
    const timer = window.setInterval(check, 15000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [])

  useEffect(() => {
    visible.current = showLevels
    lines.current.forEach((line) => line.applyOptions({ visible: showLevels }))
  }, [showLevels])

  useEffect(() => {
    if (!container.current) return
    const controller = new AbortController()
    let stopped = false
    let socket: WebSocket | undefined
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let lastTime = 0
    let readyStatus = ''
    const chart = createChart(container.current, {
      autoSize: true,
      localization: { priceFormatter: formatPrice },
      layout: { background: { type: ColorType.Solid, color: '#111313' }, textColor: '#aaa69b' },
      grid: { vertLines: { color: '#242725' }, horzLines: { color: '#242725' } },
      rightPriceScale: { borderColor: '#282a29', scaleMargins: { top: 0.08, bottom: 0.2 } },
      timeScale: { timeVisible: true, borderColor: '#282a29', rightOffset: 12 },
      crosshair: { mode: 0 },
    })
    const candles = chart.addSeries(CandlestickSeries, { upColor: '#66c49b', downColor: '#dc7e79', borderVisible: false, wickUpColor: '#66c49b', wickDownColor: '#dc7e79' })
    const duration = frame === '1W' ? 604800 : frame === '1D' ? 86400 : frame.endsWith('H') ? Number.parseInt(frame) * 3600 : Number.parseInt(frame) * 60
    setDrawingApi({ chart, candles, duration, identity: `${symbol}-${frame}-${day}-${retry}` })
    const volumes = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    volumes.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    lines.current = []
    const volume = (bar: Bar) => ({ time: bar.time as UTCTimestamp, value: bar.volume, color: bar.close >= bar.open ? '#376b58' : '#794744' })
    const startSocket = () => {
      if (stopped) return
      socket = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${frame.toLowerCase()}`)
      socket.onopen = () => { if (!stopped) setStatus(readyStatus) }
      socket.onmessage = (event) => {
        if (stopped) return
        try {
          const { k } = JSON.parse(event.data)
          const bar: Bar = { time: Number(k.t) / 1000, open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v) }
          if (!Object.values(bar).every(Number.isFinite) || bar.time < lastTime) return
          candles.update({ ...bar, time: bar.time as UTCTimestamp })
          onPrice(symbol, bar.close)
          volumes.update(volume(bar))
          if (bar.time > lastTime) lines.current.forEach((line) => {
            const first = line.data()[0]
            if (first && 'value' in first) line.update({ time: bar.time as UTCTimestamp, value: first.value })
          })
          lastTime = bar.time
        } catch { /* Ignore malformed stream messages. */ }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (stopped) return
        setStatus('З’єднання перервано. Відновлення…')
        reconnect = setTimeout(() => setRetry((value) => value + 1), 5000)
      }
    }
    const load = async () => {
      setError(false)
      setStatus('Завантаження свічок і рівнів…')
      try {
        const cutoff = dayStart()
        let end = cutoff - 1
        let history: Bar[] = []
        for (let page = 0; page < 3; page++) {
          const batch = await fetchBars(symbol, frame, controller.signal, end)
          history = [...batch, ...history]
          if (batch.length < 1000) break
          end = batch[0].time * 1000 - 1
        }
        // A weekly/daily bar returned before midnight may still be forming.
        const duration = frame === '1W' ? 604800 : frame === '1D' ? 86400 : frame.endsWith('H') ? Number.parseInt(frame) * 3600 : Number.parseInt(frame) * 60
        history = history.filter((bar) => (bar.time + duration) * 1000 <= cutoff)
        let recent = await fetchBars(symbol, frame, controller.signal)
        if (recent.length === 1000 && recent[0].time * 1000 > cutoff) {
          const earlier = await fetchBars(symbol, frame, controller.signal, recent[0].time * 1000 - 1)
          recent = [...earlier, ...recent]
        }
        if (stopped) return
        const all = [...new Map([...history, ...recent].map((bar) => [bar.time, bar])).values()].sort((a, b) => a.time - b.time)
        if (!all.length) throw new Error('No candles')
        const minMove = 10 ** Math.floor(Math.log10(Math.max(all[all.length - 1].close * 0.00001, 1e-8)))
        const priceFormat = { type: 'price' as const, precision: Math.max(0, -Math.round(Math.log10(minMove))), minMove }
        candles.applyOptions({ priceFormat })
        candles.setData(all.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })))
        onPrice(symbol, all[all.length - 1].close)
        volumes.setData(all.map(volume))
        lastTime = all[all.length - 1].time
        const levels = findLevels(history)
        lines.current = levels.map((level) => {
          const line = chart.addSeries(LineSeries, { color: level.kind === 'high' ? '#3868ff' : '#24b7a5', lineWidth: 2, pointMarkersVisible: false, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: true, visible: visible.current, priceFormat, autoscaleInfoProvider: () => null })
          line.setData([{ time: level.time as UTCTimestamp, value: level.price }, { time: lastTime as UTCTimestamp, value: level.price }])
          return line
        })
        const count = Math.min(all.length, frame === '5m' ? 2200 : 500)
        chart.timeScale().setVisibleLogicalRange({ from: all.length - count, to: all.length + 12 })
        readyStatus = levels.length ? `Рівнів: ${levels.length} · ${day} · Київ` : 'Недостатньо підтверджених екстремумів'
        setStatus(readyStatus)
        startSocket()
      } catch {
        if (!stopped) { setError(true); setStatus('Не вдалося завантажити дані Binance.') }
      }
    }
    void load()
    return () => { stopped = true; controller.abort(); clearTimeout(reconnect); socket?.close(); lines.current = []; chart.remove() }
  }, [symbol, frame, day, retry, onPrice])

  return <div className="local-chart-shell auto-chart-shell">
    <div className="local-chart-tools"><strong>{symbol}</strong><div className="chart-timeframes">{frames.map((value) => <button key={value} className={frame === value ? 'tool-active' : ''} onClick={() => setFrame(value)}>{value}</button>)}</div><button aria-pressed={showLevels} className={showLevels ? 'tool-active' : ''} onClick={() => setShowLevels((value) => !value)}>Авто рівні</button></div>
    <div className="levels-status" role="status"><span className="level-high">● Максимуми</span><span className="level-low">● Мінімуми</span><span>{status}</span>{error && <button onClick={() => setRetry((value) => value + 1)}>Повторити</button>}</div>
    <div className="local-chart" ref={container} />
    {drawingApi?.identity === `${symbol}-${frame}-${day}-${retry}` && <DrawingTools key={drawingApi.identity} api={drawingApi} storageKey={`vanta-drawings-v2-${symbol}`} />}
  </div>
}
