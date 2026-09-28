import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { alertTransitions, checklist, distancePercent, selectReboundSetup } from '../src/breakout.ts'
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

test('scan checks all levels and requires actual rebounds rather than touches or pivot count', () => {
  const base = analyzeLevel({ time: 0, price: 100, kind: 'high', score: 3 }, [])
  const near = { ...base, level: { ...base.level, price: 101, pivotCount: 5 }, state: 'Рівень утримується', tests: 8, rebounds: 2 }
  const valid = { ...near, level: { ...near.level, price: 102 }, rebounds: 3 }
  assert.equal(selectReboundSetup([near, valid], 100), valid)
  assert.equal(selectReboundSetup([near], 100), undefined)
  assert.equal(selectReboundSetup([valid], 103), undefined)
  assert.equal(selectReboundSetup([near, valid], 100, false), near)
  assert.equal(checklist(near, [], 1.5)[1].passed, false)
  assert.equal(checklist(valid, [], 1.5)[1].passed, true)
})
