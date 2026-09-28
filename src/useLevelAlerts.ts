import { useRef, useState } from 'react'
import type { LevelAnalysis } from './levelAnalysis'
import { alertTransitions, distancePercent } from './breakout'
import { formatPrice } from './prices'

export const watchKey = (symbol: string, frame: string, item: LevelAnalysis) => `${symbol}-${frame}-${item.level.sourceFrame ?? frame}-${item.level.kind}-${item.level.time}`
export function useLevelAlerts() {
  const [watched, setWatched] = useState<string[]>([])
  const [events, setEvents] = useState<{ id: number; text: string }[]>([])
  const [near, setNear] = useState(0.5)
  const [volume, setVolume] = useState(1.5)
  const previous = useRef(new Map<string, string[]>())
  const scope = useRef('')
  const sequence = useRef(0)
  const toggle = (key: string) => {
    previous.current.delete(key)
    setWatched((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])
  }
  const evaluate = (symbol: string, frame: string, items: LevelAnalysis[], price: number) => {
    if (scope.current !== `${symbol}-${frame}`) {
      previous.current.clear()
      scope.current = `${symbol}-${frame}`
    }
    const added: { id: number; text: string }[] = []
    for (const item of items) {
      const key = watchKey(symbol, frame, item)
      if (!watched.includes(key)) continue
      const signals = [
        ...(distancePercent(price, item.level.price) <= near ? ['Ціна наблизилася до рівня'] : []),
        ...(item.pressure === 'Високий' ? ['Високий тиск на пробій'] : []),
        ...(item.state === 'Закриття за рівнем' || item.state === 'Закріплення за рівнем' ? [item.state] : []),
      ]
      for (const signal of alertTransitions(previous.current.get(key), signals)) added.push({ id: ++sequence.current, text: `${symbol} · ${frame} · ${formatPrice(item.level.price)}: ${signal}` })
      previous.current.set(key, signals)
    }
    if (added.length) setEvents((current) => [...added, ...current].slice(0, 30))
  }
  return { watched, events, near, volume, toggle, evaluate, setNear: (value: number) => { previous.current.clear(); setNear(value) }, setVolume, clear: () => setEvents([]) }
}
