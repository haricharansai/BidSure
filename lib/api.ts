export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'bidsure.token'

export function storeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {}
}

export function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function apiFetch<T>(url: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const config: RequestInit = {
    method: options?.method || 'GET',
    headers: { 'Content-Type': 'application/json' } as Record<string, string>,
  }
  const token = readToken()
  if (token) (config.headers as Record<string, string>).Authorization = `Bearer ${token}`
  if (options?.body !== undefined) {
    config.body = JSON.stringify(options.body)
  }
  const response = await globalThis.fetch(url, config)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (data && typeof data === 'object' && 'error' in data) ? String((data as { error: unknown }).error) : `Request failed (${response.status})`
    throw new ApiError(message, response.status)
  }
  return data as T
}
