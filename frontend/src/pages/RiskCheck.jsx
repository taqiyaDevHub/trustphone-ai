import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'

const RISK_CLASS = {
  LOW: 'risk-low',
  MEDIUM: 'risk-medium',
  HIGH: 'risk-high',
}

export default function RiskCheck() {
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({
    imei: '',
    seller_phone: '',
    asking_price: '',
    reference_market_price: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    const initial = searchParams.get('imei')
    if (initial) {
      const cleaned = initial.replace(/\D/g, '').slice(0, 15)
      setForm((prev) => ({ ...prev, imei: cleaned }))
    }
  }, [searchParams])

  const isValidImei = /^\d{15}$/.test(form.imei)
  const isValidPhone = /^\d{10,15}$/.test(form.seller_phone)
  const isValidPrice = (value) =>
    value !== '' && !isNaN(value) && Number(value) > 0
  const isValid =
    isValidImei &&
    isValidPhone &&
    isValidPrice(form.asking_price) &&
    isValidPrice(form.reference_market_price)

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
    setError(null)
    setResult(null)

    if (!isValid) {
      setError('Please fill in all fields correctly.')
      return
    }

    setLoading(true)
    try {
      const data = await api.getRiskScore({
        imei: form.imei,
        seller_phone: form.seller_phone,
        asking_price: Number(form.asking_price),
        reference_market_price: Number(form.reference_market_price),
      })
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
  const isInsufficient = result?.data_sufficiency === 'INSUFFICIENT'

  return (
    <div className="page-container">
      <h1 className="page-title">AI Risk Assessment</h1>
      <p className="mt-2 text-muted">
        Evaluate the risk of a second-hand phone transaction before you pay.
      </p>

      <div className="card mt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="risk-imei"
              className="block text-sm font-medium text-white"
            >
              IMEI Number
            </label>
            <input
              id="risk-imei"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={15}
              value={form.imei}
              onChange={handleChange('imei')}
              placeholder="e.g. 351234567890123"
              className="input mt-2 font-mono text-lg tracking-widest"
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="seller_phone"
              className="block text-sm font-medium text-white"
            >
              Seller Phone Number
            </label>
            <input
              id="seller_phone"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={15}
              value={form.seller_phone}
              onChange={handleChange('seller_phone')}
              placeholder="e.g. 03001234567"
              className="input mt-2"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="asking_price"
                className="block text-sm font-medium text-white"
              >
                Asking Price
              </label>
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
              <label
                htmlFor="reference_market_price"
                className="block text-sm font-medium text-white"
              >
                Reference Market Price
              </label>
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

          {error && (
            <div className="rounded-lg bg-red-500/10 p-4 ring-1 ring-red-500/20">
              <p className="text-sm font-medium text-red-400">{error}</p>
            </div>
          )}

          <div className="rounded-lg bg-navy/50 p-4 ring-1 ring-border">
            <p className="text-xs text-muted">
              This assessment is based on available demo and synthetic data. It does
              not guarantee safety or confirm fraud. Always exercise personal caution.
            </p>
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
                Assessing Risk…
              </span>
            ) : (
              'Check Risk'
            )}
          </button>
        </form>
      </div>

      {result && (
        <div className="card mt-6">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-semibold text-white">
              Risk Assessment
            </h2>
            <span className={RISK_CLASS[riskKey] || 'status-unknown'}>
              {result.risk_level || 'Unknown'}
            </span>
          </div>

          {isInsufficient ? (
            <div className="mt-4 rounded-lg bg-navy p-4 ring-1 ring-border">
              <p className="text-sm font-medium text-amber-400">
                Insufficient Data
              </p>
              <p className="mt-1 text-white">{result.safety_advice}</p>
            </div>
          ) : (
            <>
              {result.risk_score !== undefined && result.risk_score !== null && (
                <p className="mt-4 text-muted">
                  Risk Score:{" "}
                  <span className="text-white">{result.risk_score}/100</span>
                </p>
              )}

              {result.data_sufficiency && (
                <p className="mt-2 text-sm text-muted">
                  Data Sufficiency:{" "}
                  <span className="text-white">{result.data_sufficiency}</span>
                </p>
              )}

              {result.key_factors && result.key_factors.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-white">Key Factors</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
                    {result.key_factors.map((factor, idx) => (
                      <li key={idx} className="text-white">
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.safety_advice && (
                <div className="mt-5 rounded-lg bg-navy p-4 ring-1 ring-border">
                  <p className="text-sm font-medium text-cyan">Safety Advice</p>
                  <p className="mt-1 text-white">{result.safety_advice}</p>
                </div>
              )}
            </>
          )}

          <div className="mt-5 rounded-lg bg-navy/50 p-3 ring-1 ring-border">
            <p className="text-xs text-muted">
              Prototype disclaimer: This risk assessment is generated from synthetic
              demo data. It does not guarantee device safety or confirm fraud.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
