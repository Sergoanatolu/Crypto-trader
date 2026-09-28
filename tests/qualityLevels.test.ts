import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { selectQualityLevels } from '../src/qualityLevels.ts'
import type { LevelAnalysis } from '../src/levelAnalysis.ts'

const item = (price: number, kind: 'high' | 'low' = 'high', strength = 60, pivots = 3): LevelAnalysis => ({ level: { price, kind, time: price, score: 4, pivotCount: pivots }, atr: 2, zone: 0.5, matchingFrames: [], strength, tests: 3, rebounds: 3, averageBounce: 2, relativeVolume: 1, pressure: 'Низький', reasons: [], state: 'Рівень утримується' })

test('quality filter caps each side and removes near duplicates', () => {
  const result = selectQualityLevels([item(110), item(110.5), item(120), item(130), item(90, 'low'), item(80, 'low'), item(70, 'low')])
  assert.deepEqual(result.map((entry) => entry.level.price), [110, 120, 90, 80])
})

test('weak, single-pivot and broken levels are excluded without fallback', () => {
  assert.deepEqual(selectQualityLevels([item(110, 'high', 39), item(120, 'high', 80, 1), { ...item(130), state: 'Закріплення за рівнем' }]), [])
})

test('better repeated level wins over a nearby duplicate', () => {
  const result = selectQualityLevels([item(110, 'high', 60, 2), item(110.5, 'high', 80, 4)])
  assert.equal(result[0].level.price, 110.5)
  assert.equal(result.length, 1)
})
