import { useState } from 'react'
import { AppProvider } from './ui/state/AppState'
import { IndexScreen } from './ui/screens/IndexScreen'
import { PostRoundScreen } from './ui/screens/PostRoundScreen'

type View = 'index' | 'post'

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

function Shell() {
  const [view, setView] = useState<View>('index')

  return (
    <div className="mx-auto min-h-dvh max-w-[560px]">
      <header className="flex items-center justify-between px-4 pt-5">
        <span
          className="text-sm"
          style={{ fontVariationSettings: "'wdth' 108, 'wght' 700", letterSpacing: '0.02em' }}
        >
          HANDY<span style={{ color: 'var(--signal)' }}>CAP</span>
        </span>
      </header>

      {view === 'index' ? (
        <IndexScreen />
      ) : (
        <PostRoundScreen onDone={() => setView('index')} />
      )}

      {view === 'index' && (
        <nav
          className="fixed inset-x-0 bottom-0 mx-auto max-w-[560px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
          style={{
            background:
              'linear-gradient(to top, var(--ground) 55%, color-mix(in oklab, var(--ground) 0%, transparent))',
          }}
        >
          <button
            type="button"
            className="primary-action tap w-full py-4"
            onClick={() => setView('post')}
          >
            Post a round
          </button>
        </nav>
      )}
    </div>
  )
}
