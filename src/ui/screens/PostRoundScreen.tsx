import { useMemo, useState } from 'react'
import { CourseSearch } from '../components/CourseSearch'
import { TeePicker } from '../components/TeePicker'
import { Scorecard } from '../components/Scorecard'
import { ManualCourseForm } from '../components/ManualCourseForm'
import { Explain } from '../components/Explain'
import { useCourseDetail } from '../hooks/useCourseData'
import { useAppState } from '../state/AppState'
import { courseHandicap } from '@/domain/whs/courseHandicap'
import { scoreDifferential } from '@/domain/whs/differential'
import { adjustedGrossScore } from '@/domain/whs/netDoubleBogey'
import { deriveNineHoleRating } from '@/domain/whs/nineHole'
import type { CachedCourse } from '@/data/repo/courseCache'
import type { CourseSummary } from '@/data/opengolf/map'
import type { HoleScore, Nine, Round, TeeSet } from '@/domain/whs/types'

type Step = 'course' | 'manual' | 'setup' | 'scoring'
type EntryMode = 'holes' | 'total'

const today = () => new Date().toISOString().slice(0, 10)

const blankScores = (numbers: number[]): HoleScore[] =>
  numbers.map((number) => ({
    number,
    strokes: null,
    putts: null,
    fairwayHit: null,
    greenInRegulation: null,
  }))

export function PostRoundScreen({ onDone }: { onDone: () => void }) {
  const { record, saveRound } = useAppState()

  const [step, setStep] = useState<Step>('course')
  const [summary, setSummary] = useState<CourseSummary | null>(null)
  const [manualCourse, setManualCourse] = useState<CachedCourse | null>(null)
  const [tee, setTee] = useState<TeeSet | null>(null)
  const [date, setDate] = useState(today())
  const [holeCount, setHoleCount] = useState<9 | 18>(18)
  const [nine, setNine] = useState<Nine>('front')
  const [entryMode, setEntryMode] = useState<EntryMode>('holes')
  const [scores, setScores] = useState<HoleScore[]>([])
  const [quickTotal, setQuickTotal] = useState('')
  const [saving, setSaving] = useState(false)

  const fetched = useCourseDetail(manualCourse ? null : summary)
  const course = manualCourse ?? fetched.course

  const holes = useMemo(() => {
    if (!course) return []
    const all = course.holes
    if (holeCount === 18) return all
    return nine === 'front' ? all.slice(0, 9) : all.slice(9, 18)
  }, [course, holeCount, nine])

  const playingHandicap =
    record.index !== null && tee ? courseHandicap(record.index, tee) : null

  const beginScoring = () => {
    setScores(blankScores(holes.map((hole) => hole.number)))
    setStep('scoring')
  }

  const totalStrokes = useMemo(() => {
    if (entryMode === 'total') {
      const parsed = Number(quickTotal)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
    return scores.every((score) => score.strokes !== null)
      ? scores.reduce((sum, score) => sum + (score.strokes ?? 0), 0)
      : null
  }, [entryMode, quickTotal, scores])

  /** A live preview of what this round will contribute, before it is saved. */
  const preview = useMemo(() => {
    if (!tee || totalStrokes === null || holes.length === 0) return null
    const rating = holeCount === 9 ? deriveNineHoleRating(tee.courseRating) : tee.courseRating
    const adjusted =
      entryMode === 'holes' ? adjustedGrossScore(scores, holes, playingHandicap) : totalStrokes
    return {
      adjusted,
      differential: scoreDifferential({
        adjustedGrossScore: adjusted,
        courseRating: rating,
        slope: tee.slope,
      }),
    }
  }, [tee, totalStrokes, holes, holeCount, entryMode, scores, playingHandicap])

  const save = async () => {
    if (!course || !tee || totalStrokes === null) return
    setSaving(true)
    const round: Round = {
      id: crypto.randomUUID(),
      date,
      course: {
        id: course.id,
        name: course.name,
        city: course.city,
        state: course.state,
        tee,
        holes,
        manualEntry: Boolean(manualCourse),
      },
      holeCount,
      nine: holeCount === 9 ? nine : null,
      holeScores: entryMode === 'holes' ? scores : [],
      totalStrokes: entryMode === 'total' ? totalStrokes : null,
      pcc: 0,
    }
    await saveRound(round)
    setSaving(false)
    onDone()
  }

  if (step === 'course') {
    return (
      <Frame title="Where did you play?" onBack={onDone}>
        <CourseSearch
          onSelect={(selected) => {
            setSummary(selected)
            setManualCourse(null)
            setTee(null)
            setStep('setup')
          }}
          onEnterManually={() => setStep('manual')}
        />
      </Frame>
    )
  }

  if (step === 'manual') {
    return (
      <Frame title="Add a course" onBack={() => setStep('course')}>
        <ManualCourseForm
          onCancel={() => setStep('course')}
          onSave={(created) => {
            setManualCourse(created)
            setSummary(null)
            setTee(created.tees[0] ?? null)
            setStep('setup')
          }}
        />
      </Frame>
    )
  }

  if (step === 'setup') {
    return (
      <Frame title={course?.name ?? 'Loading…'} onBack={() => setStep('course')}>
        {fetched.loading && !course && <p className="label">Loading course…</p>}
        {fetched.error && !course && (
          <p className="prose-note" style={{ color: 'var(--amber)' }}>
            {fetched.error}
          </p>
        )}

        {course && (
          <div className="space-y-6">
            {course.strokeIndexesEstimated && (
              <p className="prose-note rounded-lg p-3" style={{ background: 'var(--raised)' }}>
                This course has no stroke indexes on record, so hole order is being used
                instead. That only affects which holes your maximum score applies to.
              </p>
            )}

            <div>
              <p className="label mb-2">Tees</p>
              <TeePicker tees={course.tees} selected={tee} onSelect={setTee} />
            </div>

            <div>
              <label className="label mb-2 block" htmlFor="round-date">
                Date played
              </label>
              <input
                id="round-date"
                type="date"
                className="field"
                value={date}
                max={today()}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <div>
              <p className="label mb-2">Holes</p>
              <div className="flex gap-2">
                {([18, 9] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    className="chip tap"
                    data-selected={holeCount === count}
                    onClick={() => setHoleCount(count)}
                  >
                    {count} holes
                  </button>
                ))}
                {holeCount === 9 &&
                  (['front', 'back'] as const).map((which) => (
                    <button
                      key={which}
                      type="button"
                      className="chip tap"
                      data-selected={nine === which}
                      onClick={() => setNine(which)}
                    >
                      {which} nine
                    </button>
                  ))}
              </div>
              {holeCount === 9 && (
                <p className="prose-note mt-2">
                  A single nine waits for a second one, then the two combine into one
                  18-hole score. <Explain term="pendingNine" />
                </p>
              )}
            </div>

            <div>
              <p className="label mb-2">How are you entering it?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="chip tap"
                  data-selected={entryMode === 'holes'}
                  onClick={() => setEntryMode('holes')}
                >
                  Hole by hole
                </button>
                <button
                  type="button"
                  className="chip tap"
                  data-selected={entryMode === 'total'}
                  onClick={() => setEntryMode('total')}
                >
                  Just the total
                </button>
              </div>
              {entryMode === 'total' && (
                <p className="prose-note mt-2">
                  A total on its own cannot be capped at net double bogey, and it cannot feed
                  the par 3 / 4 / 5 breakdown. Use it for older rounds you only remember the
                  score for.
                </p>
              )}
            </div>

            {tee && playingHandicap !== null && (
              <div className="panel relative p-4">
                <p className="label flex items-center gap-1">
                  Your course handicap here <Explain term="courseHandicap" />
                </p>
                <p className="numeral mt-1 text-3xl">{playingHandicap}</p>
              </div>
            )}

            <button
              type="button"
              className="primary-action tap w-full py-4"
              disabled={!tee}
              onClick={beginScoring}
            >
              {entryMode === 'holes' ? 'Start scoring' : 'Enter the score'}
            </button>
          </div>
        )}
      </Frame>
    )
  }

  return (
    <Frame title={course?.name ?? ''} onBack={() => setStep('setup')}>
      {entryMode === 'holes' ? (
        <Scorecard
          holes={holes}
          scores={scores}
          courseHandicap={playingHandicap}
          onChange={setScores}
        />
      ) : (
        <div>
          <label className="label mb-2 block" htmlFor="quick-total">
            Total score for {holeCount} holes
          </label>
          <input
            id="quick-total"
            className="field"
            inputMode="numeric"
            value={quickTotal}
            onChange={(event) => setQuickTotal(event.target.value)}
            placeholder="90"
          />
        </div>
      )}

      {preview && (
        <div className="panel mt-6 flex items-center justify-between p-4">
          <div>
            <p className="label flex items-center gap-1">
              This round scores <Explain term="scoreDifferential" />
            </p>
            <p className="prose-note">
              {preview.adjusted} adjusted on a {tee?.slope} slope
            </p>
          </div>
          <p className="numeral text-3xl">{preview.differential.toFixed(1)}</p>
        </div>
      )}

      <button
        type="button"
        className="primary-action tap mt-6 w-full py-4"
        disabled={totalStrokes === null || saving}
        onClick={save}
      >
        {saving
          ? 'Saving…'
          : totalStrokes === null
            ? 'Enter every hole to save'
            : `Post this round · ${totalStrokes}`}
      </button>
    </Frame>
  )
}

function Frame({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rise px-4 pb-32 pt-4">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="tap grid h-9 w-9 place-items-center rounded-lg border"
          style={{ borderColor: 'var(--hairline)' }}
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="truncate text-lg" style={{ fontVariationSettings: "'wght' 620" }}>
          {title}
        </h1>
      </div>
      {children}
    </div>
  )
}
