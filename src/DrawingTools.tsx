import { useEffect, useRef, useState } from 'react'
import { Crosshair, TrendingUp, Minus, Square, Pencil, Undo2, Trash2, Eye, EyeOff } from 'lucide-react'
import type { IChartApi, ISeriesApi, Logical, UTCTimestamp } from 'lightweight-charts'

type Tool = 'cursor' | 'trend' | 'horizontal' | 'rectangle' | 'brush'
type Point = { time: number; price: number }
type Shape = { id: string; tool: Exclude<Tool, 'cursor'>; points: Point[]; color: string; width: number }
export type DrawingChart = { chart: IChartApi; candles: ISeriesApi<'Candlestick'>; duration: number }
const tools = [
  { id: 'cursor', label: 'Курсор / вибір', icon: Crosshair },
  { id: 'trend', label: 'Трендова лінія', icon: TrendingUp },
  { id: 'horizontal', label: 'Горизонтальний рівень', icon: Minus },
  { id: 'rectangle', label: 'Прямокутник', icon: Square },
  { id: 'brush', label: 'Пензель', icon: Pencil },
] as const

export function DrawingTools({ api, storageKey }: { api: DrawingChart; storageKey: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('cursor')
  const [color, setColor] = useState('#22c9e6')
  const [width, setWidth] = useState(2)
  const [hidden, setHidden] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [shapes, setShapes] = useState<Shape[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      return Array.isArray(saved) ? saved.filter((s) => typeof s.id === 'string' && ['trend', 'horizontal', 'rectangle', 'brush'].includes(s.tool) && typeof s.color === 'string' && [1, 2, 3, 4].includes(s.width) && Array.isArray(s.points) && s.points.length > 0 && s.points.every((p: Point) => Number.isFinite(p.time) && Number.isFinite(p.price))) : []
    } catch { return [] }
  })
  const draft = useRef<Shape | null>(null)
  const snapshot = useRef({ shapes, hidden, selected })
  useEffect(() => { snapshot.current = { shapes, hidden, selected } }, [shapes, hidden, selected])
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    let cancelled = false
    let failed = false
    try { localStorage.setItem(storageKey, JSON.stringify(shapes)) } catch { failed = true }
    queueMicrotask(() => { if (!cancelled) setStorageError(failed) })
    return () => { cancelled = true }
  }, [shapes, storageKey])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input,textarea,select')) return
      if (event.key === 'Escape') { draft.current = null; setTool('cursor'); setSelected(null) }
      if (event.key === 'Delete' && snapshot.current.selected) setShapes((all) => all.filter((s) => s.id !== snapshot.current.selected))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const ctx = element.getContext('2d')!
    let animation = 0
    let paths: { id: string; path: Path2D }[] = []
    const toScreen = (point: Point) => {
      const scale = api.chart.timeScale()
      const index = scale.timeToIndex(point.time as UTCTimestamp, true)
      if (index === null) return null
      const bar = api.candles.dataByIndex(index)
      if (!bar || typeof bar.time !== 'number') return null
      const x = scale.logicalToCoordinate((index + (point.time - bar.time) / api.duration) as Logical)
      const y = api.candles.priceToCoordinate(point.price)
      return x === null || y === null ? null : { x, y }
    }
    const render = () => {
      const w = api.chart.timeScale().width()
      const h = api.chart.panes()[0].getHeight()
      const dpr = window.devicePixelRatio || 1
      if (element.width !== Math.round(w * dpr) || element.height !== Math.round(h * dpr)) {
        element.width = Math.round(w * dpr); element.height = Math.round(h * dpr)
        element.style.width = `${w}px`; element.style.height = `${h}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      paths = []
      const state = snapshot.current
      const all = state.hidden ? [] : [...state.shapes, ...(draft.current ? [draft.current] : [])]
      for (const shape of all) {
        const points = shape.points.map(toScreen)
        if (points.some((p) => !p)) continue
        const first = points[0]!
        const last = points[points.length - 1]!
        const path = new Path2D()
        if (shape.tool === 'horizontal') { path.moveTo(0, first.y); path.lineTo(w, first.y) }
        else if (shape.tool === 'rectangle') path.rect(first.x, first.y, last.x - first.x, last.y - first.y)
        else { path.moveTo(first.x, first.y); points.slice(1).forEach((p) => path.lineTo(p!.x, p!.y)) }
        ctx.strokeStyle = shape.color; ctx.lineWidth = shape.width; ctx.setLineDash([])
        if (shape.tool === 'rectangle') { ctx.fillStyle = shape.color + '18'; ctx.fill(path) }
        ctx.stroke(path)
        paths.push({ id: shape.id, path })
        if (state.selected === shape.id) {
          for (const point of [first, last]) { ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#111313'; ctx.fill(); ctx.stroke() }
        }
      }
      animation = requestAnimationFrame(render)
    }
    const click: Parameters<IChartApi['subscribeClick']>[0] = (event) => {
      if (!event.point || snapshot.current.hidden) return
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = 12
      const found = [...paths].reverse().find(({ path }) => ctx.isPointInStroke(path, event.point!.x, event.point!.y))
      ctx.restore(); setSelected(found?.id ?? null)
    }
    api.chart.subscribeClick(click)
    render()
    return () => { cancelAnimationFrame(animation); api.chart.unsubscribeClick(click) }
  }, [api])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const rect = event.currentTarget.getBoundingClientRect()
    const index = api.chart.timeScale().coordinateToLogical(event.clientX - rect.left)
    const price = api.candles.coordinateToPrice(event.clientY - rect.top)
    if (index === null || price === null) return null
    const data = api.candles.data()
    if (!data.length) return null
    const clamped = Math.max(0, Math.min(data.length - 1, Math.floor(index)))
    const bar = data[clamped]
    if (typeof bar.time !== 'number') return null
    return { time: bar.time + (index - clamped) * api.duration, price }
  }
  const finish = () => {
    const shape = draft.current
    if (shape && (shape.tool === 'horizontal' || shape.points.length > 1)) {
      setShapes((all) => [...all, shape]); setSelected(shape.id)
    }
    draft.current = null
  }
  return <>
    <aside className="drawing-toolbar" aria-label="Інструменти малювання">
      {tools.map(({ id, label, icon: Icon }) => <button key={id} title={label} aria-label={label} aria-pressed={tool === id} className={tool === id ? 'active' : ''} onClick={() => { draft.current = null; setTool(id); setHidden(false) }}><Icon size={21} /></button>)}
      <div className="drawing-divider" />
      <input aria-label="Колір малюнка" title="Колір малюнка" type="color" value={color} onChange={(event) => { setColor(event.target.value); setShapes((all) => all.map((s) => s.id === selected ? { ...s, color: event.target.value } : s)) }} />
      <select aria-label="Товщина лінії" title="Товщина лінії" value={width} onChange={(event) => { const value = Number(event.target.value); setWidth(value); setShapes((all) => all.map((s) => s.id === selected ? { ...s, width: value } : s)) }}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}px</option>)}</select>
      <div className="drawing-divider" />
      <button title="Прибрати останній малюнок" aria-label="Прибрати останній малюнок" disabled={!shapes.length} onClick={() => setShapes((all) => all.slice(0, -1))}><Undo2 size={20} /></button>
      <button title={hidden ? 'Показати малюнки' : 'Сховати малюнки'} aria-label="Видимість малюнків" aria-pressed={hidden} onClick={() => { setHidden((value) => !value); setTool('cursor'); draft.current = null }}>{hidden ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      <button title="Видалити вибраний малюнок" aria-label="Видалити вибраний малюнок" disabled={!shapes.some((s) => s.id === selected)} onClick={() => { setShapes((all) => all.filter((s) => s.id !== selected)); setSelected(null) }}><Trash2 size={20} /></button>
    </aside>
    {(tool !== 'cursor' || storageError) && <div className="drawing-hint">{storageError ? 'Сховище недоступне — малюнки не збережено' : tool === 'horizontal' ? 'Натисни на графіку · Esc — курсор' : 'Затисни й потягни для малювання · Esc — курсор'}</div>}
    <canvas ref={canvas} className="manual-drawing-canvas" style={{ pointerEvents: tool === 'cursor' ? 'none' : 'auto' }} onPointerDown={(event) => {
      if (event.button !== 0 || tool === 'cursor') return
      const point = pointFromEvent(event)
      if (!point) return
      event.currentTarget.setPointerCapture(event.pointerId)
      draft.current = { id: crypto.randomUUID(), tool, points: [point], color, width }
    }} onPointerMove={(event) => {
      const shape = draft.current
      if (!shape || shape.tool === 'horizontal') return
      const point = pointFromEvent(event)
      if (point) shape.points = shape.tool === 'brush' ? [...shape.points, point] : [shape.points[0], point]
    }} onPointerUp={finish} onPointerCancel={() => { draft.current = null }} />
  </>
}
