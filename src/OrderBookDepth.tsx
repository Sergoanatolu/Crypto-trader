import { useEffect, useState } from 'react'
import { summarizeDepth } from './orderBook'
import type { DepthSide } from './orderBook'
import { formatPrice } from './prices'

const quantityFormat = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 8 })
const moneyFormat = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 })

export function OrderBookDepth({ symbol }: { symbol: string }) {
  const [snapshot, setSnapshot] = useState<(ReturnType<typeof summarizeDepth> & { receivedAt: number }) | null>(null)
  const [error, setError] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const load = async () => {
      let delay = 5000
      try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=1000`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
          cache: 'no-store',
        })
        if (!response.ok) {
          const retryAfter = Number(response.headers.get('Retry-After'))
          delay = Math.max(30000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)
          throw new Error('Order book unavailable')
        }
        const depth = summarizeDepth(await response.json())
        if (!stopped) { setSnapshot({ ...depth, receivedAt: Date.now() }); setError(false); setNow(Date.now()) }
      } catch {
        delay = Math.max(delay, 30000)
        if (!stopped) { setError(true); setSnapshot(null) }
      } finally {
        if (!stopped) timer = setTimeout(() => { void load() }, delay)
      }
    }
    void load()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { stopped = true; controller.abort(); clearTimeout(timer); clearInterval(clock) }
  }, [symbol])

  const age = snapshot ? Math.max(0, Math.floor((now - snapshot.receivedAt) / 1000)) : 0
  const current = snapshot && age < 15 ? snapshot : null
  const unit = symbol.replace(/USDT$/, '')
  const row = (side: DepthSide, direction: 'buy' | 'sell') => <div className={`depth-row depth-${direction}`}>
    <div><strong>{direction === 'buy' ? 'Купити · +1%' : 'Продати · −1%'}</strong><small>Ціль {formatPrice(side.target)}</small></div>
    <div className="depth-values"><strong>{side.complete ? '' : '≥ '}{quantityFormat.format(side.quantity)} {unit}</strong><small>{side.complete ? '≈ ' : '≥ '}{moneyFormat.format(side.notional)} USDT</small></div>
    {!side.complete && <span className="depth-incomplete">Неповна глибина — стакан не охоплює 1%</span>}
  </div>

  return <aside className="order-book-depth" aria-label="Оцінка ринкового виконання до одного відсотка">
    <button className="depth-heading" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
      <strong>Виконання до ±1% · {unit}</strong><span>{collapsed ? '+' : '−'}</span>
    </button>
    {!collapsed && <div className="depth-body">
      {current ? <>{row(current.buy, 'buy')}{row(current.sell, 'sell')}
        <p>Від середини спреду: {formatPrice(current.midpoint)} · {age} с тому</p>
      </> : <p role="status">{error ? 'Стакан недоступний. Повторюємо запит…' : snapshot ? 'Дані застаріли. Оновлюємо…' : 'Завантаження стакана…'}</p>}
      <p className="depth-note">Оцінка за стаканом. Рух свічки на 1% не гарантований.</p>
      <details><summary>Як рахується</summary><p>Сума зустрічних заявок для ринкового виконання, включно з повним першим рівнем на межі ±1% або за нею. Це консервативна оцінка, не мінімальний розмір ордера. Ціль — ціна останнього виконання, не середня ціна угоди. Відлік від середини спреду. USDT — сума ціни × кількості, без комісій. Лімітна заявка може не виконатися. Час виконання невідомий; стакан змінюється, приховані та RPI-заявки не враховані.</p><a href="https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Order-Book" target="_blank" rel="noreferrer">Binance Futures · оновлення кожні 5 с</a></details>
    </div>}
  </aside>
}
