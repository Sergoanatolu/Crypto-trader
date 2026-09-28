import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { decodeFavorites, decodeShapes } from '../src/savedChartState.ts'

test('favorites retain added symbols and explicitly removing all defaults', () => {
  assert.deepEqual(decodeFavorites(JSON.parse(JSON.stringify(['SOLUSDT']))), ['SOLUSDT'])
  assert.deepEqual(decodeFavorites([]), [])
  assert.deepEqual(decodeFavorites(['SOLUSDT', null, 'SOLUSDT']), ['SOLUSDT'])
})

test('drawings retain time, price and style through a storage round trip', () => {
  const shapes = ['horizontal', 'trend', 'rectangle', 'brush'].map((tool) => ({
    id: tool, tool, points: [{ time: 1700000000.5, price: 65000.25 }, { time: 1700000300, price: 66000 }], color: '#22c9e6', width: 2,
  }))
  assert.deepEqual(decodeShapes(JSON.parse(JSON.stringify(shapes))), shapes)
  assert.deepEqual(decodeShapes([]), [])
  assert.deepEqual(decodeShapes([null, {}, { ...shapes[0], points: [null] }, shapes[1]]), [shapes[1]])
})
