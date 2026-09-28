import type { LevelAnalysis } from './levelAnalysis'
import { formatPrice } from './prices'
import { checklist } from './breakout'

export function LevelInsights({ items, frame, pending, unavailableFrames, updatedAt, error, onClose, watched, onWatch, volumeThreshold, nearThreshold, onVolumeChange, onNearChange }: { items: LevelAnalysis[]; frame: string; pending: boolean; unavailableFrames: string[]; updatedAt: number | null; error: boolean; onClose: () => void; watched: boolean; onWatch: () => void; volumeThreshold: number; nearThreshold: number; onVolumeChange: (value: number) => void; onNearChange: (value: number) => void }) {
  return <aside className="level-insights" aria-label="Аналіз сили рівнів">
    <div className="depth-heading"><strong>Сила рівня · {frame}</strong><button className="insights-close" onClick={onClose} aria-label="Закрити аналіз рівня" title="Закрити (Esc)">×</button></div>
    <div className="insights-body">
      <p>За закритими свічками{updatedAt ? ` · ${new Date(updatedAt * 1000).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })} Київ` : ''}</p>
      {pending && <p role="status">Завантаження рівнів…</p>}
      {error && <p role="status">Аналіз недоступний: не вдалося завантажити свічки.</p>}
      {!pending && !error && !items.length && <p>Немає підтверджених рівнів для оцінки.</p>}
      {items.map((item) => <article className="level-card" key={`${item.level.sourceFrame}-${item.level.kind}-${item.level.time}`}>
        <div className="level-card-title"><strong className={item.level.kind === 'high' ? 'level-high' : 'level-low'}>{item.level.kind === 'high' ? 'Опір' : 'Підтримка'} · {formatPrice(item.level.price)} {item.level.sourceFrame && `· ${item.level.sourceFrame}`}</strong><b>{item.strength === null ? '—' : `${item.strength}/100`}</b></div>
        {item.level.sourceFrame && <p>Рівень {item.level.sourceFrame} · аналіз останніх 999 закритих свічок 5M. Збіг перевіряємо з 1H / 4H без власного ТФ. Рівні фіксуються на початок дня за Києвом.</p>}
        <meter min={0} max={100} value={item.strength ?? 0} aria-label="Сила рівня" />
        {item.level.pivotCount !== undefined && <p>Форма рівня: {item.level.pivotCount} окремих екстремумів на вихідному ТФ. Зона {formatPrice(item.level.zoneLow ?? item.level.price)}–{formatPrice(item.level.zoneHigh ?? item.level.price)}.</p>}
        <p>{item.tests} тестів · {item.rebounds} відбоїв · середній відскок {item.averageBounce === null ? '—' : `${item.averageBounce.toFixed(1)} ATR`}</p>
        <p>Збіг: {item.matchingFrames.join(' / ') || 'не виявлено'} · Обсяг {item.relativeVolume === null ? '—' : `×${item.relativeVolume.toFixed(2)}`}</p>
        <p>{item.state}</p>
        <strong className={item.pressure === 'Високий' ? 'pressure-high' : ''}>Тиск на пробій: {item.pressure ?? '—'}</strong>
        <p>{item.reasons.join(' · ')}</p>
        <div className="setup-checklist"><strong>Умови: {checklist(item, unavailableFrames, volumeThreshold).filter((entry) => entry.passed === true).length} із 4</strong>
          {checklist(item, unavailableFrames, volumeThreshold).map((entry) => <p key={entry.label}>{entry.passed === null ? '—' : entry.passed ? '✓' : '✗'} {entry.label}{entry.passed === null ? ' · немає даних' : ''}</p>)}
        </div>
        <label className="setup-setting">Обсяг у чеклісті<select value={volumeThreshold} onChange={(e) => onVolumeChange(Number(e.target.value))}>{[1, 1.5, 2, 3].map((v) => <option key={v} value={v}>×{v}</option>)}</select></label>
        <label className="setup-setting">Алерт наближення<select value={nearThreshold} onChange={(e) => onNearChange(Number(e.target.value))}>{[0.1, 0.25, 0.5, 1].map((v) => <option key={v} value={v}>{v}%</option>)}</select></label>
        <button className="watch-button" aria-pressed={watched} onClick={onWatch}>{watched ? 'Припинити стеження' : 'Стежити за рівнем'}</button>
        <p>Алерти: наближення, високий тиск, закриття та закріплення за рівнем. Лише для відкритого графіка. Пороги спільні для рівнів.</p>
      </article>)}
      <p className="insights-note">Ймовірність пробою: ще не відкалібрована. Бали сили не є відсотком імовірності.</p>
      {unavailableFrames.length > 0 && <p>Збіг таймфреймів: недоступні {unavailableFrames.join(', ')}. Оцінка може бути занижена.</p>}
      <details><summary>Як рахуємо</summary><p>Зона рівня ±0,25 ATR. ATR — середній істинний діапазон останніх 21 закритих свічок. Новий тест рахується після відходу закриття на 1 ATR; відбій — відхід на 1 ATR у початковий бік. Розмір відскоку — найбільша відстань закриття до наступного тесту або поточного моменту.</p><p>Сила: до 25 балів за вираженість екстремуму, 30 за кількість відбоїв, 30 за їх середній розмір, 15 за збіги з вищими 1H / 4H / 1D. Це початкова евристика. Обсяг порівнюємо з попередніми 20 свічками. Закріплення — два закриття поспіль за рівнем далі ніж 0,3 ATR. Аналіз оновлюється після закриття свічки; ліквідність стакана до оцінки не входить.</p></details>
    </div>
  </aside>
}
