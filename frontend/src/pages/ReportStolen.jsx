import { useRef, useState } from 'react'
import { api } from '../services/api'

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
  const [evidenceError, setEvidenceError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

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
      <p className="mt-2 text-muted">
        Report a stolen phone with supporting details to help buyers avoid it.
      </p>

      {!result && (
        <div className="card mt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="owner_name"
                className="block text-sm font-medium text-white"
              >
                Owner Name <span className="text-red-400">*</span>
              </label>
              <input
                id="owner_name"
                type="text"
                value={form.owner_name}
                onChange={handleChange('owner_name')}
                placeholder="Your full name"
                className="input mt-2"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="contact_number"
                className="block text-sm font-medium text-white"
              >
                Contact Number <span className="text-red-400">*</span>
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
              />
            </div>

            <div>
              <label
                htmlFor="report-imei"
                className="block text-sm font-medium text-white"
              >
                IMEI Number <span className="text-red-400">*</span>
              </label>
              <input
                id="report-imei"
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="brand"
                  className="block text-sm font-medium text-white"
                >
                  Brand <span className="text-red-400">*</span>
                </label>
                <input
                  id="brand"
                  type="text"
                  value={form.brand}
                  onChange={handleChange('brand')}
                  placeholder="e.g. Samsung"
                  className="input mt-2"
                  disabled={loading}
                />
              </div>
              <div>
                <label
                  htmlFor="model"
                  className="block text-sm font-medium text-white"
                >
                  Model <span className="text-red-400">*</span>
                </label>
                <input
                  id="model"
                  type="text"
                  value={form.model}
                  onChange={handleChange('model')}
                  placeholder="e.g. Galaxy S21"
                  className="input mt-2"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="incident_date"
                className="block text-sm font-medium text-white"
              >
                Incident Date <span className="text-red-400">*</span>
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
              <label
                htmlFor="incident_location"
                className="block text-sm font-medium text-white"
              >
                Incident Location <span className="text-red-400">*</span>
              </label>
              <input
                id="incident_location"
                type="text"
                value={form.incident_location}
                onChange={handleChange('incident_location')}
                placeholder="e.g. Karachi, Sindh"
                className="input mt-2"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="fir_number"
                className="block text-sm font-medium text-white"
              >
                FIR Number <span className="text-muted text-xs">(optional)</span>
              </label>
              <input
                id="fir_number"
                type="text"
                value={form.fir_number}
                onChange={handleChange('fir_number')}
                placeholder="e.g. FIR-123/2024"
                className="input mt-2"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="evidence"
                className="block text-sm font-medium text-white"
              >
                Evidence (Photo) <span className="text-muted text-xs">(optional)</span>
              </label>
              <input
                ref={fileInputRef}
                id="evidence"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700"
                disabled={loading}
              />
              {evidence && (
                <p className="mt-2 text-sm text-muted">
                  Selected: {evidence.name}
                </p>
              )}
              {evidenceError && (
                <p className="mt-2 text-sm font-medium text-red-400">
                  {evidenceError}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 p-4 ring-1 ring-red-500/20">
                <p className="text-sm font-medium text-red-400">{error}</p>
              </div>
            )}

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
                  Submitting…
                </span>
              ) : (
                'Submit Report'
              )}
            </button>
          </form>
        </div>
      )}

      {result && (
        <div className="card mt-6">
          <h2 className="text-lg font-semibold text-white">Report Submitted</h2>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Report Reference</dt>
              <dd className="font-mono text-white">{result.report_reference}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Submitted Date</dt>
              <dd className="text-white">{result.submitted_date}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Verification Status</dt>
              <dd>
                <span
                  className={
                    VERIFICATION_CLASS[verificationStatusKey] || 'status-unknown'
                  }
                >
                  {result.verification_status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Evidence Consistency</dt>
              <dd>
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
            <p className="mt-5 text-sm text-muted">{result.message}</p>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="btn-secondary mt-5 w-full"
          >
            Submit Another Report
          </button>
        </div>
      )}
    </div>
  )
}
