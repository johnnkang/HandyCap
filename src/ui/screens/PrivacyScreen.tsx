export function PrivacyScreen({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-30 overflow-y-auto"
      style={{ background: 'var(--ground)' }}
      role="dialog"
      aria-label="Privacy"
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
          <h2 style={{ fontVariationSettings: "'wght' 620" }}>Privacy</h2>
        </div>

        <section>
          <p className="label mb-2">Your rounds and your Index</p>
          <p className="prose-note">
            Your rounds, scores, and Handicap Index are stored only on this device and are
            never sent anywhere — unless you create an account, in which case they sync to a
            server so they reach your other devices too.
          </p>
        </section>

        <section>
          <p className="label mb-2">Searching for a course</p>
          <p className="prose-note">
            Typing a course name to look it up sends that text to OpenGolfAPI, so it can find
            the course and return its ratings. This happens whether or not you have an
            account — it's the one thing that leaves this device either way. Nothing that
            identifies you goes with it: no account, no name, just the text you typed.
          </p>
          <p className="prose-note mt-2">
            Courses you've already used are cached on this device, so the app keeps working
            without a signal — the club you play every week won't need to be looked up again.
          </p>
        </section>

        <section>
          <p className="label mb-2">With an account</p>
          <p className="prose-note">
            An account stores exactly two things: your email address, and your rounds — the
            course, tees, scores, and dates you post. Nothing else is collected: no location,
            no device data, no usage analytics tied to you.
          </p>
          <p className="prose-note mt-2">
            That data is used for one purpose — syncing your rounds between your devices —
            and for nothing else. There is no advertising, and it is never shared with or
            sold to a third party for analytics, marketing, or any other purpose.
          </p>
        </section>

        <section>
          <p className="label mb-2">Who holds what</p>
          <p className="prose-note">
            Two outside services are involved, and each sees only its own piece.
            <strong style={{ color: 'var(--ink)' }}> OpenGolfAPI</strong> receives the course
            searches described above, with no account attached, whether or not you're signed
            in. <strong style={{ color: 'var(--ink)' }}>Supabase</strong> is the hosting
            provider HandyCap uses for accounts: it holds your email address and your rounds
            if, and only if, you've created an account. HandyCap does not run its own servers
            for either.
          </p>
        </section>

        <section>
          <p className="label mb-2">Deleting your account</p>
          <p className="prose-note">
            From the Account screen, deleting your account permanently removes the account
            itself and every round it synced. Rounds already saved on your own devices are
            not touched — they stay right where they are, and HandyCap keeps working without
            an account.
          </p>
        </section>
      </div>
    </div>
  )
}
