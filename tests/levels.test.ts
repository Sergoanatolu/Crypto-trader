import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { dayStart, findLevels, kyivDay, nearestApproachLevel } from '../src/levels.ts'

test('insufficient and flat history produces no levels', () => {
  assert.deepEqual(findLevels([]), [])
  assert.deepEqual(findLevels(Array.from({ length: 100 }, (_, i) => ({ time: i, open: 10, close: 10, high: 10, low: 10, volume: 1 }))), [])
})

test('merge similar peaks and exclude unconfirmed trailing spikes', () => {
  const bars = Array.from({ length: 150 }, (_, i) => ({ time: i, open: 100, close: 100, high: 101, low: 99, volume: 1 }))
  bars[30].high = 120
  bars[70].high = 120.1
  bars[100].low = 80
  bars[145].high = 150
  const levels = findLevels(bars)
  assert.equal(levels.filter((level) => level.kind === 'high').length, 1)
  assert.equal(levels.filter((level) => level.kind === 'low').length, 1)
  assert.equal(levels.some((level) => level.time === 145), false)
})

test('Kyiv midnight in summer, winter and DST transition days', () => {
  for (const [now, expected] of [
    ['2026-09-18T12:00:00Z', '2026-09-17T21:00:00Z'],
    ['2026-01-18T12:00:00Z', '2026-01-17T22:00:00Z'],
    ['2026-03-29T12:00:00Z', '2026-03-28T22:00:00Z'],
    ['2026-10-25T12:00:00Z', '2026-10-24T21:00:00Z'],
  ]) {
    assert.equal(dayStart(new Date(now)), Date.parse(expected))
    assert.notEqual(kyivDay(new Date(Date.parse(expected) - 1)), kyivDay(new Date(now)))
  }
})

test('repeated peaks form one resistance at the outer edge of their zone', () => {
  const bars = Array.from({ length: 180 }, (_, i) => ({ time: i, open: 100, close: 100, high: 101, low: 99, volume: 1 }))
  bars[30].high = 120
  bars[75].high = 120.2
  bars[120].high = 119.9
  const resistance = findLevels(bars).find((level) => level.kind === 'high')!
  assert.equal(resistance.pivotCount, 3)
  assert.equal(resistance.price, 120.2)
  assert.equal(resistance.zoneLow, 119.9)
  const mirrored = bars.map((bar) => ({ ...bar, open: 200 - bar.open, close: 200 - bar.close, high: 200 - bar.low, low: 200 - bar.high }))
  const support = findLevels(mirrored).find((level) => level.kind === 'low')!
  assert.equal(support.pivotCount, 3)
  assert.ok(Math.abs(support.price - 79.8) < 1e-10)
})

test('a flat plateau is not multiple independent rejections', () => {
  const bars = Array.from({ length: 120 }, (_, i) => ({ time: i, open: 100, close: 100, high: 101, low: 99, volume: 1 }))
  for (let i = 40; i < 48; i++) bars[i].high = 120
  assert.equal(findLevels(bars).find((level) => level.kind === 'high')?.pivotCount, 1)
})

test('approach selection skips nearer single peaks and already crossed resistance', () => {
  const levels = [
    { time: 1, price: 101, kind: 'high' as const, score: 4, pivotCount: 1 },
    { time: 2, price: 102, kind: 'high' as const, score: 4, pivotCount: 3, zoneLow: 101.8 },
  ]
  assert.equal(nearestApproachLevel(levels, 100, true), levels[1])
  assert.equal(nearestApproachLevel(levels, 100, false), levels[0])
  assert.equal(nearestApproachLevel(levels, 103, true), undefined)
})
