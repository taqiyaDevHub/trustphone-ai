import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
const MAX_SIZE_MB = 10

export default function ScanImei() {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [detectedImei, setDetectedImei] = useState('')
  const [manualImei, setManualImei] = useState('')

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const validateFile = (selectedFile) => {
    if (!selectedFile) {
      return 'Please select an image.'
    }
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      return 'Unsupported file type. Please upload JPG, PNG, or WebP.'
    }
    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File too large. Max size is ${MAX_SIZE_MB} MB.`
    }
    return null
  }

  const handleFileSelect = (selectedFile) => {
    setError(null)
    setResult(null)
    setDetectedImei('')
    setManualImei('')

    const validationError = validateFile(selectedFile)
    if (validationError) {
      setError(validationError)
      setFile(null)
      return
    }

    setFile(selectedFile)
    uploadImage(selectedFile)
  }

  const uploadImage = async (imageFile) => {
    setScanning(true)
    setError(null)
    setResult(null)

    try {
      const data = await api.scanImei(imageFile)
      if (!data || data.success === false) {
        setError(data?.message || 'Scan failed. Please try again.')
      } else {
        setResult(data)
        if (data.detected_imei) {
          setDetectedImei(data.detected_imei)
        }
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setScanning(false)
    }
  }

  const handleInputChange = (e) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  const triggerFileSelect = (capture) => {
    const input = fileInputRef.current
    if (!input) return
    input.accept = 'image/*'
    if (capture) {
      input.capture = 'environment'
    } else {
      input.removeAttribute('capture')
    }
    input.click()
  }

  const handleRetry = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setDetectedImei('')
    setManualImei('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCandidateClick = (candidate) => {
    setDetectedImei(candidate)
  }

  const handleDetectedChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 15)
    setDetectedImei(value)
  }

  const handleManualChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 15)
    setManualImei(value)
  }

  const verifyUrl = (imei) => `/verify?imei=${encodeURIComponent(imei)}`

  const hasDetected = /^\d{15}$/.test(detectedImei)
  const hasManual = /^\d{15}$/.test(manualImei)

  return (
    <div className="page-container">
      <h1 className="page-title">Scan IMEI</h1>
      <p className="mt-2 text-muted">
        Take or upload a photo of the IMEI label or box.
      </p>

      <div className="card mt-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleInputChange}
        />

        {!file && !scanning && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => triggerFileSelect(true)}
              className="btn-primary w-full"
            >
              Scan Box Photo
            </button>
            <button
              type="button"
              onClick={() => triggerFileSelect(false)}
              className="btn-secondary w-full"
            >
              Choose from Gallery
            </button>
          </div>
        )}

        {preview && (
          <div className="relative">
            <img
              src={preview}
              alt="IMEI preview"
              className="w-full rounded-lg object-contain ring-1 ring-border"
            />
            {scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-navy/80">
                <svg
                  className="h-8 w-8 animate-spin text-cyan"
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
                <p className="mt-3 text-sm font-medium text-white">Scanning…</p>
              </div>
            )}
          </div>
        )}

        {!scanning && file && (
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => triggerFileSelect(false)}
              className="btn-secondary flex-1"
            >
              Pick Another Image
            </button>
            <button
              type="button"
              onClick={handleRetry}
              className="btn-secondary flex-1"
            >
              Reset
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 p-4 ring-1 ring-red-500/20" aria-live="polite">
            <p className="text-sm font-medium text-red-400">{error}</p>
          </div>
        )}
      </div>

      {result && !scanning && (
        <div className="card mt-6" aria-live="polite">
          <h2 className="text-lg font-semibold text-white">Scan Result</h2>

          {result.detected_imei ? (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="detected-imei" className="block text-sm font-medium text-white">
                  Detected IMEI
                </label>
                <input
                  id="detected-imei"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={15}
                  value={detectedImei}
                  onChange={handleDetectedChange}
                  className="input mt-2 font-mono text-lg tracking-widest"
                />
                <p className="mt-2 text-sm text-muted">
                  Review or edit the IMEI before verifying.
                </p>
              </div>

              {result.confidence !== undefined && result.confidence !== null && (
                <p className="text-sm text-muted">
                  Confidence: <span className="text-white">{Math.round(result.confidence * 100)}%</span>
                </p>
              )}

              <Link
                to={verifyUrl(detectedImei)}
                className={`btn-primary block w-full text-center ${!hasDetected ? 'pointer-events-none opacity-60' : ''}`}
              >
                Verify Phone
              </Link>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-muted">No IMEI was detected in this image.</p>
            </div>
          )}

          {result.candidate_imeis && result.candidate_imeis.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-medium text-white">Candidate IMEIs</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.candidate_imeis.map((candidate, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleCandidateClick(candidate)}
                    className="rounded-lg bg-navy px-3 py-2 text-sm font-mono text-white ring-1 ring-border transition-colors hover:bg-border"
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            </div>
          )}

          {result.extracted_text && (
            <div className="mt-5 rounded-lg bg-navy p-4 ring-1 ring-border">
              <p className="text-sm font-medium text-muted">Extracted Text</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white">
                {result.extracted_text}
              </p>
            </div>
          )}

          {!result.detected_imei && (
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="manual-imei" className="block text-sm font-medium text-white">
                  Enter IMEI manually
                </label>
                <input
                  id="manual-imei"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={15}
                  value={manualImei}
                  onChange={handleManualChange}
                  placeholder="e.g. 351234567890123"
                  className="input mt-2 font-mono text-lg tracking-widest"
                />
              </div>
              <Link
                to={verifyUrl(manualImei)}
                className={`btn-primary block w-full text-center ${!hasManual ? 'pointer-events-none opacity-60' : ''}`}
              >
                Verify Phone
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="card mt-6">
        <p className="text-sm text-muted">
          You can also dial <span className="font-mono font-semibold text-white">*#06#</span>{' '}
          on the phone to display its IMEI.
        </p>
      </div>
    </div>
  )
}
