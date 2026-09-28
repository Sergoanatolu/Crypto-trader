import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { analyzeLevel } from '../src/levelAnalysis.ts'
import type { Bar, Level } from '../src/levels.ts'

const level: Level = { time: 21, price: 100, kind: 'high', score: 4 }
const bar = (time: number, close: number, high = close + 0.5, low = close - 0.5, volume = 10): Bar => ({ time, open: close, high, low, close, volume })
const history = () => Array.from({ length: 21 }, (_, i) => bar(i, 98))

test('adjacent touches are one test; a fresh approach after departure is another', () => {
  const bars = [...history(), bar(21, 99.8, 100), bar(22, 99.8, 100), bar(23, 99.8, 100), bar(24, 97), bar(25, 99.8, 100), bar(26, 97)]
  const result = analyzeLevel(level, bars)
  assert.equal(result.tests, 2)
  assert.equal(result.rebounds, 2)
  assert.ok(result.averageBounce! >= 1)
  assert.ok(result.strength! >= 0 && result.strength! <= 100)
})

test('support and resistance are symmetric', () => {
  const bars = [...history(), bar(21, 99.8, 100), bar(22, 97), bar(23, 99.8, 100)]
  const reflected = bars.map((b) => ({ ...b, open: 200 - b.open, close: 200 - b.close, high: 200 - b.low, low: 200 - b.high }))
  const high = analyzeLevel(level, bars)
  const low = analyzeLevel({ ...level, kind: 'low' }, reflected)
  assert.equal(high.strength, low.strength)
  assert.equal(high.tests, low.tests)
  assert.equal(high.pressure, low.pressure)
})

test('two closes beyond the zone show a break, not a pending breakout pressure', () => {
  const result = analyzeLevel(level, [...history(), bar(21, 101), bar(22, 102)])
  assert.equal(result.state, 'Закріплення за рівнем')
  assert.equal(result.pressure, null)
  assert.equal(result.rebounds, 0)
})

test('relative volume excludes the last candle and needs twenty baseline candles', () => {
  assert.equal(analyzeLevel(level, [...history(), bar(21, 99, 99.5, 98.5, 20)]).relativeVolume, 2)
  assert.equal(analyzeLevel(level, [bar(21, 99)]).relativeVolume, null)
  assert.equal(analyzeLevel(level, history().map((b) => ({ ...b, volume: 0 }))).relativeVolume, null)
})

test('confluence requires the same kind and a nearby price', () => {
  const result = analyzeLevel(level, history(), [
    { frame: '1H', levels: [{ ...level, price: 100.1 }] },
    { frame: '4H', levels: [{ ...level, kind: 'low' }] },
    { frame: '1D', levels: [{ ...level, price: 110 }] },
  ])
  assert.deepEqual(result.matchingFrames, ['1H'])
})

test('a higher timeframe level does not count its own source as confluence', () => {
  const sourced = { ...level, sourceFrame: '1H' }
  const result = analyzeLevel(sourced, history(), [
    { frame: '1H', levels: [sourced] },
    { frame: '4H', levels: [{ ...level, sourceFrame: '4H', price: 100.1 }] },
  ])
  assert.deepEqual(result.matchingFrames, ['4H'])
  assert.equal(result.level.sourceFrame, '1H')
})

test('far away volume spikes do not create high breakout pressure', () => {
  const result = analyzeLevel(level, [...history(), bar(21, 90, 90.5, 89.5, 1000)])
  assert.equal(result.pressure, 'Низький')
})

test('empty or flat data does not invent scores', () => {
  assert.equal(analyzeLevel(level, []).strength, null)
  assert.equal(analyzeLevel(level, [bar(21, 100, 100, 100)]).pressure, null)
})

test('approaching closes near resistance with increased volume create high pressure', () => {
  const result = analyzeLevel(level, [...history(), bar(21, 98.5), bar(22, 99), bar(23, 99.3), bar(24, 99.7, 100.2, 99.2, 20)])
  assert.equal(result.pressure, 'Високий')
  assert.equal(result.relativeVolume, 2)
  assert.ok(result.reasons.length >= 3)
})
