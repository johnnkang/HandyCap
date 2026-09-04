import { useState } from 'react'
import { AppProvider, useAppState } from './ui/state/AppState'
import { IndexScreen } from './ui/screens/IndexScreen'
import { RoundsScreen } from './ui/screens/RoundsScreen'
import { InsightsScreen } from './ui/screens/InsightsScreen'
import { ForecastScreen } from './ui/screens/ForecastScreen'
import { PostRoundScreen } from './ui/screens/PostRoundScreen'

type Tab = 'index' | 'rounds' | 'insights' | 'forecast'

const LEFT_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'index', label: 'Index', icon: '◎' },
  { id: 'rounds', label: 'Rounds', icon: '≡' },
]

const RIGHT_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'insights', label: 'Insights', icon: '◫' },
  { id: 'forecast', label: 'Forecast', icon: '↗' },
]

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>('index')
  const [posting, setPosting] = useState(false)

  if (posting) {
    return (
      <div className="mx-auto min-h-dvh max-w-[560px]">
        <PostRoundScreen
          onDone={() => {
            setPosting(false)
            setTab('index')
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-dvh max-w-[560px]">
      <header className="flex items-center justify-between px-4 pt-5">
        <span
          className="text-sm"
          style={{ fontVariationSettings: "'wdth' 108, 'wght' 700", letterSpacing: '0.02em' }}
        >
          HANDY<span style={{ color: 'var(--signal)' }}>CAP</span>
        </span>
        <PendingBadge />
      </header>

      {tab === 'index' && <IndexScreen />}
      {tab === 'rounds' && <RoundsScreen />}
      {tab === 'insights' && <InsightsScreen />}
      {tab === 'forecast' && <ForecastScreen />}

      {/*
        The post action lives in the bar rather than floating above it: a
        floating button covered the last few lines of every scrolling screen.
      */}
      <nav
        className="hairline-top fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
        style={{ background: 'var(--ground)' }}
        aria-label="Sections"
      >
        <ul className="flex items-center">
          {LEFT_TABS.map((entry) => (
            <TabButton
              key={entry.id}
              entry={entry}
              active={tab === entry.id}
              onSelect={() => setTab(entry.id)}
            />
          ))}

          <li className="shrink-0 px-2">
            <button
              type="button"
              onClick={() => setPosting(true)}
              aria-label="Post a round"
              className="tap primary-action grid h-12 w-12 place-items-center rounded-full text-2xl"
              style={{ boxShadow: 'var(--shadow-lift)' }}
            >
              <span aria-hidden="true">+</span>
            </button>
          </li>

          {RIGHT_TABS.map((entry) => (
            <TabButton
              key={entry.id}
              entry={entry}
              active={tab === entry.id}
              onSelect={() => setTab(entry.id)}
            />
          ))}
        </ul>
      </nav>
    </div>
  )
}

function TabButton({
  entry,
  active,
  onSelect,
}: {
  entry: { id: Tab; label: string; icon: string }
  active: boolean
  onSelect: () => void
}) {
  return (
    <li className="flex-1">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className="tap flex w-full flex-col items-center gap-0.5 py-2"
        style={{ color: active ? 'var(--signal)' : 'var(--ink-faint)' }}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {entry.icon}
        </span>
        <span className="label" style={{ color: 'inherit' }}>
          {entry.label}
        </span>
      </button>
    </li>
  )
}

/** A lone nine is easy to forget about, so it is surfaced app-wide. */
function PendingBadge() {
  const { record } = useAppState()
  if (!record.pendingNine) return null
  return (
    <span
      className="label rounded-full px-2.5 py-1"
      style={{ background: 'var(--raised)', color: 'var(--amber)' }}
    >
      1 nine pending
    </span>
  )
}
