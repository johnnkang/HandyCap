import { useState } from 'react'
import { CourseSearch } from './CourseSearch'
import { TeePicker } from './TeePicker'
import { Explain } from './Explain'
import { useCourseDetail } from '../hooks/useCourseData'
import { courseHandicap, playingHandicap } from '@/domain/whs/courseHandicap'
import type { CourseSummary } from '@/data/opengolf/map'
import type { TeeSet } from '@/domain/whs/types'

/**
 * "What do I play off here?" — the question a golfer actually asks on arriving
 * at a course, answered without posting anything.
 */
export function CourseHandicapCard({ index }: { index: number }) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<CourseSummary | null>(null)
  const [tee, setTee] = useState<TeeSet | null>(null)
  const { course, loading } = useCourseDetail(summary)

  const strokes = tee ? courseHandicap(index, tee) : null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap panel flex w-full items-center justify-between px-4 py-4 text-left"
      >
        <span>
          <span className="label block">Playing somewhere today?</span>
          <span className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            Get your course handicap
          </span>
        </span>
        <span aria-hidden="true" style={{ color: 'var(--signal)' }}>
          →
        </span>
      </button>
    )
  }

  return (
    <section className="panel relative space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="label">Course handicap</h2>
        <button
          type="button"
          className="label tap"
          onClick={() => {
            setOpen(false)
            setSummary(null)
            setTee(null)
          }}
        >
          Close
        </button>
      </div>

      {!summary && (
        <CourseSearch
          onSelect={(selected) => {
            setSummary(selected)
            setTee(null)
          }}
        />
      )}

      {summary && (
        <>
          <button
            type="button"
            className="label tap"
            onClick={() => {
              setSummary(null)
              setTee(null)
            }}
          >
            ← {summary.name}
          </button>
          {loading && !course && <p className="label">Loading tees…</p>}
          {course && <TeePicker tees={course.tees} selected={tee} onSelect={setTee} />}
        </>
      )}

      {tee && strokes !== null && (
        <div className="rise rounded-xl p-4" style={{ background: 'var(--raised)' }}>
          <p className="label flex items-center gap-1">
            You play off <Explain term="courseHandicap" />
          </p>
          <p className="numeral text-5xl leading-none">{strokes}</p>
          <p className="prose-note mt-2">
            {tee.name} tees · rating {tee.courseRating.toFixed(1)} · slope {tee.slope}.
            {playingHandicap(strokes, 0.95) !== strokes && (
              <> In many competitions you would play off {playingHandicap(strokes, 0.95)} (95%).</>
            )}
          </p>
        </div>
      )}
    </section>
  )
}
