import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import {
  HashIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ShieldAlertIcon,
  BanIcon,
  AlertTriangleIcon,
  ClockIcon,
  HelpCircleIcon,
  ArrowRightIcon,
  InfoIcon,
  Spinner,
} from '../components/icons'

const STATUS_META = {
  CLEAN: {
    badge: 'status-clean',
    Icon: CheckCircleIcon,
    banner: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-600',
  },
  STOLEN: {
    badge: 'status-stolen',
    Icon: ShieldAlertIcon,
    banner: 'bg-red-50',
    ring: 'ring-red-200',
    iconWrap: 'bg-red-100 text-red-600',
  },
  BLOCKED: {
    badge: 'status-blocked',
    Icon: BanIcon,
    banner: 'bg-red-50',
    ring: 'ring-red-200',
    iconWrap: 'bg-red-100 text-red-600',
  },
  SUSPICIOUS: {
    badge: 'status-suspicious',
    Icon: AlertTriangleIcon,
    banner: 'bg-amber-50',
    ring: 'ring-amber-200',
    iconWrap: 'bg-amber-100 text-amber-600',
  },
  UNDER_REVIEW: {
    badge: 'status-under-review',
    Icon: ClockIcon,
    banner: 'bg-amber-50',
    ring: 'ring-amber-200',
    iconWrap: 'bg-amber-100 text-amber-600',
  },
  UNKNOWN: {
    badge: 'status-unknown',
    Icon: HelpCircleIcon,
    banner: 'bg-slate-50',
    ring: 'ring-slate-200',
    iconWrap: 'bg-slate-200 text-slate-600',
  },
}

export default function VerifyPhone() {
  const [searchParams] = useSearchParams()
  const [imei, setImei] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const imeiInputRef = useRef(null)

  useEffect(() => {
    const initial = searchParams.get('imei')
    if (initial) {
      const cleaned = initial.replace(/\D/g, '').slice(0, 15)
      setImei(cleaned)
    }
  }, [searchParams])

  const isValid = /^\d{15}$/.test(imei)
  const showValidationError = imei.length > 0 && !isValid

  const handleChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 15)
    setImei(value)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!isValid) {
      setError('IMEI must be exactly 15 digits.')
      return
    }

    setLoading(true)
    try {
      const data = await api.verifyImei(imei)
      if (!data || data.success === false) {
        setError(
          data?.error?.message ||
            'Unable to verify this IMEI. Please try again.'
        )
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckAnother = () => {
    setImei('')
    setResult(null)
    setError(null)
    setLoading(false)
    imeiInputRef.current?.focus()
  }

  const statusKey = (result?.status || 'UNKNOWN').toUpperCase()
  const meta = STATUS_META[statusKey] || STATUS_META.UNKNOWN

  return (
    <div className="page-container">
      <h1 className="page-title">Verify Phone</h1>
      <p className="page-subtitle">
        Enter a 15-digit IMEI to check the device status.
      </p>

      {/* ---- IMEI form ---- */}
      <div className="card mt-6 p-5 sm:p-7">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="imei" className="field-label">
              IMEI Number
            </label>
            <p className="field-hint">
              Dial <span className="font-mono font-semibold text-ink-soft">*#06#</span>{' '}
              on the phone to display its IMEI.
            </p>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">
                <HashIcon className="h-5 w-5" />
              </span>
              <input
                id="imei"
                ref={imeiInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={15}
                value={imei}
                onChange={handleChange}
                placeholder="e.g. 351234567890123"
                aria-describedby="imei-counter"
                className="input input-mono pl-11 pr-20"
                disabled={loading}
                autoComplete="off"
              />
              <span
                id="imei-counter"
                aria-hidden="true"
                className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  isValid
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-ink-faint'
                }`}
              >
                {imei.length}/15
              </span>
            </div>
            {(showValidationError || error) && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-600" role="alert">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                {error || 'IMEI must be exactly 15 digits.'}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isValid}
            className="btn-primary w-full"
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheckIcon className="h-4 w-4" />
                Verify Phone
              </>
            )}
          </button>
        </form>
      </div>

      {/* ---- Result ---- */}
      {result && (
        <div className="card animate-rise mt-6 overflow-hidden" aria-live="polite">
          {/* Status banner */}
          <div
            className={`flex items-center gap-4 p-5 ring-1 ring-inset sm:px-7 ${meta.banner} ${meta.ring}`}
          >
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.iconWrap}`}
            >
              <meta.Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">
                Verification Result
              </p>
              <p className="truncate text-xl font-bold text-ink">
                {result.status_label || result.status}
              </p>
            </div>
            <span
              className={`hidden shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-ink-muted ring-1 ring-inset ring-line sm:inline-flex`}
            >
              {result.found ? 'Record found' : 'No record found'}
            </span>
          </div>

          <div className="space-y-6 p-5 sm:p-7">
            {/* Details */}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  IMEI
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-ink">
                  {result.imei}
                </dd>
              </div>
              {result.brand && (
                <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Brand
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">
                    {result.brand}
                  </dd>
                </div>
              )}
              {result.model && (
                <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Model
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">
                    {result.model}
                  </dd>
                </div>
              )}
              <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Database Status
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {result.found ? 'Record found' : 'No record found'}
                </dd>
              </div>
              {result.reported_date && (
                <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Reported Date
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">
                    {result.reported_date}
                  </dd>
                </div>
              )}
              {result.report_reference && (
                <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Report Reference
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-ink">
                    {result.report_reference}
                  </dd>
                </div>
              )}
              {result.source && (
                <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Source
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">
                    {result.source}
                  </dd>
                </div>
              )}
            </dl>

            {/* Safety advice (backend message, unchanged) */}
            {result.safety_message && (
              <div className="flex gap-3 rounded-xl bg-primary-50 p-4 ring-1 ring-inset ring-primary-100">
                <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
                <div>
                  <p className="text-sm font-semibold text-primary-900">
                    Safety Advice
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-primary-900/80">
                    {result.safety_message}
                  </p>
                </div>
              </div>
            )}

            <Link
              to={`/risk-check?imei=${encodeURIComponent(result.imei)}`}
              className="btn-primary w-full"
            >
              Check Risk for this IMEI
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}


      {result && (
        <div className="mt-6 space-y-3">
          {(statusKey === 'STOLEN' || statusKey === 'SUSPICIOUS') && (
            <Link
              to={`/report-stolen?imei=${encodeURIComponent(result.imei)}`}
              className="btn-primary w-full"
            >
              ⚠️ Report This Stolen Phone
            </Link>
          )}

          <p className="px-1 text-center text-xs leading-relaxed text-ink-faint">
            For additional official verification, you may check{' '}
            <a
              href="https://web.cplc.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink-muted underline underline-offset-2 hover:text-primary-600"
            >
              CPLC
            </a>{' '}
            or dial{' '}
            <span className="font-mono font-semibold text-ink-muted">*8484#</span>.
          </p>

          <button
            type="button"
            onClick={handleCheckAnother}
            className="btn-secondary w-full"
          >
            Check Another IMEI
          </button>
        </div>
      )}
    </div>
  )
}
