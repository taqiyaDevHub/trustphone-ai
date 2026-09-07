import { Link } from 'react-router-dom'
import {
  ShieldCheckIcon,
  ScanLineIcon,
  GaugeIcon,
  HashIcon,
  CheckCircleIcon,
  SparklesIcon,
  ArrowRightIcon,
  InfoIcon,
} from '../components/icons'

const features = [
  {
    to: '/verify',
    Icon: ShieldCheckIcon,
    tint: 'bg-primary-50 text-primary-600',
    title: 'Verify Phone Status',
    desc: 'Check whether an IMEI is reported stolen, blocked, or clean.',
  },
  {
    to: '/scan-imei',
    Icon: ScanLineIcon,
    tint: 'bg-teal-50 text-teal-600',
    title: 'Scan Box Label',
    desc: 'Snap a photo of the box label and let OCR read the IMEI.',
  },
  {
    to: '/risk-check',
    Icon: GaugeIcon,
    tint: 'bg-violet-50 text-violet-600',
    title: 'AI Risk Assessment',
    desc: 'Score the deal and see the key factors before money changes hands.',
  },
]

const steps = [
  {
    Icon: HashIcon,
    title: 'Enter or scan the IMEI',
    desc: 'Dial *#06# on the phone or scan the box label.',
  },
  {
    Icon: ShieldCheckIcon,
    title: 'Check device status',
    desc: 'See if the device is reported stolen, blocked, or clean.',
  },
  {
    Icon: GaugeIcon,
    title: 'Review the AI risk score',
    desc: 'Key factors and safety advice, explained simply.',
  },
  {
    Icon: CheckCircleIcon,
    title: 'Decide with confidence',
    desc: 'Weigh the signals and make an informed choice.',
  },
]

export default function Home() {
  return (
    <div className="page-container-wide">
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden py-12 text-center sm:py-16">
        <div
          aria-hidden="true"
          className="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]"
        />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-primary-700 shadow-sm ring-1 ring-primary-200">
          <SparklesIcon className="h-3.5 w-3.5" />
          AI-Powered Device Verification
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
          Check Before <span className="text-gradient">You Buy.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
          Stolen and blocked phones are sold every day. TrustPhone AI helps you
          verify a second-hand device&rsquo;s IMEI and spot risky deals before
          you pay.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/verify" className="btn-primary w-full sm:w-auto">
            Verify a Phone
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <Link to="/scan-imei" className="btn-secondary w-full sm:w-auto">
            <ScanLineIcon className="h-4 w-4" />
            Scan Box Label
          </Link>
        </div>

        {/* Trust strip */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <ShieldCheckIcon className="h-4 w-4 text-primary-500" />
            IMEI status check
          </span>
          <span className="inline-flex items-center gap-2">
            <GaugeIcon className="h-4 w-4 text-teal-500" />
            AI risk score
          </span>
          <span className="inline-flex items-center gap-2">
            <ScanLineIcon className="h-4 w-4 text-violet-500" />
            Label OCR scan
          </span>
        </div>
      </section>

      {/* ---- Core actions ---- */}
      <section aria-label="Core features" className="grid gap-4 sm:grid-cols-3">
        {features.map(({ to, Icon, tint, title, desc }) => (
          <Link key={to} to={to} className="card card-interactive group p-5">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold text-ink">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{desc}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-600">
              Start
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      {/* ---- How it works ---- */}
      <section className="mt-12 sm:mt-16">
        <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          How It Works
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ Icon, title, desc }, i) => (
            <li key={title} className="card p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  aria-hidden="true"
                  className="select-none text-3xl font-extrabold leading-none text-slate-200"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-3 text-[15px] font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- Prototype disclaimer ---- */}
      <section className="mt-10 flex items-start gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-line sm:p-5">
        <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" />
        <p className="text-sm leading-relaxed text-ink-muted">
          This is an AI hackathon prototype using demo device records. It does
          not connect to government, police, or live national databases.
        </p>
      </section>
    </div>
  )
}
