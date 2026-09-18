import { useCallback, useEffect, useMemo, useState } from 'react'
import { Filter, Search, Star } from 'lucide-react'
import { AutoChart } from './AutoChart'
import { formatPrice } from './prices'
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
function App() {
  const [marketData, setMarketData] = useState(fallbackMarkets)
  const [selected, setSelected] = useState('BTCUSDT')
  const [query, setQuery] = useState('')
  const [chartQuote, setChartQuote] = useState<{ symbol: string; price: number; pulse: number; direction: 'up' | 'down' } | null>(null)
  const handleChartPrice = useCallback((symbol: string, price: number) => {
    setChartQuote((previous) => {
      if (previous?.symbol === symbol && previous.price === price) return previous
      return { symbol, price, pulse: Date.now(), direction: previous?.symbol === symbol && price < previous.price ? 'down' : 'up' }
    })
  }, [])

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

  const filteredMarkets = useMemo(() => marketData.map((market) => market.symbol === selected && chartQuote?.symbol === selected
    ? { ...market, price: formatPrice(chartQuote.price), pulse: chartQuote.pulse, direction: chartQuote.direction }
    : market).filter((market) => `${market.symbol} ${market.name}`.toLowerCase().includes(query.toLowerCase())).sort((first, second) => Number(second.favorite) - Number(first.favorite)), [marketData, query, selected, chartQuote])
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
          <div className="chart-panel tradingview-panel"><AutoChart symbol={selected} onPrice={handleChartPrice} /></div>
        </section>
      </section>
    </main>
  )
}

export default App
