import { useAppState } from '@/ui/state/AppState'

/**
 * The one moment a user could feel the app moved their data without asking:
 * signing in on a device that already held rounds merges them into the
 * account. `AppState` produces the numbers exactly once, on the first sync
 * after that sign-in — this component's only job is to say what happened in
 * plain English and offer a way back out.
 */
export function MergeSummary() {
  const { adoption, undoAdoption, dismissAdoption } = useAppState()

  if (!adoption) return null
  // Nothing to reconcile: a brand-new account meeting a device that had
  // never saved a round either. Nothing moved, so there is nothing to say.
  if (adoption.added === 0 && adoption.before === 0) return null

  return (
    <section className="panel relative mx-4 mt-4 p-4" role="status">
      <p className="label">Your account is up to date</p>
      <p className="prose-note mt-1">
        Your account had {roundsPhrase(adoption.added)}. This device added{' '}
        {roundsPhrase(adoption.before)}. You now have {adoption.after}.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          className="tap chip flex-1 py-3"
          onClick={() => void undoAdoption()}
        >
          Undo
        </button>
        <button type="button" className="tap chip flex-1 py-3" onClick={dismissAdoption}>
          Looks right
        </button>
      </div>
    </section>
  )
}

const roundsPhrase = (count: number): string => `${count} ${count === 1 ? 'round' : 'rounds'}`
