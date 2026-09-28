import { useState } from 'react'
import type { LevelAnalysis } from './levelAnalysis'
import { formatPrice } from './prices'

export function LevelInsights({ items, frame, pending, unavailableFrames, updatedAt, error }: { items: LevelAnalysis[]; frame: string; pending: boolean; unavailableFrames: string[]; updatedAt: number | null; error: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  return <aside className="level-insights" aria-label="Аналіз сили рівнів">
    <button className="depth-heading" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}><strong>Сила рівнів · {frame}</strong><span>{collapsed ? '+' : '−'}</span></button>
    {!collapsed && <div className="insights-body">
      <p>За закритими свічками{updatedAt ? ` · ${new Date(updatedAt * 1000).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })} Київ` : ''}</p>
      {pending && <p role="status">Завантаження рівнів…</p>}
      {error && <p role="status">Аналіз недоступний: не вдалося завантажити свічки.</p>}
      {!pending && !error && !items.length && <p>Немає підтверджених рівнів для оцінки.</p>}
      {items.map((item) => <article className="level-card" key={`${item.level.kind}-${item.level.time}`}>
        <div className="level-card-title"><strong className={item.level.kind === 'high' ? 'level-high' : 'level-low'}>{item.level.kind === 'high' ? 'Опір' : 'Підтримка'} · {formatPrice(item.level.price)}</strong><b>{item.strength === null ? '—' : `${item.strength}/100`}</b></div>
        <meter min={0} max={100} value={item.strength ?? 0} aria-label="Сила рівня" />
        <p>{item.tests} тестів · {item.rebounds} відбоїв · середній відскок {item.averageBounce === null ? '—' : `${item.averageBounce.toFixed(1)} ATR`}</p>
        <p>Збіг: {item.matchingFrames.join(' / ') || 'не виявлено'} · Обсяг {item.relativeVolume === null ? '—' : `×${item.relativeVolume.toFixed(2)}`}</p>
        <p>{item.state}</p>
        <strong className={item.pressure === 'Високий' ? 'pressure-high' : ''}>Тиск на пробій: {item.pressure ?? '—'}</strong>
        <p>{item.reasons.join(' · ')}</p>
      </article>)}
      <p className="insights-note">Ймовірність пробою: ще не відкалібрована. Бали сили не є відсотком імовірності.</p>
      {unavailableFrames.length > 0 && <p>Збіг таймфреймів: недоступні {unavailableFrames.join(', ')}. Оцінка може бути занижена.</p>}
      <details><summary>Як рахуємо</summary><p>Зона рівня ±0,25 ATR. ATR — середній істинний діапазон останніх 21 закритих свічок. Новий тест рахується після відходу закриття на 1 ATR; відбій — відхід на 1 ATR у початковий бік. Розмір відскоку — найбільша відстань закриття до наступного тесту або поточного моменту.</p><p>Сила: до 25 балів за вираженість екстремуму, 30 за кількість відбоїв, 30 за їх середній розмір, 15 за збіги з вищими 1H / 4H / 1D. Це початкова евристика. Обсяг порівнюємо з попередніми 20 свічками. Закріплення — два закриття поспіль за рівнем далі ніж 0,3 ATR. Аналіз оновлюється після закриття свічки; ліквідність стакана до оцінки не входить.</p></details>
    </div>}
  </aside>
}
