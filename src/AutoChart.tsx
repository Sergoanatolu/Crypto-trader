import { fetchBars } from './marketBars'
import { useLevelAlerts, watchKey } from './useLevelAlerts'
import { findStructureLevels } from './structureLevels'
import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, LineSeries } from 'lightweight-charts'
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { dayStart, findLevels, kyivDay } from './levels'
import type { Bar, Level } from './levels'
import { analyzeLevel } from './levelAnalysis'
import type { FrameLevels, LevelAnalysis } from './levelAnalysis'
import { LevelInsights } from './LevelInsights'
import { DrawingTools } from './DrawingTools'
import type { DrawingChart } from './DrawingTools'
import { formatPrice } from './prices'

const frames = ['1m', '5m', '15m', '1H', '4H', '1D', '1W']
const volumeFormatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 8 })

export function AutoChart({ symbol, onPrice, chartRequest }: { symbol: string; onPrice: (symbol: string, price: number) => void; chartRequest?: { id: number; frame: string } }) {
  const container = useRef<HTMLDivElement>(null)
  const [drawingApi, setDrawingApi] = useState<(DrawingChart & { identity: string }) | null>(null)
  const [frame, setFrame] = useState('5m')
  const [appliedRequest, setAppliedRequest] = useState<number>()
  if (chartRequest && chartRequest.id !== appliedRequest) {
    setAppliedRequest(chartRequest.id)
    setFrame(chartRequest.frame)
  }
  const alerts = useLevelAlerts()
  const alertMonitor = useRef(alerts.evaluate)
  useEffect(() => { alertMonitor.current = alerts.evaluate }, [alerts.evaluate])
  const [showAlerts, setShowAlerts] = useState(false)
  const [day, setDay] = useState(kyivDay)
  const [retry, setRetry] = useState(0)
  const [showLevels, setShowLevels] = useState(true)
  const [status, setStatus] = useState('Завантаження…')
  const [error, setError] = useState(false)
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'end' | 'error'>('loading')
  const loadOlderRef = useRef<() => void>(() => {})
  const [hoveredVolume, setHoveredVolume] = useState<number | null>(null)
  const [insights, setInsights] = useState<{ identity: string; items: LevelAnalysis[]; unavailableFrames: string[]; updatedAt: number | null } | null>(null)
  const [selectedLevel, setSelectedLevel] = useState<{ identity: string; time: number; kind: Level['kind']; sourceFrame?: string } | null>(null)
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
  }, [showLevels, insights])

  useEffect(() => {
    if (!selectedLevel) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedLevel(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [selectedLevel])

  useEffect(() => {
    if (!container.current) return
    const controller = new AbortController()
    let stopped = false
    let socket: WebSocket | undefined
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let lastTime = 0
    let readyStatus = ''
    let analysisBars: Bar[] = []
    let analysisLevels: Level[] = []
    let otherFrames: FrameLevels[] = []
    let unavailableFrames: string[] = []
    let liveItems: LevelAnalysis[] = []
    let livePrice = 0
    let firstChartTime = 0
    let loadingOlder = false
    let historyReady = false
    let historyEnded = false
    setHistoryStatus('loading')
    const identity = `${symbol}-${frame}-${day}-${retry}`
    const rebuildLevels = () => {
      lines.current.forEach((line) => chart.removeSeries(line))
      analysisLevels = findStructureLevels(analysisBars.slice(frame === '5m' ? -2200 : -500))
      lines.current = analysisLevels.map((level) => {
        const line = chart.addSeries(LineSeries, { color: '#22c9e6', lineWidth: 2, pointMarkersVisible: false, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: true, visible: visible.current, priceFormat: candles.options().priceFormat, autoscaleInfoProvider: () => null })
        line.setData([{ time: level.time as UTCTimestamp, value: level.price }, { time: lastTime as UTCTimestamp, value: level.price }])
        return line
      })
    }
    const refreshInsights = () => {
      if (stopped) return
      liveItems = analysisLevels.map((level) => analyzeLevel(level, analysisBars, otherFrames)).sort((a, b) => Math.abs(a.level.price - (analysisBars.at(-1)?.close ?? 0)) - Math.abs(b.level.price - (analysisBars.at(-1)?.close ?? 0)))
      setInsights({ identity, items: liveItems, unavailableFrames, updatedAt: analysisBars.length ? analysisBars[analysisBars.length - 1].time + duration : null })
      if (livePrice > 0) alertMonitor.current(symbol, frame, liveItems, livePrice)
    }
    const volumesByTime = new Map<number, number>()
    let hoveredTime: number | null = null
    setHoveredVolume(null)
    setSelectedLevel(null)
    const chart = createChart(container.current, {
      autoSize: true,
      localization: { priceFormatter: formatPrice },
      layout: { background: { type: ColorType.Solid, color: '#111313' }, textColor: '#aaa69b' },
      grid: { vertLines: { color: '#242725' }, horzLines: { color: '#242725' } },
      rightPriceScale: { borderColor: '#282a29', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { timeVisible: true, borderColor: '#282a29', rightOffset: 12 },
      crosshair: { mode: 0 },
    })
    const candles = chart.addSeries(CandlestickSeries, { upColor: '#66c49b', downColor: '#dc7e79', borderVisible: false, wickUpColor: '#66c49b', wickDownColor: '#dc7e79' })
    const handleCrosshairMove: Parameters<typeof chart.subscribeCrosshairMove>[0] = (event) => {
      const point = event.point
      hoveredTime = point && point.x >= 0 && point.y >= 0
        && point.x < chart.paneSize().width && point.y < chart.paneSize().height
        && event.seriesData.has(candles) && typeof event.time === 'number' ? event.time : null
      setHoveredVolume(hoveredTime === null ? null : volumesByTime.get(hoveredTime) ?? null)
    }
    chart.subscribeCrosshairMove(handleCrosshairMove)
    const handleLevelClick: Parameters<typeof chart.subscribeClick>[0] = (event) => {
      const point = event.point
      if (!visible.current || !point || point.x < 0 || point.y < 0 || point.x >= chart.paneSize().width || point.y >= chart.paneSize().height) return
      let nearest: Level | null = null
      let nearestDistance = 8 // A small pixel tolerance also makes thin lines tappable.
      const endX = chart.timeScale().width()
      for (const [index, level] of analysisLevels.entries()) {
        if (!lines.current[index]?.options().visible) continue
        const y = candles.priceToCoordinate(level.price)
        const startX = chart.timeScale().timeToCoordinate(Math.max(level.time, firstChartTime) as UTCTimestamp)
        if (y === null || startX === null || endX === null || point.x < startX || point.x > endX) continue
        const distance = Math.abs(point.y - y)
        if (distance <= nearestDistance) { nearest = level; nearestDistance = distance }
      }
      setSelectedLevel(nearest ? { identity, time: nearest.time, kind: nearest.kind, sourceFrame: nearest.sourceFrame } : null)
    }
    chart.subscribeClick(handleLevelClick)
    const loadOlder = async () => {
      if (stopped || !historyReady || loadingOlder || historyEnded) return
      loadingOlder = true
      setHistoryStatus('loading')
      try {
        const batch = await fetchBars(symbol, frame, controller.signal, firstChartTime * 1000 - 1)
        if (stopped) return
        const older = batch.filter((bar) => bar.time < firstChartTime)
        if (older.length) {
          // Read the current series after fetching so live candle updates are retained.
          const range = chart.timeScale().getVisibleLogicalRange()
          const current = candles.data()
          candles.setData([...older.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })), ...current])
          older.forEach((bar) => volumesByTime.set(bar.time, bar.volume))
          firstChartTime = older[0].time
          if (range) chart.timeScale().setVisibleLogicalRange({ from: range.from + older.length, to: range.to + older.length })
        }
        historyEnded = batch.length < 1000 || older.length === 0
        setHistoryStatus(historyEnded ? 'end' : 'ready')
      } catch {
        if (!stopped) setHistoryStatus('error')
      } finally {
        loadingOlder = false
      }
    }
    loadOlderRef.current = () => { void loadOlder() }
    const duration = frame === '1W' ? 604800 : frame === '1D' ? 86400 : frame.endsWith('H') ? Number.parseInt(frame) * 3600 : Number.parseInt(frame) * 60
    setDrawingApi({ chart, candles, duration, identity: `${symbol}-${frame}-${day}-${retry}` })
    lines.current = []
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
          volumesByTime.set(bar.time, bar.volume)
          if (hoveredTime === bar.time) setHoveredVolume(bar.volume)
          candles.update({ ...bar, time: bar.time as UTCTimestamp })
          onPrice(symbol, bar.close)
          livePrice = bar.close
          if (k.x === true) {
            analysisBars = [...analysisBars.filter((existing) => existing.time !== bar.time), bar].sort((a, b) => a.time - b.time)
            rebuildLevels()
            refreshInsights()
          }
          alertMonitor.current(symbol, frame, liveItems, bar.close)
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
        setInsights(null)
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
        for (let page = 0; page < 5; page++) {
          const batch = await fetchBars(symbol, frame, controller.signal, end)
          history = [...batch, ...history]
          if (batch.length < 1000) { historyEnded = true; break }
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
        all.forEach((bar) => volumesByTime.set(bar.time, bar.volume))
        candles.setData(all.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })))
        onPrice(symbol, all[all.length - 1].close)
        livePrice = all[all.length - 1].close
        lastTime = all[all.length - 1].time
        firstChartTime = all[0].time
        historyReady = true
        setHistoryStatus(historyEnded ? 'end' : 'ready')
        analysisBars = all.filter((bar) => (bar.time + duration) * 1000 <= Date.now())
        rebuildLevels()
        const frameDurations = [{ frame: '1H', seconds: 3600 }, { frame: '4H', seconds: 14400 }, { frame: '1D', seconds: 86400 }].filter((entry) => entry.seconds > duration)
        unavailableFrames = frameDurations.map((entry) => entry.frame)
        refreshInsights()
        void Promise.allSettled(frameDurations.map(async (entry) => {
          const bars = await fetchBars(symbol, entry.frame, controller.signal)
          return { frame: entry.frame, levels: findLevels(bars.filter((bar) => (bar.time + entry.seconds) * 1000 <= Date.now())) }
        })).then((results) => {
          if (stopped) return
          otherFrames = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
          unavailableFrames = results.flatMap((result, i) => result.status === 'rejected' ? [frameDurations[i].frame] : [])
          refreshInsights()
        })
        const count = Math.min(all.length, frame === '5m' ? 2200 : 500)
        chart.timeScale().setVisibleLogicalRange({ from: all.length - count, to: all.length + 12 })
        readyStatus = `${day} · Київ`
        setStatus(readyStatus)
        startSocket()
      } catch {
        if (!stopped) { setError(true); setStatus('Не вдалося завантажити дані Binance.') }
      }
    }
    void load()
    return () => { stopped = true; controller.abort(); clearTimeout(reconnect); socket?.close(); lines.current = []; chart.unsubscribeCrosshairMove(handleCrosshairMove); chart.unsubscribeClick(handleLevelClick); chart.remove() }
  }, [symbol, frame, day, retry, onPrice])

  const identity = `${symbol}-${frame}-${day}-${retry}`
  const boundaryItems = insights?.identity === identity ? insights.items : []
  const selectedInsight = selectedLevel?.identity === identity && insights?.identity === identity
    ? insights.items.find((item) => item.level.time === selectedLevel.time && item.level.kind === selectedLevel.kind && item.level.sourceFrame === selectedLevel.sourceFrame) : undefined

  return <div className="local-chart-shell auto-chart-shell">
    <div className="local-chart-tools"><strong>{symbol}</strong><div className="chart-timeframes">{frames.map((value) => <button key={value} className={frame === value ? 'tool-active' : ''} onClick={() => setFrame(value)}>{value}</button>)}</div><button aria-pressed={showLevels} className={showLevels ? 'tool-active' : ''} onClick={() => { setSelectedLevel(null); setShowLevels((value) => !value) }}>Авто рівні</button></div>
    <div className="levels-status" role="status"><span className="candle-volume">Обсяг: {hoveredVolume === null ? '—' : `${volumeFormatter.format(hoveredVolume)} ${symbol.replace(/USDT$/, '')}`}</span><span title="До двох виразних вершин і двох низів. Лінії від тіней свічок вправо; пробиті межі приховано.">Межі руху: {showLevels ? boundaryItems.length : 0}</span><span>{status}</span>{error && <button onClick={() => setRetry((value) => value + 1)}>Повторити</button>}</div>
    <div className="local-chart" ref={container} />
    <div className="local-chart-tools">
      <button disabled={historyStatus === 'loading' || historyStatus === 'end' || error} onClick={() => loadOlderRef.current()}>
        {historyStatus === 'loading' ? 'Завантаження історії…' : historyStatus === 'end' ? 'Уся доступна історія завантажена' : historyStatus === 'error' ? 'Повторити завантаження історії' : 'Ще 1 000 свічок'}
      </button>
      <span role="status">{historyStatus === 'error' ? 'Не вдалося завантажити давніші свічки.' : 'Давніші свічки — ліворуч на графіку'}</span>
    </div>
    {showLevels && selectedInsight && insights && <LevelInsights key={`${identity}-${selectedInsight.level.sourceFrame}-${selectedInsight.level.kind}-${selectedInsight.level.time}`} error={error} items={[selectedInsight]} frame={frame} pending={false} unavailableFrames={insights.unavailableFrames} updatedAt={insights.updatedAt} onClose={() => setSelectedLevel(null)} volumeThreshold={alerts.volume} nearThreshold={alerts.near} onVolumeChange={alerts.setVolume} onNearChange={alerts.setNear} watched={alerts.watched.includes(watchKey(symbol, frame, selectedInsight))} onWatch={() => alerts.toggle(watchKey(symbol, frame, selectedInsight))} />}
    <div className="alert-tray"><button onClick={() => setShowAlerts(!showAlerts)} aria-expanded={showAlerts}>Алерти · {alerts.events.length}</button>
      {showAlerts && <div className="alert-feed"><p>Стеження лише за відкритою монетою та таймфреймом, поки сайт відкритий. Нові події після ввімкнення стеження.</p><button onClick={alerts.clear}>Очистити події</button>{!alerts.events.length && <p>Подій поки немає. Клікніть рівень → «Стежити».</p>}{alerts.events.map((event) => <p key={event.id}>{event.text}</p>)}</div>}
      <span className="alert-live" role="status">{alerts.events[0]?.text}</span>
    </div>
    {drawingApi?.identity === `${symbol}-${frame}-${day}-${retry}` && <DrawingTools key={drawingApi.identity} api={drawingApi} autoLevels={showLevels ? boundaryItems.map((item) => item.level) : []} storageKey={`vanta-drawings-v2-${symbol}`} />}
  </div>
}
