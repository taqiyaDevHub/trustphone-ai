import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import {
  ScanLineIcon,
  CameraIcon,
  ImageIcon,
  RefreshIcon,
  CheckCircleIcon,
  HelpCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  InfoIcon,
  XIcon,
  Spinner,
} from '../components/icons'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
const MAX_SIZE_MB = 10
// Safety-net timers so the preview can never hang on "Starting camera…".
// Acquisition covers getUserMedia (permission + hardware); ready covers the
// video loadedmetadata/playback phase after the stream is obtained.
const ACQUIRE_TIMEOUT_MS = 20000
const READY_TIMEOUT_MS = 8000
// Virtual/placeholder camera devices (phone mirroring apps, OBS, etc.) stream
// a black frame with their own spinner, which looks exactly like a broken
// preview. If one is selected while a real camera exists, switch away from it.
const VIRTUAL_CAMERA_PATTERN =
  /virtual|obs camera|manycam|snap camera|vcam|epoccam|iriot|ndi|fake|dummy|placeholder/i

export default function ScanImei() {
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mountedRef = useRef(true)
  const readyTimerRef = useRef(null)
  const cameraSessionRef = useRef(0)
  const readySettledRef = useRef(false)
  const deviceIndexRef = useRef(0)
  const darkProbeTimerRef = useRef(null)
  const videoReadyListenersRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [detectedImei, setDetectedImei] = useState('')
  const [manualImei, setManualImei] = useState('')
  const [dragging, setDragging] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [streamVersion, setStreamVersion] = useState(0)
  const [cameraPlaying, setCameraPlaying] = useState(false)
  const [cameraFailMsg, setCameraFailMsg] = useState(null)
  const [previewDark, setPreviewDark] = useState(false)
  const [deviceList, setDeviceList] = useState([])

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
      // A completed scan response (HTTP 200) ALWAYS carries the scan contract,
      // including a `detected_imei` key (null when nothing was found). The
      // legitimate "image scanned but no IMEI detected" outcome returns
      // success:false, so it must populate `result` — that renders the amber
      // "No IMEI detected" banner AND the manual-entry fallback below. Treating
      // it as a hard error previously hid the very manual field the message
      // tells the user to use. Only a missing body or an HTTP-level failure
      // (which carries no `detected_imei` key) is a genuine error.
      if (!data || !('detected_imei' in data)) {
        setError(
          data?.error?.message || data?.message || 'Scan failed. Please try again.',
        )
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

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (scanning) return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) {
      handleFileSelect(dropped)
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

  // ---------------------------------------------------------------------
  // Live camera capture (getUserMedia) with graceful fallback
  // ---------------------------------------------------------------------

  // Feature detection: true only when the browser exposes getUserMedia
  // (requires a secure context — HTTPS or localhost).
  const supportsCamera = () =>
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'

  // Stop every media track so the camera light turns off and nothing is
  // left running. Also clears any pending readiness timer. Safe anytime.
  const stopCameraStream = () => {
    clearTimeout(readyTimerRef.current)
    clearTimeout(darkProbeTimerRef.current)
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Full failure path: release the camera, stop every loading indicator and
  // surface a visible error with a Retry Camera action. "Choose Image" in
  // the dropzone above stays available the whole time.
  const failCamera = (session, message) => {
    if (cameraSessionRef.current !== session) return
    clearTimeout(readyTimerRef.current)
    clearTimeout(darkProbeTimerRef.current)
    stopCameraStream()
    setCameraOpen(false)
    setCameraStarting(false)
    setCameraReady(false)
    setCameraPlaying(false)
    setPreviewDark(false)
    setCameraFailMsg(message)
  }

  // Runs only when the <video> has genuinely loaded playable stream data.
  // Hides the "Starting camera…" overlay and allows Capture to enable.
  const finalizeReady = (video) => {
    if (readySettledRef.current) return
    readySettledRef.current = true
    clearTimeout(readyTimerRef.current)
    setCameraStarting(false)
    setCameraReady(true)

    // Explicitly handle play() and a possible rejection (autoplay policy).
    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Retry muted — the preview is silent anyway.
        video.muted = true
        const retry = video.play()
        if (retry && typeof retry.catch === 'function') {
          retry.catch(() => {
            // Playback genuinely failed: stop loading, release the camera
            // and offer Retry Camera instead of a dead preview.
            if (videoRef.current === video && streamRef.current) {
              failCamera(
                cameraSessionRef.current,
                'The camera preview could not start playing. Please retry, or use "Choose Image" to upload a photo instead.'
              )
            }
          })
        }
      })
    }
  }

  // Attach the MediaStream to the <video> element and wait for real readiness
  // events (loadedmetadata / canplay) before declaring the preview usable.
  const attachStream = (video, stream) => {
    const previous = videoReadyListenersRef.current
    if (previous) {
      previous.names.forEach((name) =>
        video.removeEventListener(name, previous.onReady)
      )
    }

    video.muted = true
    video.playsInline = true
    video.srcObject = stream

    const names = ['loadedmetadata', 'loadeddata', 'canplay']
    const onReady = () => {
      // Only declare ready once playable data actually exists.
      if (video.readyState >= 2 && video.videoWidth > 0) {
        names.forEach((name) => video.removeEventListener(name, onReady))
        videoReadyListenersRef.current = null
        finalizeReady(video)
      }
    }
    names.forEach((name) => video.addEventListener(name, onReady))
    videoReadyListenersRef.current = { onReady, names }

    // Fast path: playable data can already be available on some browsers.
    if (video.readyState >= 2 && video.videoWidth > 0) {
      onReady()
    }
  }

  // Attach only AFTER the <video> element exists in the DOM. Runs when the
  // panel opens and whenever a fresh stream is acquired (streamVersion bump).
  useEffect(() => {
    if (!cameraOpen) return
    const video = videoRef.current
    const stream = streamRef.current
    if (video && stream) attachStream(video, stream)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, streamVersion])

  // Track mount state and always release the camera when leaving the page.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cameraSessionRef.current += 1
      stopCameraStream()
    }
  }, [])

  const describeCameraError = (err) => {
    const name = err?.name || ''
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Camera permission was blocked. Allow camera access in your browser, or use "Choose Image" to upload a photo instead.'
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera was found on this device. You can use "Choose Image" to upload a photo instead.'
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Your camera is busy or in use by another app. Close it and try again, or use "Choose Image".'
    }
    return 'Could not start the camera. Please use "Choose Image" to upload a photo instead.'
  }

  // Arm (or re-arm) the safety-net timer so the UI is never stuck on
  // "Starting camera…". On timeout we invalidate the session so a
  // late-resolving stream is released instead of leaking.
  const armReadyTimeout = (session, ms) => {
    clearTimeout(readyTimerRef.current)
    readyTimerRef.current = setTimeout(() => {
      if (cameraSessionRef.current !== session || readySettledRef.current) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        finalizeReady(video) // became playable without our listeners firing
        return
      }
      const hadStream = !!streamRef.current
      failCamera(
        session,
        hadStream
          ? 'The camera turned on but the live preview did not become playable in time. Please retry, or use "Choose Image" to upload a photo instead.'
          : 'The camera did not start in time. Please retry, or use "Choose Image" to upload a photo instead.'
      )
    }, ms)
  }

  // Request a stream, optionally pinned to one specific device.
  const requestStream = async (preferredDeviceId) => {
    if (preferredDeviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: preferredDeviceId } },
        })
      } catch {
        // Device vanished or is busy — fall back to the generic request.
      }
    }
    try {
      // Prefer the rear camera on phones; `ideal` lets desktops gracefully
      // fall back to any available webcam instead of failing outright.
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      })
    } catch (constraintErr) {
      // Retry with any camera if the facing-mode constraint can't be met.
      if (constraintErr?.name === 'OverconstrainedError') {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        })
      }
      throw constraintErr
    }
  }

  // Keep the device list fresh so "Switch Camera" can cycle real devices.
  const refreshDeviceList = async (activeLabel) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameras = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label }))
      setDeviceList(cameras)
      const idx = cameras.findIndex((d) => d.label === activeLabel)
      if (idx >= 0) deviceIndexRef.current = idx
    } catch {
      /* enumeration is best-effort only */
    }
  }

  const startCamera = async (preferredDeviceId = null) => {
    const session = (cameraSessionRef.current += 1)
    // Clean slate for every attempt: release previous tracks, drop the old
    // srcObject and reset all camera UI state.
    readySettledRef.current = true
    stopCameraStream()
    setCameraReady(false)
    setCameraPlaying(false)
    setPreviewDark(false)
    setCameraFailMsg(null)
    setError(null)
    setResult(null)
    setCameraStarting(true)
    setCameraOpen(true)
    readySettledRef.current = false

    // Phase 1 safety net: getUserMedia itself (permission + hardware start).
    armReadyTimeout(session, ACQUIRE_TIMEOUT_MS)

    let stream
    try {
      stream = await requestStream(preferredDeviceId)
    } catch (err) {
      failCamera(session, describeCameraError(err))
      return
    }

    // Cancelled, superseded, or unmounted while awaiting the stream.
    if (cameraSessionRef.current !== session || !mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    // A virtual/placeholder camera streams a black frame, which looks exactly
    // like a broken preview. If the browser handed us one while a real camera
    // exists, switch to the real one before attaching anything.
    if (!preferredDeviceId) {
      const firstTrack = stream.getVideoTracks()[0]
      if (firstTrack && VIRTUAL_CAMERA_PATTERN.test(firstTrack.label)) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const realCamera = devices.find(
            (d) =>
              d.kind === 'videoinput' &&
              d.label &&
              d.label !== firstTrack.label &&
              !VIRTUAL_CAMERA_PATTERN.test(d.label)
          )
          if (realCamera && cameraSessionRef.current === session) {
            const better = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { deviceId: { exact: realCamera.deviceId } },
            })
            stream.getTracks().forEach((track) => track.stop())
            stream = better
          }
        } catch {
          // Keep the stream we already have rather than losing the camera.
        }
      }
    }

    if (cameraSessionRef.current !== session || !mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    await refreshDeviceList(stream.getVideoTracks()[0]?.label)
    if (cameraSessionRef.current !== session) return

    // Store the stream, re-arm a shorter timer for the metadata/play phase,
    // and trigger the attach effect (the <video> element is now mounted).
    streamRef.current = stream
    armReadyTimeout(session, READY_TIMEOUT_MS)
    setStreamVersion((v) => v + 1)
  }

  // Cycle to the next available camera — the escape hatch when auto-selection
  // lands on a covered, shuttered or placeholder device.
  const switchCamera = () => {
    if (deviceList.length < 2) return
    const nextIndex = (deviceIndexRef.current + 1) % deviceList.length
    deviceIndexRef.current = nextIndex
    startCamera(deviceList[nextIndex].deviceId)
  }

  const handleRetryCamera = () => {
    startCamera(null)
  }

  // Live-frame watchdog: once playback starts, sample one frame. A nearly
  // all-black frame means a covered/shuttered/placeholder camera, so we say
  // so honestly instead of pretending the preview is fine.
  const handleVideoPlaying = () => {
    setCameraPlaying(true)
    clearTimeout(darkProbeTimerRef.current)
    darkProbeTimerRef.current = setTimeout(() => {
      const video = videoRef.current
      if (!video || !video.videoWidth || !streamRef.current) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 64
        canvas.height = 36
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, 64, 36)
        const px = ctx.getImageData(0, 0, 64, 36).data
        let sum = 0
        let nearBlack = 0
        const total = 64 * 36
        for (let i = 0; i < px.length; i += 4) {
          const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
          sum += l
          if (l < 8) nearBlack += 1
        }
        const mean = sum / total
        setPreviewDark(mean < 8 && nearBlack / total > 0.9)
      } catch {
        /* frame sampling unavailable — ignore */
      }
    }, 700)
  }

  const handleVideoPause = () => {
    setCameraPlaying(false)
  }

  const closeCamera = () => {
    cameraSessionRef.current += 1 // invalidate any in-flight startCamera
    readySettledRef.current = true // ignore late ready/timeout callbacks
    stopCameraStream() // clears timers, stops tracks, clears srcObject
    setCameraOpen(false)
    setCameraStarting(false)
    setCameraReady(false)
    setCameraPlaying(false)
    setPreviewDark(false)
    setCameraFailMsg(null)
  }

  // Grab the current video frame, turn it into a JPEG File, and hand it to
  // the exact same upload/OCR flow used by "Choose Image".
  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('The camera is not ready yet. Please wait a moment and try again.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      closeCamera()
      setError('Could not capture the photo. Please use "Choose Image" instead.')
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const finish = (blob) => {
      if (!blob) {
        closeCamera()
        setError('Could not capture the photo. Please use "Choose Image" instead.')
        return
      }
      const captured = new File([blob], `imei-capture-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
      closeCamera() // stop camera tracks so nothing is left running
      handleFileSelect(captured) // reuse the existing OCR upload flow
    }

    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(finish, 'image/jpeg', 0.92)
    } else {
      finish(null)
    }
  }

  const handleTakePhoto = () => {
    setError(null)
    if (supportsCamera()) {
      startCamera()
    } else {
      // Fallback for browsers without getUserMedia (e.g. insecure context):
      // the native capture attribute still opens the camera on most phones.
      triggerFileSelect(true)
    }
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
  const confidencePct =
    result && result.confidence !== undefined && result.confidence !== null
      ? Math.round(result.confidence * 100)
      : null

  return (
    <div className="page-container">
      <h1 className="page-title">Scan IMEI</h1>
      <p className="page-subtitle">
        Take or upload a photo of the IMEI label or box.
      </p>

      {/* ---- Upload / preview card ---- */}
      <div className="card mt-6 p-5 sm:p-7">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleInputChange}
          aria-label="Select an image of an IMEI label"
        />

        {!file && !scanning && !cameraOpen && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging
                ? 'border-primary-400 bg-primary-50/50'
                : 'border-slate-300 bg-slate-50/60 hover:border-primary-300 hover:bg-primary-50/30'
            }`}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
              <ScanLineIcon className="h-7 w-7" />
            </div>
            <p className="mt-4 font-semibold text-ink">
              Scan a phone box or IMEI label
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              JPG, PNG or WebP · up to {MAX_SIZE_MB} MB
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleTakePhoto}
                className="btn-primary"
              >
                <CameraIcon className="h-4 w-4" />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => triggerFileSelect(false)}
                className="btn-secondary"
              >
                <ImageIcon className="h-4 w-4" />
                Choose Image
              </button>
            </div>
            <p className="mt-4 hidden text-xs text-ink-faint sm:block">
              You can also drag &amp; drop an image here
            </p>
          </div>
        )}

        {cameraOpen && (
          <div className="animate-scale-in">
            <div className="relative overflow-hidden rounded-xl bg-slate-900 ring-1 ring-line">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlaying={handleVideoPlaying}
                onPause={handleVideoPause}
                className="aspect-video w-full bg-slate-900 object-contain"
                aria-label="Camera preview"
              />
              {cameraStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-slate-900/70">
                  <Spinner className="h-8 w-8 text-white" />
                  <p className="px-6 text-center text-sm font-semibold text-white">
                    Starting camera…
                  </p>
                </div>
              )}
            </div>

            <p className="field-hint">
              Point the camera at the IMEI label, then capture a sharp,
              well-lit photo.
            </p>

            {previewDark && (
              <div className="alert-info mt-3" role="status">
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                <p>
                  The preview looks black or very dark. The selected camera may
                  be covered, its privacy shutter closed, or a placeholder
                  camera.
                  {deviceList.length > 1
                    ? ' Try "Switch Camera" below, or use "Choose Image".'
                    : ' Use "Choose Image" to upload a photo instead.'}
                </p>
              </div>
            )}

            {deviceList.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                className="btn-secondary mt-3 w-full"
              >
                <RefreshIcon className="h-4 w-4" />
                Switch Camera
              </button>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={capturePhoto}
                className="btn-primary"
                disabled={!cameraReady || !cameraPlaying || cameraStarting}
              >
                <CameraIcon className="h-4 w-4" />
                Capture Photo
              </button>
              <button
                type="button"
                onClick={closeCamera}
                className="btn-secondary"
              >
                <XIcon className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {preview && (
          <div className="relative overflow-hidden rounded-xl ring-1 ring-line">
            <img
              src={preview}
              alt="Selected IMEI label preview"
              className="max-h-96 w-full bg-slate-50 object-contain"
            />
            {scanning && (
              <div className="absolute inset-0 bg-primary-900/35 backdrop-blur-[1px]">
                <div className="animate-scan-sweep absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary-300 to-transparent" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
                  <Spinner className="h-8 w-8 text-white" />
                  <p className="text-sm font-semibold text-white">
                    Reading IMEI from image…
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {!scanning && file && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => triggerFileSelect(false)}
              className="btn-secondary"
            >
              <ImageIcon className="h-4 w-4" />
              Pick Another
            </button>
            <button
              type="button"
              onClick={handleRetry}
              className="btn-secondary"
            >
              <RefreshIcon className="h-4 w-4" />
              Reset
            </button>
          </div>
        )}

        {error && (
          <div className="alert-error mt-4" role="alert">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {cameraFailMsg && !cameraOpen && (
          <div className="alert-error mt-4" role="alert">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>{cameraFailMsg}</p>
              <button
                type="button"
                onClick={handleRetryCamera}
                className="btn-secondary mt-3"
              >
                <RefreshIcon className="h-4 w-4" />
                Retry Camera
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Scan result ---- */}
      {result && !scanning && (
        <div className="card animate-rise mt-6 p-5 sm:p-7" aria-live="polite">
          {result.detected_imei ? (
            <>
              {/* Success banner */}
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <CheckCircleIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-emerald-900">
                    IMEI Detected
                  </p>
                  {confidencePct !== null && (
                    <p className="mt-0.5 text-xs font-medium text-emerald-700">
                      OCR confidence: {confidencePct}%
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="detected-imei" className="field-label">
                  Detected IMEI
                </label>
                <p className="field-hint">
                  Review or edit the IMEI before verifying.
                </p>
                <input
                  id="detected-imei"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={15}
                  value={detectedImei}
                  onChange={handleDetectedChange}
                  className="input input-mono mt-2"
                  aria-describedby="detected-imei-hint"
                />
                <p id="detected-imei-hint" className="mt-2 text-xs tabular-nums text-ink-faint">
                  {detectedImei.length}/15 digits
                </p>
              </div>

              <Link
                to={verifyUrl(detectedImei)}
                aria-disabled={!hasDetected}
                className={`btn-primary mt-4 w-full ${
                  !hasDetected ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                Verify Phone
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200">
              <HelpCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">
                  No IMEI detected in this image
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-amber-800/80">
                  Try a sharper, well-lit photo of the label — or type the IMEI
                  in manually below.
                </p>
              </div>
            </div>
          )}

          {/* Candidate IMEIs */}
          {result.candidate_imeis && result.candidate_imeis.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-ink">
                Detected candidates
              </p>
              <p className="field-hint">Tap a candidate to use it above.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {result.candidate_imeis.map((candidate, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleCandidateClick(candidate)}
                    aria-label={`Use candidate IMEI ${candidate}`}
                    className={`rounded-lg px-3 py-2 font-mono text-sm ring-1 transition-all duration-150 ${
                      candidate === detectedImei
                        ? 'bg-primary-600 text-white ring-primary-600'
                        : 'bg-white text-ink-soft ring-line hover:bg-primary-50 hover:ring-primary-300'
                    }`}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Extracted text */}
          {result.extracted_text && (
            <details className="group mt-5 rounded-xl bg-slate-50/80 ring-1 ring-inset ring-line/70">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink-soft">
                View OCR extracted text
              </summary>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-line/70 px-4 py-3 font-mono text-xs leading-relaxed text-ink-muted">
                {result.extracted_text}
              </pre>
            </details>
          )}

          {/* Manual fallback */}
          {!result.detected_imei && (
            <div className="mt-6 border-t border-line pt-6">
              <p className="section-label">Manual entry</p>
              <div className="mt-4">
                <label htmlFor="manual-imei" className="field-label">
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
                  className="input input-mono mt-2"
                />
              </div>
              <Link
                to={verifyUrl(manualImei)}
                aria-disabled={!hasManual}
                className={`btn-primary mt-4 w-full ${
                  !hasManual ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                Verify Phone
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ---- Tip ---- */}
      <div className="alert-info mt-6">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
        <p>
          You can also dial{' '}
          <span className="font-mono font-semibold text-ink">*#06#</span> on the
          phone to display its IMEI.
        </p>
      </div>
    </div>
  )
}
