import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { findStructureLevels } from '../src/structureLevels.ts'
import type { Bar } from '../src/levels.ts'

function candles(turns: number[]): Bar[] {
  return turns.slice(1).flatMap((end, segment) => Array.from({ length: 60 }, (_, index) => {
    const price = turns[segment] + (end - turns[segment]) * index / 60
    return { time: 1700000000 + (segment * 60 + index) * 300, open: price, close: price, high: price + 0.1, low: price - 0.1, volume: 1 }
  }))
}

test('repeated outer swings merge into rays anchored to actual wicks', () => {
  const bars = candles([100, 120, 90, 120, 90, 105])
  const levels = findStructureLevels(bars)
  assert.equal(levels.length, 2)
  assert.equal(levels.find((level) => level.kind === 'high')?.price, 120.1)
  assert.equal(levels.find((level) => level.kind === 'low')?.price, 89.9)
  assert.ok(levels.every((level) => level.pivotCount === 2))
  assert.ok(levels.every((level) => bars.some((bar) => bar.time === level.time && bar[level.kind] === level.price)))
})

test('a strong single swing is eligible; a subsequently broken swing is excluded', () => {
  const levels = findStructureLevels(candles([100, 110, 100, 130, 100, 105]))
  assert.ok(levels.some((level) => level.price === 130.1))
  assert.ok(!levels.some((level) => level.price === 110.1))
  assert.ok(levels.length <= 4)
})

test('small inner fluctuations do not add levels and insufficient history stays empty', () => {
  const levels = findStructureLevels(candles([100, 120, 90, 105, 104, 105, 104, 105]))
  assert.ok(levels.every((level) => level.price > 119 || level.price < 91))
  assert.deepEqual(findStructureLevels([]), [])
})
