type Level = { price: number; quantity: number }
export type DepthSide = { quantity: number; notional: number; target: number; complete: boolean }

function parseLevels(value: unknown, ascending: boolean): Level[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Empty order book')
  const levels = value.map((row: unknown) => {
    if (!Array.isArray(row) || row.length < 2) throw new Error('Invalid level')
    const price = Number(row[0])
    const quantity = Number(row[1])
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) throw new Error('Invalid level')
    return { price, quantity }
  })
  return levels.sort((a, b) => ascending ? a.price - b.price : b.price - a.price)
}

// Conservative sweep estimate: consume the first level reaching ±1% in full.
// This is not the minimum possible order size or a prediction of candle movement.
export function summarizeDepth(value: unknown) {
  if (!value || typeof value !== 'object' || !('bids' in value) || !('asks' in value)) throw new Error('Invalid order book')
  const bids = parseLevels(value.bids, false)
  const asks = parseLevels(value.asks, true)
  if (bids[0].price >= asks[0].price) throw new Error('Crossed order book')
  const midpoint = (bids[0].price + asks[0].price) / 2
  const summarize = (levels: Level[], target: number, ascending: boolean): DepthSide => {
    const crossingIndex = levels.findIndex(({ price }) => ascending ? price >= target : price <= target)
    const included = crossingIndex < 0 ? levels : levels.slice(0, crossingIndex + 1)
    return {
      target,
      quantity: included.reduce((sum, level) => sum + level.quantity, 0),
      notional: included.reduce((sum, level) => sum + level.price * level.quantity, 0),
      complete: crossingIndex >= 0,
    }
  }
  return { midpoint, buy: summarize(asks, midpoint * 1.01, true), sell: summarize(bids, midpoint * 0.99, false) }
}
