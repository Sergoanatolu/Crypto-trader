import { useCallback, useRef, useState } from 'react'

// Mount a new component when the key changes. Save in the event handler so
// navigation/reloading cannot interrupt an outstanding persistence effect.
export function useSavedState<T>(key: string, fallback: T, decode: (value: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? fallback : decode(JSON.parse(saved))
    } catch { return fallback }
  })
  const current = useRef(value)
  const [storageError, setStorageError] = useState(false)
  const update = useCallback((change: T | ((previous: T) => T)) => {
    const next = typeof change === 'function' ? (change as (previous: T) => T)(current.current) : change
    current.current = next
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setStorageError(false)
    } catch { setStorageError(true) }
    setValue(next)
  }, [key])
  return [value, update, storageError] as const
}
