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
          <p className="label mb-2">As a guest</p>
          <p className="prose-note">
            If you have not created an account, nothing you enter ever leaves this device.
            HandyCap sends no data anywhere and has nothing to lose on your behalf.
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
          <p className="label mb-2">Where it lives</p>
          <p className="prose-note">
            Account data is held on Supabase, the hosting provider HandyCap uses for
            authentication and storage. HandyCap does not run its own servers for this data.
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
