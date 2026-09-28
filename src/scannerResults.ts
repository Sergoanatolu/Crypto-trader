export function selectScannerRows<T extends { distance: number; strength: number | null; at: number; outdated?: boolean }>(rows: T[], distance: number, strength: number, order: 'distance' | 'strength', now: number) {
  return rows.filter((row) => row.distance <= distance && (strength === 0 || (row.strength !== null && row.strength >= strength))).sort((a, b) => {
    const staleA = Boolean(a.outdated) || now - a.at > 600000
    const staleB = Boolean(b.outdated) || now - b.at > 600000
    return Number(staleA) - Number(staleB) || (order === 'strength' ? (b.strength ?? -1) - (a.strength ?? -1) : a.distance - b.distance) || a.distance - b.distance
  })
}
