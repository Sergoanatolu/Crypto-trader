import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { dayStart, findLevels, kyivDay } from '../src/levels.ts'

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
