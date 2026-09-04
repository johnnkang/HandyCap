import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state/AppState'
import { OPEN_GOLF_ATTRIBUTION } from '@/data/opengolf/client'

type ThemeChoice = 'auto' | 'dark' | 'light'
const THEME_KEY = 'handycap:theme'

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

/** Restore the saved theme on load, before anything is painted. */
export function useStoredTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>('auto')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) as ThemeChoice | null
      if (stored === 'dark' || stored === 'light' || stored === 'auto') {
        setChoice(stored)
        applyTheme(stored)
      }
    } catch {
      // Private browsing can throw on access; the default is correct anyway.
    }
  }, [])

  const update = (next: ThemeChoice) => {
    setChoice(next)
    applyTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // A theme that does not persist is a small loss, not an error.
    }
  }

  return [choice, update]
}

export function AboutScreen({ onClose }: { onClose: () => void }) {
  const { repository, reload, rounds } = useAppState()
  const [theme, setTheme] = useStoredTheme()
  const [status, setStatus] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const exportData = async () => {
    const json = await repository.exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `handycap-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatus(`Exported ${rounds.length} round${rounds.length === 1 ? '' : 's'}.`)
  }

  const importData = async (file: File) => {
    try {
      await repository.importJson(await file.text())
      await reload()
      setStatus('Import complete. Your Index has been recalculated.')
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'That import failed.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 overflow-y-auto"
      style={{ background: 'var(--ground)' }}
      role="dialog"
      aria-label="About HandyCap"
    >
      <div className="mx-auto max-w-[560px] space-y-7 px-4 pb-16 pt-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="tap grid h-9 w-9 place-items-center rounded-lg border"
            style={{ borderColor: 'var(--hairline)' }}
            aria-label="Close"
          >
            ✕
          </button>
          <h2 style={{ fontVariationSettings: "'wght' 620" }}>About HandyCap</h2>
        </div>

        <section>
          <p className="label mb-2">Appearance</p>
          <div className="flex gap-2">
            {(['auto', 'dark', 'light'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className="chip tap"
                data-selected={theme === option}
                onClick={() => setTheme(option)}
              >
                {option === 'auto' ? 'Match system' : option}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="label mb-2">Your data</p>
          <p className="prose-note mb-3">
            Everything lives on this device. Nothing is uploaded, and there is no account.
            That also means a lost phone is a lost record — export a backup now and then.
          </p>
          <div className="flex gap-3">
            <button type="button" className="tap chip flex-1 py-3" onClick={exportData}>
              Export {rounds.length} round{rounds.length === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              className="tap chip flex-1 py-3"
              onClick={() => fileInput.current?.click()}
            >
              Import a backup
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importData(file)
              event.target.value = ''
            }}
          />
          {status && (
            <p className="prose-note mt-3" style={{ color: 'var(--signal)' }}>
              {status}
            </p>
          )}
          <p className="prose-note mt-2" style={{ color: 'var(--amber)' }}>
            Importing replaces your current record rather than merging into it.
          </p>
        </section>

        <section>
          <p className="label mb-2">What this is</p>
          <p className="prose-note">
            HandyCap follows the World Handicap System: your Index is the average of the
            best 8 of your last 20 Score Differentials, with the published table for shorter
            records, net double bogey adjustment, the soft and hard caps, and exceptional
            score reductions.
          </p>
          <p className="prose-note mt-2">
            It is <strong style={{ color: 'var(--ink)' }}>not an official handicap</strong>.
            HandyCap is not a licensed handicap provider and does not issue a GHIN number.
            It tracks your official Index closely; it does not replace it.
          </p>
        </section>

        <section>
          <p className="label mb-2">Two things it approximates</p>
          <p className="prose-note">
            <strong style={{ color: 'var(--ink)' }}>Playing Conditions Calculation</strong> is
            treated as zero. It needs every score posted at a course on a given day, which no
            app on your phone can see. In practice it is usually zero anyway.
          </p>
          <p className="prose-note mt-2">
            <strong style={{ color: 'var(--ink)' }}>Nine-hole rounds</strong> are combined in
            pairs. The 2024 revision converts a single nine using an expected Score
            Differential table that has not been published, so HandyCap uses the previous
            official method and holds a lone nine as pending. Where a course has no separate
            nine-hole rating, half the eighteen-hole rating is used.
          </p>
        </section>

        <section>
          <p className="label mb-2">Course data</p>
          <p className="prose-note">
            Courses come from OpenGolfAPI. {OPEN_GOLF_ATTRIBUTION}, made available under the
            Open Database License.
          </p>
          <p className="prose-note mt-2">
            The data is community-maintained, so a rating can be stale or wrong. If a course
            looks off, enter it by hand — HandyCap will use your numbers instead. Tees with
            no Course Rating and Slope are hidden, because they cannot produce a valid score.
          </p>
        </section>
      </div>
    </div>
  )
}
