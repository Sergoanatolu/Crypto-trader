import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeDepth } from '../src/orderBook.ts'

test('sums each side within 1%, including the boundary, at each level price', () => {
  const depth = summarizeDepth({
    bids: [['98', '100'], ['99.5', '2'], ['99', '3']],
    asks: [['102', '100'], ['101', '7'], ['100.5', '5']],
  })
  assert.equal(depth.midpoint, 100)
  assert.deepEqual(depth.buy, { target: 101, quantity: 12, notional: 1209.5, complete: true })
  assert.deepEqual(depth.sell, { target: 99, quantity: 5, notional: 496, complete: true })
})

test('marks truncated sides separately instead of claiming full 1% coverage', () => {
  const depth = summarizeDepth({ bids: [['99.5', '2'], ['98', '3']], asks: [['100.5', '5']] })
  assert.equal(depth.buy.complete, false)
  assert.equal(depth.buy.quantity, 5)
  assert.equal(depth.sell.complete, true)
})

test('includes first executable level beyond the target even across a wide spread', () => {
  const depth = summarizeDepth({ bids: [['98', '3']], asks: [['102', '5']] })
  assert.equal(depth.buy.quantity, 5)
  assert.equal(depth.sell.quantity, 3)
  assert.equal(depth.buy.complete, true)
})

test('includes the crossing level but excludes all later levels', () => {
  const depth = summarizeDepth({ bids: [['99.5', '2'], ['98.5', '3'], ['98', '50']], asks: [['100.5', '4'], ['101.5', '5'], ['102', '60']] })
  assert.equal(depth.buy.quantity, 9)
  assert.equal(depth.buy.notional, 909.5)
  assert.equal(depth.sell.quantity, 5)
  assert.equal(depth.sell.notional, 494.5)
})

test('rejects empty, malformed, negative and crossed books', () => {
  for (const value of [null, {}, { bids: [], asks: [] },
    { bids: [['99', '-2']], asks: [['101', '1']] },
    { bids: [['bad', '2']], asks: [['101', '1']] },
    { bids: [['102', '2']], asks: [['101', '1']] }]) {
    assert.throws(() => summarizeDepth(value))
  }
})
