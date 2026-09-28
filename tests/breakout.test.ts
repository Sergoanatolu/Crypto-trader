import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { alertTransitions, checklist, distancePercent } from '../src/breakout.ts'
import { analyzeLevel } from '../src/levelAnalysis.ts'

test('distance is symmetric around a level and expressed as percent', () => {
  assert.equal(distancePercent(100.5, 100), 0.5)
  assert.equal(distancePercent(99.5, 100), 0.5)
})

test('alerts initialize silently, deduplicate, and rearm after the condition clears', () => {
  assert.deepEqual(alertTransitions(undefined, ['near']), [])
  assert.deepEqual(alertTransitions(['near'], ['near']), [])
  assert.deepEqual(alertTransitions(['near'], ['near', 'break']), ['break'])
  assert.deepEqual(alertTransitions(['near'], []), [])
  assert.deepEqual(alertTransitions([], ['near']), ['near'])
})

test('missing confluence and volume data remain unknown rather than passing', () => {
  const item = analyzeLevel({ time: 0, price: 100, kind: 'high', score: 3 }, [])
  const checks = checklist(item, ['4H'], 1.5)
  assert.equal(checks[0].passed, null)
  assert.equal(checks[3].passed, null)
  assert.equal(checks.filter((entry) => entry.passed === true).length, 0)
})

test('volume checklist obeys the selected threshold', () => {
  const item = { ...analyzeLevel({ time: 0, price: 100, kind: 'high', score: 3 }, []), relativeVolume: 2 }
  assert.equal(checklist(item, [], 1.5)[3].passed, true)
  assert.equal(checklist(item, [], 3)[3].passed, false)
})
