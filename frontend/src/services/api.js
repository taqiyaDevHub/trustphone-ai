const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    let errorData
    try {
      errorData = await response.json()
    } catch {
      errorData = {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Something went wrong. Please try again.',
        },
      }
    }
    return errorData
  }

  return response.json()
}

export const api = {
  health() {
    return request('/health')
  },

  verifyImei(imei) {
    return request(`/api/verify/${encodeURIComponent(imei)}`)
  },

  scanImei(imageFile) {
    const formData = new FormData()
    formData.append('image', imageFile)
    return request('/api/scan-imei', {
      method: 'POST',
      body: formData,
    })
  },

  getRiskScore(data) {
    return request('/api/risk-score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
  },

  reportStolen(formData) {
    return request('/api/report-stolen', {
      method: 'POST',
      body: formData,
    })
  },
}
