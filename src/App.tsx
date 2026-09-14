import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Filter, Search, Star, Trash2, TrendingUp } from 'lucide-react'
import { CandlestickSeries, ColorType, createChart, HistogramSeries } from 'lightweight-charts'
import type { Time } from 'lightweight-charts'
import './App.css'

type Market = { symbol: string; name: string; price: string; change: number; favorite?: boolean; pulse?: number; direction?: 'up' | 'down' }
const fallbackMarkets: Market[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', price: '67,842.10', change: 2.48, favorite: true },
  { symbol: 'ETHUSDT', name: 'Ethereum', price: '3,521.84', change: 1.92, favorite: true },
  { symbol: 'SOLUSDT', name: 'Solana', price: '182.64', change: 5.41 },
  { symbol: 'BNBUSDT', name: 'BNB', price: '594.20', change: -0.84 },
  { symbol: 'XRPUSDT', name: 'XRP', price: '0.5248', change: -1.26 },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', price: '0.1428', change: 3.76 },
  { symbol: 'AVAXUSDT', name: 'Avalanche', price: '36.84', change: 0.38 },
  { symbol: 'LINKUSDT', name: 'Chainlink', price: '18.42', change: -2.11 },
]
const intervals: Record<string, string> = { '1m': '1', '5m': '5', '15m': '15', '1H': '60', '4H': '240', '1D': 'D', '1W': 'W' }

type Candle = { time: Time; open: number; high: number; low: number; close: number; volume: number }
type Drawing = { x1: number; y1: number; x2: number; y2: number }

export function LocalChart({ symbol, timeframe, onTimeframeChange }: { symbol: string; timeframe: string; onTimeframeChange: (value: string) => void }) {
  const chartContainer = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const candleSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const [line, setLine] = useState<Drawing | null>(() => { try { return JSON.parse(localStorage.getItem(`vanta-drawing-${symbol}`) ?? 'null') } catch { return null } })
  const drawingRef = useRef(false)

  useEffect(() => {
    const container = chartContainer.current
    if (!container) return
    const chart = createChart(container, { layout: { background: { type: ColorType.Solid, color: '#111313' }, textColor: '#aaa69b' }, grid: { vertLines: { color: '#242725' }, horzLines: { color: '#242725' } }, rightPriceScale: { borderColor: '#282a29' }, timeScale: { borderColor: '#282a29', timeVisible: true }, crosshair: { mode: 0 }, autoSize: true })
    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: '#66c49b', downColor: '#dc7e79', borderVisible: false, wickUpColor: '#66c49b', wickDownColor: '#dc7e79' })
    const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    let socket: WebSocket | undefined
    const loadCandles = async () => {
      try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe.toLowerCase()}&limit=250`)
        const rows = await response.json() as (string | number)[][]
        const candles: Candle[] = rows.map((row) => ({ time: (Number(row[0]) / 1000) as Time, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }))
        candleSeries.setData(candles)
        volumeSeries.setData(candles.map((candle) => ({ time: candle.time, value: candle.volume, color: candle.close >= candle.open ? '#376b58' : '#794744' })))
        chart.timeScale().fitContent()
      } catch { /* The chart remains available while Binance is unreachable. */ }
    }
    void loadCandles()
    socket = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${timeframe.toLowerCase()}`)
    socket.onmessage = (event) => { const payload = JSON.parse(event.data) as { k: { t: number; o: string; h: string; l: string; c: string; v: string } }; const kline = payload.k; const time = (kline.t / 1000) as Time; candleSeries.update({ time, open: Number(kline.o), high: Number(kline.h), low: Number(kline.l), close: Number(kline.c) }); volumeSeries.update({ time, value: Number(kline.v), color: Number(kline.c) >= Number(kline.o) ? '#376b58' : '#794744' }) }
    const resizeObserver = new ResizeObserver(() => chart.resize(container.clientWidth, container.clientHeight))
    resizeObserver.observe(container)
    return () => { socket?.close(); resizeObserver.disconnect(); chart.remove(); chartRef.current = null }
  }, [symbol, timeframe])

  useEffect(() => { try { localStorage.setItem(`vanta-drawing-${symbol}`, JSON.stringify(line)) } catch { /* Storage can be unavailable in private browsing. */ } }, [line, symbol])
  const getPoint = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 } }
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => { if (!drawingMode) return; drawingRef.current = true; const point = getPoint(event); setLine({ x1: point.x, y1: point.y, x2: point.x, y2: point.y }) }
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (!drawingRef.current) return; const point = getPoint(event); setLine((current) => current ? { ...current, x2: point.x, y2: point.y } : current) }
  const stopDrawing = () => { drawingRef.current = false }

  return <div className="local-chart-shell"><div className="local-chart-tools"><span>BINANCE:{symbol}.P</span><div className="chart-timeframes">{Object.keys(intervals).map((frame) => <button key={frame} className={timeframe === frame ? 'tool-active' : ''} onClick={() => onTimeframeChange(frame)}>{frame}</button>)}</div><button className={drawingMode ? 'tool-active' : ''} onClick={() => setDrawingMode((active) => !active)} title="Trend line"><TrendingUp size={15} /></button><button className={!drawingMode ? 'tool-active' : ''} onClick={() => setDrawingMode(false)} title="Cursor"><Crosshair size={15} /></button><button onClick={() => setLine(null)} title="Clear drawing"><Trash2 size={14} /></button><span className="chart-live"><i /> Live</span></div><div ref={chartContainer} className="local-chart" /><div className={`drawing-layer ${drawingMode ? 'draw-enabled' : ''}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopDrawing} onPointerLeave={stopDrawing}>{line && <svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} /></svg>}</div></div>
}

function App() {
  const [marketData, setMarketData] = useState(fallbackMarkets)
  const [selected, setSelected] = useState('BTCUSDT')
  const [query, setQuery] = useState('')
  const timeframe = '4H'

  useEffect(() => {
    const loadMarkets = async () => {
      try {
        const [infoResponse, tickerResponse] = await Promise.all([fetch('https://fapi.binance.com/fapi/v1/exchangeInfo'), fetch('https://fapi.binance.com/fapi/v1/ticker/24hr')])
        if (!infoResponse.ok || !tickerResponse.ok) return
        const info = await infoResponse.json() as { symbols: { symbol: string; baseAsset: string; quoteAsset: string; contractType: string; status: string }[] }
        const tickers = await tickerResponse.json() as { symbol: string; lastPrice: string; priceChangePercent: string }[]
        const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]))
        const liveMarkets = info.symbols.filter((item) => item.quoteAsset === 'USDT' && item.contractType === 'PERPETUAL' && item.status === 'TRADING').map((item) => {
          const ticker = tickerMap.get(item.symbol)
          return { symbol: item.symbol, name: item.baseAsset, price: Number(ticker?.lastPrice ?? 0).toLocaleString('en-US', { maximumFractionDigits: 8 }), change: Number(ticker?.priceChangePercent ?? 0), favorite: item.symbol === 'BTCUSDT' || item.symbol === 'ETHUSDT' }
        })
        if (liveMarkets.length) setMarketData(liveMarkets)
      } catch { /* Public API is optional; fallback data keeps the scanner available. */ }
    }
    void loadMarkets()
  }, [])

  useEffect(() => {
    const socket = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr')
    socket.onmessage = (event) => {
      const tickers = JSON.parse(event.data) as { s: string; c: string; P: string }[]
      const livePrices = new Map(tickers.map((ticker) => [ticker.s, ticker]))
      setMarketData((current) => current.map((market) => {
        const ticker = livePrices.get(market.symbol)
        if (!ticker) return market
        const previousPrice = Number(market.price.replace(/,/g, ''))
        const nextPrice = Number(ticker.c)
        return { ...market, price: nextPrice.toLocaleString('en-US', { maximumFractionDigits: 8 }), change: Number(ticker.P), direction: nextPrice >= previousPrice ? 'up' : 'down', pulse: Date.now() }
      }))
    }
    return () => socket.close()
  }, [])

  const filteredMarkets = useMemo(() => marketData.filter((market) => `${market.symbol} ${market.name}`.toLowerCase().includes(query.toLowerCase())).sort((first, second) => Number(second.favorite) - Number(first.favorite)), [marketData, query])
  const chartUrl = `https://www.tradingview.com/widgetembed/?symbol=BINANCE%3A${selected}.P&interval=${intervals[timeframe]}&hidetoptoolbar=0&hide_side_toolbar=0&allow_symbol_change=0&theme=dark&style=1&locale=ru&withdateranges=1&hideideas=1&saveimage=1&studies=[]`
  const toggleFavorite = (symbol: string) => setMarketData((current) => current.map((market) => market.symbol === symbol ? { ...market, favorite: !market.favorite } : market))

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.code !== 'Space' || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      event.preventDefault()
      const currentIndex = filteredMarkets.findIndex((market) => market.symbol === selected)
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % filteredMarkets.length : 0
      if (filteredMarkets.length) setSelected(filteredMarkets[nextIndex].symbol)
    }
    window.addEventListener('keydown', handleSpace)
    return () => window.removeEventListener('keydown', handleSpace)
  }, [filteredMarkets, selected])

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="sidebar">
          <div className="side-title"><h1>Futures</h1></div>
          <div className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol..." /><kbd>/</kbd></div>
          <div className="filters"><span>ALL {marketData.length}</span><button><Filter size={13} /> Filters</button></div>
          <div className="market-list">
            {filteredMarkets.map((market) => <button key={market.symbol} className={`market-row ${selected === market.symbol ? 'selected' : ''}`} onClick={() => setSelected(market.symbol)}><span className={`coin-icon coin-${market.symbol.slice(0, 3)}`}>{market.symbol.slice(0, 1)}</span><span className="market-name"><strong>{market.symbol}</strong><small>{market.name}</small></span><span className="market-data"><strong key={market.pulse} className={`price-${market.direction ?? 'up'}`}>{market.price}</strong><small className={market.change >= 0 ? 'positive' : 'negative'}>{market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%</small></span><span className={`favorite-button ${market.favorite ? 'is-favorite' : ''}`} role="button" aria-label={`${market.favorite ? 'Remove' : 'Add'} ${market.symbol} ${market.favorite ? 'from' : 'to'} favorites`} onClick={(event) => { event.stopPropagation(); toggleFavorite(market.symbol) }}><Star size={12} fill={market.favorite ? 'currentColor' : 'none'} /></span></button>)}
          </div>
        </aside>
        <section className="content">
          <div className="chart-panel tradingview-panel"><iframe key={chartUrl} title="TradingView chart" src={chartUrl} allow="fullscreen" /></div>
        </section>
      </section>
    </main>
  )
}

export default App
