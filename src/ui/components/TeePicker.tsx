import type { TeeSet } from '@/domain/whs/types'

interface TeePickerProps {
  tees: TeeSet[]
  selected: TeeSet | null
  onSelect: (tee: TeeSet) => void
}

const swatch = (color: string | null) => {
  const named: Record<string, string> = {
    black: '#1c1c1c',
    blue: '#3b82f6',
    white: '#e8e8e8',
    gold: '#d4a017',
    yellow: '#e6c327',
    green: '#3f9142',
    red: '#d1495b',
    silver: '#b8bcc0',
    orange: '#e07b39',
  }
  return named[(color ?? '').toLowerCase()] ?? 'var(--hairline-strong)'
}

export function TeePicker({ tees, selected, onSelect }: TeePickerProps) {
  if (tees.length === 0) {
    return (
      <p className="prose-note" style={{ color: 'var(--amber)' }}>
        No rated tees are on record for this course. A tee needs a Course Rating and Slope
        before it can produce a handicap score — enter them by hand to continue.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {tees.map((tee) => {
        const isSelected = selected?.key === tee.key
        return (
          <li key={tee.key}>
            <button
              type="button"
              onClick={() => onSelect(tee)}
              aria-pressed={isSelected}
              className="tap flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left"
              style={{
                borderColor: isSelected ? 'var(--signal)' : 'var(--hairline)',
                background: isSelected
                  ? 'color-mix(in oklab, var(--signal) 12%, var(--surface))'
                  : 'var(--surface)',
              }}
            >
              <span
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rounded-full border"
                style={{ background: swatch(tee.color), borderColor: 'var(--hairline-strong)' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block" style={{ fontVariationSettings: "'wght' 600" }}>
                  {tee.name}
                  {tee.gender !== 'unspecified' && (
                    <span className="label ml-2">{tee.gender}</span>
                  )}
                </span>
                <span className="label">
                  {tee.yardage ? `${tee.yardage} yds · ` : ''}par {tee.par}
                </span>
              </span>
              <span className="numeral shrink-0 text-right text-sm leading-tight">
                <span className="block">{tee.courseRating.toFixed(1)}</span>
                <span className="label">{tee.slope} slope</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
