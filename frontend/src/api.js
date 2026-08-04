const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Fehler')
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // Timer
  startTimer: (data) => req('/timer/start', { method: 'POST', body: JSON.stringify(data) }),
  stopTimer:  () => req('/timer/stop', { method: 'POST' }),
  getActive:  () => req('/timer/active'),

  // Entries
  getEntries:   (params = {}) => req('/entries?' + new URLSearchParams(params).toString()),
  createManual: (data) => req('/entries/manual', { method: 'POST', body: JSON.stringify(data) }),
  updateEntry:  (id, data) => req(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEntry:  (id) => req(`/entries/${id}`, { method: 'DELETE' }),

  // Day / Week
  getDay:  (day)   => req(`/day/${day}`),
  getWeek: (start) => req('/week' + (start ? `?start=${start}` : '')),

  // Notes
  saveNote: (day, data) => req(`/notes/${day}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Stats
  getMonthlyStats: (year, month) => req(`/stats/monthly?year=${year}&month=${month}`),
  getMailStats:    () => req('/stats/mail'),

  // Projects
  getProjects:     (includeArchived = false) => req('/projects' + (includeArchived ? '?include_archived=true' : '')),
  createProject:   (data) => req('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject:   (id, data) => req(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject:   (id) => req(`/projects/${id}`, { method: 'DELETE' }),
  reorderProjects: (order) => req('/projects/reorder', { method: 'PUT', body: JSON.stringify(order) }),

  // Mail
  sendReport:    (data) => req('/mail/send-report', { method: 'POST', body: JSON.stringify(data) }),
  getMailLog:    (limit = 50) => req(`/mail/log?limit=${limit}`),
  getMailConfig: () => req('/mail/config'),
  triggerPoll:   () => req('/mail/poll', { method: 'POST' }),
}
