import { useState } from 'react'
import { maxHoleScore } from '@/domain/whs/netDoubleBogey'
import { strokesReceived } from '@/domain/whs/strokes'
import type { HoleInfo, HoleScore } from '@/domain/whs/types'
import { Explain } from './Explain'

interface ScorecardProps {
  holes: HoleInfo[]
  scores: HoleScore[]
  courseHandicap: number | null
  onChange: (scores: HoleScore[]) => void
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

export function Scorecard({ holes, scores, courseHandicap, onChange }: ScorecardProps) {
  const [position, setPosition] = useState(0)
  const hole = holes[position]
  const score = scores[position]
  if (!hole || !score) return null

  const received = courseHandicap === null ? 0 : strokesReceived(courseHandicap, hole.strokeIndex)
  const cap = maxHoleScore(hole.par, hole.strokeIndex, courseHandicap)
  const isCapped = score.strokes !== null && score.strokes > cap

  const update = (patch: Partial<HoleScore>) => {
    const next = [...scores]
    next[position] = { ...score, ...patch }
    onChange(next)
  }

  const setStrokes = (value: number | null) => {
    update({
      strokes: value,
      // A par 3 has no fairway to hit, so the field is never applicable there.
      fairwayHit: hole.par === 3 ? null : score.fairwayHit,
    })
  }

  const total = scores.reduce((sum, entry) => sum + (entry.strokes ?? 0), 0)
  const parSoFar = holes
    .slice(0, scores.filter((entry) => entry.strokes !== null).length)
    .reduce((sum, entry) => sum + entry.par, 0)
  const relative = total - parSoFar

  return (
    <div className="space-y-5">
      {/* Hole navigator: every hole reachable in one tap, with its score shown. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-1.5 pb-1">
          {holes.map((entry, index) => {
            const entryScore = scores[index]?.strokes ?? null
            const isCurrent = index === position
            return (
              <button
                key={entry.number}
                type="button"
                onClick={() => setPosition(index)}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Hole ${entry.number}, par ${entry.par}${
                  entryScore !== null ? `, scored ${entryScore}` : ', not entered'
                }`}
                className="tap grid h-11 w-9 shrink-0 place-items-center rounded-lg border text-sm"
                style={{
                  borderColor: isCurrent ? 'var(--signal)' : 'var(--hairline)',
                  background:
                    entryScore !== null ? 'var(--raised)' : 'transparent',
                  color: entryScore !== null ? 'var(--ink)' : 'var(--ink-faint)',
                  fontVariationSettings: "'wght' 600",
                }}
              >
                {entryScore ?? entry.number}
              </button>
            )
          })}
        </div>
      </div>

      <div className="panel relative p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="label">Hole {hole.number}</span>
            <p className="numeral text-2xl">Par {hole.par}</p>
          </div>
          <div className="text-right">
            <span className="label inline-flex items-center gap-1">
              Stroke index {hole.strokeIndex}
              <Explain term="strokeIndex" />
            </span>
            <p
              className="text-sm"
              style={{ color: received > 0 ? 'var(--signal)' : 'var(--ink-faint)' }}
            >
              {/*
                Before a player has an Index there are no handicap strokes to
                allocate, so "no stroke here" says nothing. What actually
                governs their card is the par + 5 cap.
              */}
              {courseHandicap === null
                ? `Max score ${cap} until you have an index`
                : received > 0
                  ? `You get ${received} stroke${received > 1 ? 's' : ''} here`
                  : received < 0
                    ? `You give back ${-received}`
                    : 'No stroke here'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <button
            type="button"
            className="stepper-button tap"
            onClick={() => setStrokes(score.strokes === null ? hole.par : clamp(score.strokes - 1, 1, 20))}
            aria-label="One fewer stroke"
          >
            −
          </button>
          <div className="text-center">
            <p className="numeral text-6xl leading-none">{score.strokes ?? '–'}</p>
            <p className="label mt-1">strokes</p>
          </div>
          <button
            type="button"
            className="stepper-button tap"
            onClick={() => setStrokes(score.strokes === null ? hole.par + 1 : clamp(score.strokes + 1, 1, 20))}
            aria-label="One more stroke"
          >
            +
          </button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {[hole.par - 1, hole.par, hole.par + 1, hole.par + 2, hole.par + 3].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStrokes(value)}
              data-selected={score.strokes === value}
              className="chip tap"
            >
              {value}
            </button>
          ))}
        </div>

        {isCapped && (
          <p className="prose-note mt-4 rounded-lg p-3" style={{ background: 'var(--raised)' }}>
            For your handicap this hole counts as <strong style={{ color: 'var(--ink)' }}>{cap}</strong>,
            not {score.strokes}. That is your net double bogey — one blow-up hole cannot wreck
            your Index. <Explain term="netDoubleBogey" />
          </p>
        )}
      </div>

      <div className="panel space-y-4 p-5">
        <div className="flex items-center justify-between">
          <span className="label">Putts</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="stepper-button tap"
              onClick={() => update({ putts: clamp((score.putts ?? 2) - 1, 0, 10) })}
              aria-label="One fewer putt"
            >
              −
            </button>
            <span className="numeral w-8 text-center text-2xl">{score.putts ?? '–'}</span>
            <button
              type="button"
              className="stepper-button tap"
              onClick={() => update({ putts: clamp((score.putts ?? 1) + 1, 0, 10) })}
              aria-label="One more putt"
            >
              +
            </button>
          </div>
        </div>

        {hole.par > 3 && (
          <Toggle
            label="Fairway hit"
            value={score.fairwayHit}
            onChange={(value) => update({ fairwayHit: value })}
          />
        )}
        <Toggle
          label="Green in regulation"
          value={score.greenInRegulation}
          onChange={(value) => update({ greenInRegulation: value })}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="tap chip"
          onClick={() => setPosition((current) => Math.max(0, current - 1))}
          disabled={position === 0}
        >
          ← Previous
        </button>
        <p className="numeral text-lg">
          {total}
          <span className="label ml-2">
            {relative === 0 ? 'even' : relative > 0 ? `+${relative}` : relative}
          </span>
        </p>
        <button
          type="button"
          className="tap chip"
          onClick={() => setPosition((current) => Math.min(holes.length - 1, current + 1))}
          disabled={position === holes.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      <div className="flex gap-1.5">
        {[
          { text: 'Yes', next: true },
          { text: 'No', next: false },
        ].map((option) => (
          <button
            key={option.text}
            type="button"
            className="chip tap"
            data-selected={value === option.next}
            onClick={() => onChange(value === option.next ? null : option.next)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  )
}
