// Client-side Local Database Client (Bridge giữa React UI và SQLite)

export async function callDb<T = any>(method: string, ...args: any[]): Promise<T> {
  // 1. Nếu đang chạy trong Electron Desktop App
  if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
    const res = await (window as any).electronAPI.invoke('db:call', { method, args })
    if (res.error) {
      throw new Error(res.error)
    }
    return res.data
  }

  // 2. Nếu đang chạy trong trình duyệt qua Vite dev / Local web server
  const response = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, args }),
  })

  const json = await response.json()
  if (json.error) {
    throw new Error(json.error)
  }
  return json.data
}
