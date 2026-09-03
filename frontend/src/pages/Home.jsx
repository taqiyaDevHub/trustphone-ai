import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="page-container">
      <section className="py-10 text-center sm:py-16">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          TrustPhone AI
        </h1>
        <p className="mt-4 text-2xl font-semibold text-cyan sm:text-3xl">
          Check Before You Buy.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          Stolen and blocked phones are sold every day. TrustPhone AI helps you
          verify a second-hand device’s IMEI and spot risky deals before you pay.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/verify" className="btn-primary w-full sm:w-auto">
            Verify Phone
          </Link>
          <Link to="/scan-imei" className="btn-secondary w-full sm:w-auto">
            Scan IMEI
          </Link>
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="page-title">How It Works</h2>
        <ol className="mt-6 space-y-4">
          <li className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              1
            </span>
            <p className="text-muted">Enter or scan IMEI</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              2
            </span>
            <p className="text-muted">Check available device status</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              3
            </span>
            <p className="text-muted">Review AI risk assessment</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              4
            </span>
            <p className="text-muted">Make an informed decision</p>
          </li>
        </ol>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-panel p-4 text-sm text-muted">
        <p>
          This is an AI hackathon prototype using demo device records. It does not
          connect to government, police, or live national databases.
        </p>
      </section>
    </div>
  )
}
