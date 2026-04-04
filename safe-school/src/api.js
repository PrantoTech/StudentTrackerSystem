// Use Vite dev proxy by default to avoid browser CORS issues in development.
// You can still override with VITE_API_BASE_URL for deployed environments.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * Small fetch helper for backend calls.
 * - Centralizes base URL + JSON parsing.
 * - Lets callers handle 401 by providing onUnauthorized.
 */
export async function apiFetch(path, options = {}, { onUnauthorized } = {}) {
  const url = `${API_BASE}${path}`
  console.debug('[ParentApp][API]', options?.method || 'GET', url)

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (response.status === 401) {
    if (onUnauthorized) onUnauthorized()
    const err = new Error('Unauthorized')
    err.status = 401
    throw err
  }

  if (!response.ok) {
    // Try to surface backend error details (helps debug 404 vs invalid session tokens).
    let details = ''
    try {
      details = await response.text()
    } catch {
      /* ignore */
    }

    const suffix = details ? `: ${details}` : ''
    const err = new Error(`Request failed (${response.status})${suffix}`)
    err.status = response.status
    throw err
  }

  // Some endpoints may return empty body.
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

