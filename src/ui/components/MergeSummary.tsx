import { useAppState } from '@/ui/state/AppState'

/**
 * The one moment a user could feel the app moved their data without asking:
 * signing in on a device that already held rounds merges them into the
 * account. `AppState` produces the numbers exactly once, on the first sync
 * that ever adopts this account on this device — this component's only job
 * is to say what happened in plain English and offer a way back out.
 */
export function MergeSummary() {
  const { adoption, undoAdoption, dismissAdoption } = useAppState()

  if (!adoption) return null
  // Nothing to reconcile: device and account agreed, whether because both
  // were empty or because the device already held everything the account
  // has. Nothing moved, so there is nothing to say.
  if (adoption.total === 0) return null

  return (
    <section className="panel relative mx-4 mt-4 p-4" role="status">
      <p className="label">Your account is up to date</p>
      <p className="prose-note mt-1">
        Your account had {roundsPhrase(adoption.fromAccount)}. This device added{' '}
        {roundsPhrase(adoption.onDevice)}. You now have {adoption.total}.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          className="tap chip flex-1 py-3"
          onClick={() => void undoAdoption()}
        >
          Undo and sign out
        </button>
        <button type="button" className="tap chip flex-1 py-3" onClick={dismissAdoption}>
          Looks right
        </button>
      </div>
      <p className="prose-note mt-3" style={{ color: 'var(--ink-dim)' }}>
        Your rounds go back to how they were on this phone. The ones already uploaded stay in
        your account.
      </p>
    </section>
  )
}

const roundsPhrase = (count: number): string => `${count} ${count === 1 ? 'round' : 'rounds'}`
