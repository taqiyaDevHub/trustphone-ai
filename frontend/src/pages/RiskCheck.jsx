import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import {
  HashIcon,
  PhoneIcon,
  GaugeIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ShieldAlertIcon,
  ChevronRightIcon,
  InfoIcon,
  AlertCircleIcon,
  Spinner,
} from '../components/icons'

const RISK_META = {
  LOW: {
    badge: 'risk-low',
    Icon: CheckCircleIcon,
    banner: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    scoreColor: 'text-emerald-600',
    adviceWrap: 'bg-emerald-50 ring-emerald-200',
    adviceTitle: 'text-emerald-900',
    adviceBody: 'text-emerald-800/80',
    adviceIcon: 'text-emerald-600',
  },
  MEDIUM: {
    badge: 'risk-medium',
    Icon: AlertTriangleIcon,
    banner: 'bg-amber-50',
    ring: 'ring-amber-200',
    iconWrap: 'bg-amber-100 text-amber-600',
    scoreColor: 'text-amber-600',
    adviceWrap: 'bg-amber-50 ring-amber-200',
    adviceTitle: 'text-amber-900',
    adviceBody: 'text-amber-800/80',
    adviceIcon: 'text-amber-600',
  },
  HIGH: {
    badge: 'risk-high',
    Icon: ShieldAlertIcon,
    banner: 'bg-red-50',
    ring: 'ring-red-200',
    iconWrap: 'bg-red-100 text-red-600',
    scoreColor: 'text-red-600',
    adviceWrap: 'bg-red-50 ring-red-200',
    adviceTitle: 'text-red-900',
    adviceBody: 'text-red-800/80',
    adviceIcon: 'text-red-600',
  },
}

// Specific Key Factor wording keyed by the ACTUAL device status (obtained from
// the existing /api/verify endpoint). Frontend display only — the
// /api/risk-score response is unchanged. Conservative by design: a report is
// only called "confirmed" when the status explicitly supports it.
const STATUS_FACTOR_LABELS = {
  STOLEN: 'Device status: STOLEN — reported in the system.',
  BLOCKED: 'Device status: BLOCKED — blocked in the system.',
  SUSPICIOUS: 'Device status: SUSPICIOUS — flagged for review.',
  UNDER_REVIEW: 'Device status: UNDER_REVIEW — pending review.',
}

const REPORTS_FACTOR_LABELS = {
  STOLEN: 'This device has a confirmed stolen report on file.',
  BLOCKED: 'This device has a confirmed report on file.',
  SUSPICIOUS: 'This device has been flagged in a report.',
  UNDER_REVIEW: 'This device has a report currently under review.',
}

// Rewrites the generic backend Key Factor strings into specific wording using
// the actual device status and the already-calculated price deviation. Falls
// back to the original text whenever the specific data is unavailable, so the
// API's factor set and order are always preserved.
function buildKeyFactors(factors, status, deviationText) {
  if (!Array.isArray(factors)) return factors
  return factors.map((factor) => {
    if (typeof factor !== 'string') return factor
    if (factor.startsWith('Asking price') && deviationText) return deviationText
    if (
      (factor.startsWith('Device status') ||
        factor.startsWith('Device has a pending report')) &&
      status &&
      STATUS_FACTOR_LABELS[status]
    ) {
      return STATUS_FACTOR_LABELS[status]
    }
    if (
      factor.startsWith('Previous reports exist') &&
      status &&
      REPORTS_FACTOR_LABELS[status]
    ) {
      return REPORTS_FACTOR_LABELS[status]
    }
    return factor
  })
}

// Builds the manual OLX price-check URL from the optional Brand/Model fields:
// trimmed, lowercased, spaces -> hyphens, then URL-encoded. Falls back to the
// mobile-phones category when either value is empty.
const OLX_FALLBACK_URL = 'https://www.olx.com.pk/mobile-phones_c1453'
function buildOlxUrl(brand, model) {
  const slugify = (v) => (v || '').trim().toLowerCase().replace(/\s+/g, '-')
  const b = slugify(brand)
  const m = slugify(model)
  if (!b || !m) return OLX_FALLBACK_URL
  return `https://www.olx.com.pk/items/q-${encodeURIComponent(`${b}-${m}`)}`
}

export default function RiskCheck() {
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({
    imei: '',
    seller_phone: '',
    asking_price: '',
    reference_market_price: '',
    // Optional, frontend-only: used solely to build the manual OLX price-check
    // link. NEVER sent to /api/risk-score and never affects the risk score.
    brand: '',
    model: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  // Actual device status (from the existing /api/verify endpoint) and the
  // price-deviation text captured at submit time — used ONLY to render more
  // specific Key Factor wording. Neither is sent to /api/risk-score.
  const [deviceStatus, setDeviceStatus] = useState(null)
  const [submittedDeviation, setSubmittedDeviation] = useState(null)

  useEffect(() => {
    const initial = searchParams.get('imei')
    if (initial) {
      const cleaned = initial.replace(/\D/g, '').slice(0, 15)
      setForm((prev) => ({ ...prev, imei: cleaned }))
    }
  }, [searchParams])

  const isValidImei = /^\d{15}$/.test(form.imei)
  // Seller phone is OPTIONAL: empty is valid; if provided it must be 10-15 digits.
  const isValidPhone =
    form.seller_phone === '' || /^\d{10,15}$/.test(form.seller_phone)
  const isValidPrice = (value) =>
    value !== '' && !isNaN(value) && Number(value) > 0
  const isValid =
    isValidImei &&
    isValidPhone &&
    isValidPrice(form.asking_price) &&
    isValidPrice(form.reference_market_price)

  // Reuses the EXACT same symmetric price-deviation calculation for both the
  // live pre-submission hint and the Key Factor wording, so they always match.
  const computeDeviationText = (askingValue, marketValue) => {
    if (!isValidPrice(askingValue) || !isValidPrice(marketValue)) return null
    const asking = Number(askingValue)
    const market = Number(marketValue)
    const pct = Math.round((Math.abs(asking - market) / market) * 100)
    if (asking === market) {
      return 'Asking price matches the reference market price.'
    } else if (asking < market) {
      return `Asking price is ${pct}% below the reference market price.`
    }
    return `Asking price is ${pct}% above the reference market price.`
  }

  // Informational only: shows how far the asking price sits from the
  // reference price while the user types (symmetric, like the backend).
  const deviationHint = computeDeviationText(
    form.asking_price,
    form.reference_market_price
  )

  const handleChange = (field) => (e) => {
    let value = e.target.value
    if (field === 'imei') {
      value = value.replace(/\D/g, '').slice(0, 15)
    } else if (field === 'seller_phone') {
      value = value.replace(/\D/g, '').slice(0, 15)
    }
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Prevent duplicate submissions while a request is already in progress.
    if (loading) return
    setError(null)
    setResult(null)
    setDeviceStatus(null)
    setSubmittedDeviation(null)

    if (!isValid) {
      setError('Please fill in all fields correctly.')
      return
    }

    // Capture the deviation wording from the SUBMITTED prices so the Key Factor
    // stays consistent even if the fields are edited afterwards.
    const deviationText = computeDeviationText(
      form.asking_price,
      form.reference_market_price
    )

    setLoading(true)
    try {
      // Brand/Model are intentionally OMITTED — the /api/risk-score payload is
      // unchanged. The verify call hits the EXISTING endpoint only to learn the
      // actual device status for specific Key Factor wording; its failure must
      // never block the risk assessment.
      const [data, verifyData] = await Promise.all([
        api.getRiskScore({
          imei: form.imei,
          seller_phone: form.seller_phone,
          asking_price: Number(form.asking_price),
          reference_market_price: Number(form.reference_market_price),
        }),
        api.verifyImei(form.imei).catch(() => null),
      ])
      setSubmittedDeviation(deviationText)
      setDeviceStatus(verifyData?.status || null)
      if (!data || data.success === false) {
        if (data?.data_sufficiency === 'INSUFFICIENT') {
          setResult(data)
        } else {
          setError(
            data?.error?.message || 'Unable to assess risk. Please try again.'
          )
        }
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const riskKey = (result?.risk_level || '').toUpperCase()
  const meta = RISK_META[riskKey] || null
  const isInsufficient = result?.data_sufficiency === 'INSUFFICIENT'
  const riskScore =
    result && result.risk_score !== undefined && result.risk_score !== null
      ? Math.max(0, Math.min(100, Number(result.risk_score)))
      : null
  // Key Factors with specific wording (actual status + exact price deviation),
  // and the manual OLX price-check URL built from the optional Brand/Model.
  const displayKeyFactors = buildKeyFactors(
    result?.key_factors,
    deviceStatus,
    submittedDeviation
  )
  const olxUrl = buildOlxUrl(form.brand, form.model)

  return (
    <div className="page-container">
      <h1 className="page-title">AI Risk Assessment</h1>
      <p className="page-subtitle">
        Evaluate the risk of a second-hand phone transaction before you pay.
      </p>

      {/* ---- Form ---- */}
      <div className="card mt-6 p-5 sm:p-7">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Device */}
          <div>
            <p className="section-label">Device</p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="risk-imei" className="field-label">
                  IMEI Number
                </label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">
                    <HashIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="risk-imei"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    value={form.imei}
                    onChange={handleChange('imei')}
                    placeholder="e.g. 351234567890123"
                    className="input input-mono pl-11 pr-20"
                    disabled={loading}
                    autoComplete="off"
                  />
                  <span
                    aria-hidden="true"
                    className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      isValidImei
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-ink-faint'
                    }`}
                  >
                    {form.imei.length}/15
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="seller_phone" className="field-label">
                  Seller Phone Number (Optional)
                </label>
                <p className="field-hint">
                  If available, you may provide the number used by the seller
                  for additional transaction context.
                </p>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">
                    <PhoneIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="seller_phone"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    value={form.seller_phone}
                    onChange={handleChange('seller_phone')}
                    placeholder="e.g. 03001234567"
                    className="input pl-11"
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Transaction */}
          <div className="border-t border-line pt-6">
            <p className="section-label">Transaction</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="asking_price" className="field-label">
                  Asking Price
                </label>
                <p className="field-hint">The price the seller is requesting.</p>
                <input
                  id="asking_price"
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.asking_price}
                  onChange={handleChange('asking_price')}
                  placeholder="e.g. 45000"
                  className="input mt-2"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="reference_market_price" className="field-label">
                  Reference Market Price
                </label>
                <p className="field-hint">
                  What this model typically sells for used.
                </p>
                <input
                  id="reference_market_price"
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.reference_market_price}
                  onChange={handleChange('reference_market_price')}
                  placeholder="e.g. 60000"
                  className="input mt-2"
                  disabled={loading}
                />
              </div>
            </div>

            {deviationHint && (
              <div
                className="mt-4 flex items-start gap-2.5 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-900 ring-1 ring-inset ring-primary-100"
                aria-live="polite"
              >
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                {deviationHint}
              </div>
            )}

            {/* Optional Brand/Model + manual OLX price check. Frontend-only:
                these values are NEVER sent to /api/risk-score and never affect
                the risk score. */}
            <div className="mt-6 border-t border-line pt-5">
              <p className="section-label">Price Check (Optional)</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="brand" className="field-label">
                    Brand
                  </label>
                  <input
                    id="brand"
                    type="text"
                    value={form.brand}
                    onChange={handleChange('brand')}
                    placeholder="e.g. Samsung, Apple"
                    className="input mt-2"
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="model" className="field-label">
                    Model
                  </label>
                  <input
                    id="model"
                    type="text"
                    value={form.model}
                    onChange={handleChange('model')}
                    placeholder="e.g. A54, iPhone 11"
                    className="input mt-2"
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="mt-3">
                <a
                  href={olxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                >
                  🔍 Check current prices on OLX
                </a>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  Prices are not fetched automatically — please check manually
                  for accuracy.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="alert-error" role="alert">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isValid}
            className="btn-primary w-full"
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" />
                Analyzing risk with AI model…
              </>
            ) : (
              <>
                <GaugeIcon className="h-4 w-4" />
                Check Risk
              </>
            )}
          </button>
        </form>
      </div>

      {/* ---- Result ---- */}
      {result && (
        <div className="card animate-rise mt-6 overflow-hidden" aria-live="polite">
          {isInsufficient ? (
            <div className="space-y-5 p-5 sm:p-7">
              <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <AlertTriangleIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-amber-900">
                    Insufficient Data
                  </p>
                  <p className="text-xs font-medium text-amber-700">
                    Data sufficiency: {result.data_sufficiency}
                  </p>
                </div>
              </div>
              {result.safety_advice && (
                <p className="text-sm leading-relaxed text-ink-soft">
                  {result.safety_advice}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Level banner */}
              {meta && (
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
                      Risk Assessment
                    </p>
                    <p className="text-xl font-bold text-ink">
                      {result.risk_level} Risk
                    </p>
                  </div>
                  {result.data_sufficiency && (
                    <span className="hidden shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-ink-muted ring-1 ring-inset ring-line sm:inline-flex">
                      {result.data_sufficiency}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-6 p-5 sm:p-7">
                {/* Score + meter */}
                {riskScore !== null && meta && (
                  <div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-5xl font-extrabold leading-none tracking-tight ${meta.scoreColor}`}
                        >
                          {riskScore}
                        </span>
                        <span className="text-lg font-semibold text-ink-faint">
                          / 100
                        </span>
                      </div>
                      <span className={meta.badge}>{result.risk_level}</span>
                    </div>

                    {/* Risk meter */}
                    <div
                      className="relative mt-5"
                      role="img"
                      aria-label={`Risk score ${riskScore} out of 100`}
                    >
                      <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 ring-1 ring-inset ring-black/5" />
                      <div
                        className="absolute -top-[5px] h-4 w-1.5 rounded-full bg-white shadow ring-2 ring-slate-400/60"
                        style={{ left: `calc(${riskScore}% - 3px)` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] font-medium text-ink-faint">
                      <span>0 · Low</span>
                      <span>50 · Medium</span>
                      <span>100 · High</span>
                    </div>
                  </div>
                )}

                {/* Key factors */}
                {displayKeyFactors && displayKeyFactors.length > 0 && (
                  <div>
                    <p className="section-label">Key Factors</p>
                    <ul className="mt-3 space-y-2.5">
                      {displayKeyFactors.map((factor, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                          <span className="text-sm leading-relaxed text-ink-soft">
                            {factor}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Safety advice (backend message, unchanged) */}
                {result.safety_advice && meta && (
                  <div
                    className={`flex gap-3 rounded-xl p-4 ring-1 ring-inset ${meta.adviceWrap}`}
                  >
                    <InfoIcon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${meta.adviceIcon}`}
                    />
                    <div>
                      <p className={`text-sm font-semibold ${meta.adviceTitle}`}>
                        Safety Advice
                      </p>
                      <p
                        className={`mt-0.5 text-sm leading-relaxed ${meta.adviceBody}`}
                      >
                        {result.safety_advice}
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-inset ring-line/70">
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Prototype disclaimer: this risk assessment is generated from
                    synthetic demo data. It does not guarantee device safety or
                    confirm fraud.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
