import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { selectScannerRows } from '../src/scannerResults.ts'

test('strength filter excludes unknown scores and distance filter is inclusive', () => {
  const rows = [{ distance: 1, strength: 60, at: 100 }, { distance: 0.1, strength: null, at: 100 }, { distance: 2, strength: 90, at: 100 }]
  assert.deepEqual(selectScannerRows(rows, 1, 60, 'distance', 100), [rows[0]])
  assert.equal(selectScannerRows(rows, 1, 0, 'distance', 100).length, 2)
})

test('fresh rows outrank stale ones even when stale results are stronger or closer', () => {
  const rows = [{ distance: 0.1, strength: 90, at: 1 }, { distance: 0.5, strength: 60, at: 700000 }, { distance: 0.2, strength: 80, at: 700000, outdated: true }]
  assert.equal(selectScannerRows(rows, 1, 0, 'strength', 700000)[0], rows[1])
  assert.equal(selectScannerRows(rows, 1, 0, 'distance', 700000)[0], rows[1])
  assert.equal(rows[0].strength, 90)
})

test('sort choice changes ordering without mutating input', () => {
  const rows = [{ distance: 0.1, strength: 40, at: 100 }, { distance: 0.5, strength: 80, at: 100 }]
  assert.equal(selectScannerRows(rows, 1, 0, 'distance', 100)[0], rows[0])
  assert.equal(selectScannerRows(rows, 1, 0, 'strength', 100)[0], rows[1])
  assert.equal(rows[0].strength, 40)
})
