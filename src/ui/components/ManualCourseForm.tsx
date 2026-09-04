import { useState } from 'react'
import type { CachedCourse } from '@/data/repo/courseCache'
import type { HoleInfo } from '@/domain/whs/types'
import { Explain } from './Explain'

/** A conventional par 72 layout, used as a starting point the player edits. */
const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
const DEFAULT_STROKE_INDEXES = [7, 1, 15, 11, 5, 3, 17, 9, 13, 8, 2, 16, 12, 6, 4, 18, 10, 14]

interface ManualCourseFormProps {
  onSave: (course: CachedCourse) => void
  onCancel: () => void
}

/**
 * Add a course the database does not have, or correct one whose community
 * ratings are wrong. The plan called this a safety valve; on a community-sourced
 * dataset it is closer to a requirement.
 */
export function ManualCourseForm({ onSave, onCancel }: ManualCourseFormProps) {
  const [name, setName] = useState('')
  const [teeName, setTeeName] = useState('White')
  const [courseRating, setCourseRating] = useState('72.0')
  const [slope, setSlope] = useState('113')
  const [holes, setHoles] = useState<HoleInfo[]>(
    DEFAULT_PARS.map((par, index) => ({
      number: index + 1,
      par,
      strokeIndex: DEFAULT_STROKE_INDEXES[index]!,
    })),
  )

  const rating = Number(courseRating)
  const slopeValue = Number(slope)
  const par = holes.reduce((total, hole) => total + hole.par, 0)
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(rating) &&
    rating > 25 &&
    rating < 90 &&
    Number.isFinite(slopeValue) &&
    slopeValue >= 55 &&
    slopeValue <= 155

  const setPar = (index: number, value: number) => {
    setHoles((current) =>
      current.map((hole, position) =>
        position === index ? { ...hole, par: value } : hole,
      ),
    )
  }

  const submit = () => {
    onSave({
      id: `manual-${crypto.randomUUID()}`,
      name: name.trim(),
      city: null,
      state: null,
      tees: [
        {
          key: 'manual',
          name: teeName.trim() || 'Tee',
          color: null,
          gender: 'unspecified',
          courseRating: rating,
          slope: slopeValue,
          par,
          yardage: null,
        },
      ],
      holes,
      strokeIndexesEstimated: false,
      cachedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="label mb-2 block" htmlFor="manual-name">
          Course name
        </label>
        <input
          id="manual-name"
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Municipal Golf Course"
        />
      </div>

      <div>
        <label className="label mb-2 block" htmlFor="manual-tee">
          Tee
        </label>
        <input
          id="manual-tee"
          className="field"
          value={teeName}
          onChange={(event) => setTeeName(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label mb-2 flex items-center gap-1" htmlFor="manual-rating">
            Course rating <Explain term="courseRating" />
          </label>
          <input
            id="manual-rating"
            className="field"
            inputMode="decimal"
            value={courseRating}
            onChange={(event) => setCourseRating(event.target.value)}
          />
        </div>
        <div>
          <label className="label mb-2 flex items-center gap-1" htmlFor="manual-slope">
            Slope <Explain term="slope" />
          </label>
          <input
            id="manual-slope"
            className="field"
            inputMode="numeric"
            value={slope}
            onChange={(event) => setSlope(event.target.value)}
          />
        </div>
      </div>

      <div>
        <p className="label mb-2">Par for each hole · total {par}</p>
        <div className="grid grid-cols-9 gap-1.5">
          {holes.map((hole, index) => (
            <button
              key={hole.number}
              type="button"
              onClick={() => setPar(index, hole.par >= 5 ? 3 : hole.par + 1)}
              className="tap grid h-11 place-items-center rounded-lg border"
              style={{ borderColor: 'var(--hairline)', background: 'var(--raised)' }}
              aria-label={`Hole ${hole.number}, par ${hole.par}. Tap to change.`}
            >
              <span className="numeral text-sm">{hole.par}</span>
            </button>
          ))}
        </div>
        <p className="prose-note mt-2">
          Tap a hole to cycle its par. Stroke indexes use a standard allocation, which only
          affects which holes your maximum score applies to.
        </p>
      </div>

      <div className="flex gap-3">
        <button type="button" className="tap chip flex-1 py-3" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-action tap flex-1 py-3"
          disabled={!valid}
          onClick={submit}
        >
          Use this course
        </button>
      </div>
    </div>
  )
}
