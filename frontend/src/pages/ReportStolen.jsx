import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import {
  UploadIcon,
  XIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  CopyIcon,
  CheckIcon,
  FlagIcon,
  Spinner,
} from '../components/icons'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
const MAX_SIZE_MB = 10

const EVIDENCE_CLASS = {
  PASS: 'status-clean',
  MISMATCH: 'status-stolen',
  NOT_CHECKED: 'status-unknown',
}

const VERIFICATION_CLASS = {
  VERIFIED: 'status-clean',
  UNDER_REVIEW: 'status-under-review',
  REJECTED: 'status-stolen',
}

export default function ReportStolen() {
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef(null)
  const [form, setForm] = useState({
    owner_name: '',
    contact_number: '',
    imei: '',
    brand: '',
    model: '',
    incident_date: '',
    incident_location: '',
    fir_number: '',
  })
  const [evidence, setEvidence] = useState(null)
  const [evidencePreview, setEvidencePreview] = useState(null)
  const [evidenceError, setEvidenceError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  // Reuses the app's existing ?imei= deep-link mechanism (same as Scan IMEI ->
  // Verify Phone and Verify Phone -> Risk Check) to pre-fill ONLY the IMEI when
  // arriving from the Verify Phone "Report This Stolen Phone" CTA. No other
  // field is pre-filled or inferred; validation and submission are unchanged.
  useEffect(() => {
    const initial = searchParams.get('imei')
    if (initial) {
      const cleaned = initial.replace(/\D/g, '').slice(0, 15)
      setForm((prev) => ({ ...prev, imei: cleaned }))
    }
  }, [searchParams])

  useEffect(() => {
    if (!evidence) {
      setEvidencePreview(null)
      return
    }
    const url = URL.createObjectURL(evidence)
    setEvidencePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [evidence])

  const isValidImei = /^\d{15}$/.test(form.imei)
  const isValidPhone = /^\d{10,15}$/.test(form.contact_number)
  const isValid =
    form.owner_name.trim().length > 0 &&
    isValidPhone &&
    isValidImei &&
    form.brand.trim().length > 0 &&
    form.model.trim().length > 0 &&
    form.incident_date.length > 0 &&
    form.incident_location.trim().length > 0

  const handleChange = (field) => (e) => {
    let value = e.target.value
    if (field === 'imei') {
      value = value.replace(/\D/g, '').slice(0, 15)
    } else if (field === 'contact_number') {
      value = value.replace(/\D/g, '').slice(0, 15)
    }
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const validateFile = (file) => {
    if (!file) {
      return null
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Unsupported file type. Please upload JPG, PNG, or WebP.'
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File too large. Max size is ${MAX_SIZE_MB} MB.`
    }
    return null
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    setEvidenceError(null)
    if (!file) {
      setEvidence(null)
      return
    }
    const validationError = validateFile(file)
    if (validationError) {
      setEvidenceError(validationError)
      setEvidence(null)
      return
    }
    setEvidence(file)
  }

  const handleRemoveEvidence = () => {
    setEvidence(null)
    setEvidenceError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCopyReference = async () => {
    if (!result?.report_reference) return
    try {
      await navigator.clipboard.writeText(result.report_reference)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — non-critical */
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!isValid) {
      setError('Please fill in all required fields correctly.')
      return
    }

    const formData = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      if (value !== '') {
        formData.append(key, value)
      }
    })
    if (evidence) {
      formData.append('evidence', evidence)
    }

    setLoading(true)
    try {
      const data = await api.reportStolen(formData)
      if (!data || data.success === false) {
        setError(
          data?.error?.message || 'Unable to submit report. Please try again.'
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

  const handleReset = () => {
    setForm({
      owner_name: '',
      contact_number: '',
      imei: '',
      brand: '',
      model: '',
      incident_date: '',
      incident_location: '',
      fir_number: '',
    })
    setEvidence(null)
    setEvidenceError(null)
    setError(null)
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const evidenceStatusKey = (
    result?.evidence_consistency_status || 'NOT_CHECKED'
  ).toUpperCase()
  const verificationStatusKey = (
    result?.verification_status || 'UNDER_REVIEW'
  ).toUpperCase()

  return (
    <div className="page-container">
      <h1 className="page-title">Report Stolen</h1>
      <p className="page-subtitle">
        Report a stolen phone with supporting details to help buyers avoid it.
      </p>

      {!result && (
        <div className="card mt-6 p-5 sm:p-7">
          <p className="mb-6 text-xs text-ink-faint">
            <span className="font-semibold text-red-500">*</span> Required
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* ---- Your details ---- */}
            <div>
              <p className="section-label">Your Details</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="owner_name" className="field-label">
                    Owner Name
                    <span className="field-required">*</span>
                  </label>
                  <input
                    id="owner_name"
                    type="text"
                    value={form.owner_name}
                    onChange={handleChange('owner_name')}
                    placeholder="Your full name"
                    className="input mt-2"
                    disabled={loading}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="contact_number" className="field-label">
                    Contact Number
                    <span className="field-required">*</span>
                  </label>
                  <input
                    id="contact_number"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    value={form.contact_number}
                    onChange={handleChange('contact_number')}
                    placeholder="e.g. 03001234567"
                    className="input mt-2"
                    disabled={loading}
                    autoComplete="tel"
                  />
                </div>
              </div>
            </div>

            {/* ---- Device details ---- */}
            <div className="border-t border-line pt-6">
              <p className="section-label">Device Details</p>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="report-imei" className="field-label">
                    IMEI Number
                    <span className="field-required">*</span>
                  </label>
                  <div className="relative mt-2">
                    <input
                      id="report-imei"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={15}
                      value={form.imei}
                      onChange={handleChange('imei')}
                      placeholder="e.g. 351234567890123"
                      className="input input-mono pr-20"
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="brand" className="field-label">
                      Brand
                      <span className="field-required">*</span>
                    </label>
                    <input
                      id="brand"
                      type="text"
                      value={form.brand}
                      onChange={handleChange('brand')}
                      placeholder="e.g. Samsung"
                      className="input mt-2"
                      disabled={loading}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="model" className="field-label">
                      Model
                      <span className="field-required">*</span>
                    </label>
                    <input
                      id="model"
                      type="text"
                      value={form.model}
                      onChange={handleChange('model')}
                      placeholder="e.g. Galaxy S21"
                      className="input mt-2"
                      disabled={loading}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ---- Incident details ---- */}
            <div className="border-t border-line pt-6">
              <p className="section-label">Incident Details</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="incident_date" className="field-label">
                    Incident Date
                    <span className="field-required">*</span>
                  </label>
                  <input
                    id="incident_date"
                    type="date"
                    value={form.incident_date}
                    onChange={handleChange('incident_date')}
                    className="input mt-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="incident_location" className="field-label">
                    Incident Location
                    <span className="field-required">*</span>
                  </label>
                  <input
                    id="incident_location"
                    type="text"
                    value={form.incident_location}
                    onChange={handleChange('incident_location')}
                    placeholder="e.g. Karachi, Sindh"
                    className="input mt-2"
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="fir_number" className="field-label">
                    FIR Number
                    <span className="ml-1.5 text-xs font-normal text-ink-faint">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="fir_number"
                    type="text"
                    value={form.fir_number}
                    onChange={handleChange('fir_number')}
                    placeholder="e.g. FIR-123/2024"
                    className="input mt-2"
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            {/* ---- Evidence ---- */}
            <div className="border-t border-line pt-6">
              <p className="section-label">Evidence</p>
              <input
                ref={fileInputRef}
                id="evidence"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
                aria-label="Upload evidence photo"
              />

              {!evidence ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/30 disabled:opacity-50"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
                    <UploadIcon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    Add a photo of the box or receipt
                  </span>
                  <span className="text-xs text-ink-muted">
                    Optional · JPG, PNG or WebP · up to {MAX_SIZE_MB} MB
                  </span>
                </button>
              ) : (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50/80 p-3 ring-1 ring-inset ring-line/70">
                  {evidencePreview && (
                    <img
                      src={evidencePreview}
                      alt="Evidence preview"
                      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-line"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {evidence.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {(evidence.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveEvidence}
                    disabled={loading}
                    aria-label="Remove evidence photo"
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              )}

              {evidenceError && (
                <p
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-600"
                  role="alert"
                >
                  <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                  {evidenceError}
                </p>
              )}
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
                  Submitting…
                </>
              ) : (
                <>
                  <FlagIcon className="h-4 w-4" />
                  Submit Report
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ---- Success state ---- */}
      {result && (
        <div className="card animate-scale-in mt-6 overflow-hidden" aria-live="polite">
          <div className="flex items-center gap-4 bg-emerald-50 p-5 ring-1 ring-inset ring-emerald-200 sm:px-7">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <CheckCircleIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700/70">
                Report Submitted
              </p>
              <p className="text-xl font-bold text-emerald-900">
                Thank you for reporting
              </p>
            </div>
          </div>

          <div className="space-y-6 p-5 sm:p-7">
            {/* Reference number */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/80 px-4 py-3.5 ring-1 ring-inset ring-line/70">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Report Reference
                </p>
                <p className="mt-0.5 truncate font-mono text-lg font-bold text-ink">
                  {result.report_reference}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyReference}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-primary-600 hover:ring-primary-300"
                aria-label="Copy report reference"
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* Status details */}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Submitted Date
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {result.submitted_date}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Verification Status
                </dt>
                <dd className="mt-1">
                  <span
                    className={
                      VERIFICATION_CLASS[verificationStatusKey] ||
                      'status-unknown'
                    }
                  >
                    {result.verification_status}
                  </span>
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-line/70 sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Evidence Consistency
                </dt>
                <dd className="mt-1">
                  <span
                    className={
                      EVIDENCE_CLASS[evidenceStatusKey] || 'status-unknown'
                    }
                  >
                    {result.evidence_consistency_status}
                  </span>
                </dd>
              </div>
            </dl>

            {result.message && (
              <p className="text-sm leading-relaxed text-ink-soft">
                {result.message}
              </p>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="btn-secondary w-full"
            >
              Submit Another Report
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
