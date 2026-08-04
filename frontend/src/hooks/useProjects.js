import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

// Simple module-level cache so all components share one fetch
let _cache = null
let _listeners = []

function notify() { _listeners.forEach(fn => fn(_cache)) }

export function invalidateProjects() {
  _cache = null
  api.getProjects().then(data => { _cache = data; notify() }).catch(() => {})
}

export function useProjects() {
  const [projects, setProjects] = useState(_cache || [])
  const [loading, setLoading] = useState(!_cache)

  const refresh = useCallback(() => {
    setLoading(true)
    api.getProjects().then(data => {
      _cache = data
      setProjects(data)
      notify()
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Register as listener for cache updates
    _listeners.push(setProjects)
    if (!_cache) refresh()
    else setProjects(_cache)
    return () => { _listeners = _listeners.filter(fn => fn !== setProjects) }
  }, [refresh])

  return { projects, loading, refresh }
}

// Returns just the project names as array (for select dropdowns)
export function useProjectNames() {
  const { projects, loading } = useProjects()
  return { names: projects.map(p => p.name), projects, loading }
}
