import { useState } from 'react'
import { useCourseSearch } from '../hooks/useCourseData'
import type { CourseSummary } from '@/data/opengolf/map'

interface CourseSearchProps {
  onSelect: (course: CourseSummary) => void
  onEnterManually?: () => void
}

export function CourseSearch({ onSelect, onEnterManually }: CourseSearchProps) {
  const [query, setQuery] = useState('')
  const { results, recent, searching, error } = useCourseSearch(query)

  const showingRecent = query.trim().length < 3
  const list = showingRecent ? recent : results

  return (
    <div className="space-y-4">
      <div>
        <label className="label mb-2 block" htmlFor="course-search">
          Course
        </label>
        <input
          id="course-search"
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search 32,000 US courses"
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {searching && <p className="label">Searching…</p>}
      {error && (
        <p className="prose-note" style={{ color: 'var(--amber)' }}>
          {error} You can still enter a course by hand.
        </p>
      )}

      {showingRecent && recent.length > 0 && <p className="label">Recently played</p>}

      <ul className="space-y-2">
        {list.map((course) => (
          <li key={course.id}>
            <button
              type="button"
              onClick={() => onSelect(course)}
              className="tap panel flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left"
            >
              <span style={{ fontVariationSettings: "'wght' 580" }}>{course.name}</span>
              <span className="label shrink-0">
                {[course.city, course.state].filter(Boolean).join(', ')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!showingRecent && !searching && results.length === 0 && !error && (
        <p className="prose-note">No courses matched that name.</p>
      )}

      {onEnterManually && (
        <button
          type="button"
          onClick={onEnterManually}
          className="tap w-full rounded-xl border border-dashed py-3 text-sm"
          style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink-dim)' }}
        >
          Enter a course by hand
        </button>
      )}
    </div>
  )
}
