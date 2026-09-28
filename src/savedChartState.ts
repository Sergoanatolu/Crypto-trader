export type Point = { time: number; price: number }
export type Shape = { id: string; tool: 'trend' | 'horizontal' | 'rectangle' | 'brush'; points: Point[]; color: string; width: number }

export const defaultFavorites = ['BTCUSDT', 'ETHUSDT']
export function decodeFavorites(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((symbol): symbol is string => typeof symbol === 'string' && /^[A-Z0-9]+USDT$/.test(symbol)))] : defaultFavorites
}

export function decodeShapes(value: unknown): Shape[] {
  if (!Array.isArray(value)) return []
  return value.filter((shape): shape is Shape => {
    if (!shape || typeof shape !== 'object') return false
    return typeof shape.id === 'string' && ['trend', 'horizontal', 'rectangle', 'brush'].includes(shape.tool)
      && typeof shape.color === 'string' && [1, 2, 3, 4].includes(shape.width)
      && Array.isArray(shape.points) && shape.points.length > 0
      && shape.points.every((point: unknown) => point !== null && typeof point === 'object'
        && 'time' in point && 'price' in point && Number.isFinite(point.time) && Number.isFinite(point.price))
  })
}
