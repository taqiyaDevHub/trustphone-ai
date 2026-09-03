import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'

const STATUS_CLASS = {
  CLEAN: 'status-clean',
  STOLEN: 'status-stolen',
  BLOCKED: 'status-blocked',
  SUSPICIOUS: 'status-suspicious',
  UNDER_REVIEW: 'status-under-review',
  UNKNOWN: 'status-unknown',
}

const RESULT_CARD_CLASS = {
  CLEAN: 'result-clean',
  STOLEN: 'result-stolen',
  BLOCKED: 'result-blocked',
  SUSPICIOUS: 'result-suspicious',
  UNDER_REVIEW: 'result-under-review',
  UNKNOWN: 'result-unknown',
}

export default function VerifyPhone() {
  const [searchParams] = useSearchParams()
  const [imei, setImei] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

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

  const statusKey = (result?.status || 'UNKNOWN').toUpperCase()

  return (
    <div className="page-container">
      <h1 className="page-title">Verify Phone</h1>
      <p className="mt-2 text-muted">
        Enter a 15-digit IMEI to check the device status.
      </p>

      <div className="card mt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="imei" className="block text-sm font-medium text-white">
              IMEI Number
            </label>
            <div className="relative mt-2">
              <input
                id="imei"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={15}
                value={imei}
                onChange={handleChange}
                placeholder="e.g. 351234567890123"
                className="input font-mono text-lg tracking-widest"
                disabled={loading}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
                {imei.length}/15
              </span>
            </div>
            {(showValidationError || error) && (
              <p className="mt-2 text-sm font-medium text-red-400" aria-live="polite">
                {error || 'IMEI must be exactly 15 digits.'}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isValid}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Verifying…
              </span>
            ) : (
              'Verify Phone'
            )}
          </button>
        </form>
      </div>

      {result && (
        <div className={`card mt-6 ${RESULT_CARD_CLASS[statusKey] || 'result-unknown'}`} aria-live="polite">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-semibold text-white">Verification Result</h2>
            <span className={STATUS_CLASS[statusKey] || 'status-unknown'}>
              {result.status_label || result.status}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">IMEI</dt>
              <dd className="font-mono text-white">{result.imei}</dd>
            </div>
            {result.brand && (
              <div>
                <dt className="text-sm text-muted">Brand</dt>
                <dd className="text-white">{result.brand}</dd>
              </div>
            )}
            {result.model && (
              <div>
                <dt className="text-sm text-muted">Model</dt>
                <dd className="text-white">{result.model}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted">Database Status</dt>
              <dd className="text-white">
                {result.found ? 'Record found' : 'No record found'}
              </dd>
            </div>
            {result.reported_date && (
              <div>
                <dt className="text-sm text-muted">Reported Date</dt>
                <dd className="text-white">{result.reported_date}</dd>
              </div>
            )}
            {result.report_reference && (
              <div>
                <dt className="text-sm text-muted">Report Reference</dt>
                <dd className="font-mono text-white">{result.report_reference}</dd>
              </div>
            )}
            {result.source && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted">Source</dt>
                <dd className="text-white">{result.source}</dd>
              </div>
            )}
          </dl>

          <Link
            to={`/risk-check?imei=${encodeURIComponent(result.imei)}`}
            className="btn-secondary mt-5 block w-full text-center"
          >
            Check Risk for this IMEI
          </Link>

          {result.safety_message && (
            <div className="mt-5 rounded-lg bg-navy p-4 ring-1 ring-border">
              <p className="text-sm font-medium text-cyan">Safety Advice</p>
              <p className="mt-1 text-white">{result.safety_message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
