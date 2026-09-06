import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

/** Verwaltet die Web-Push-Subscription des Geräts (unabhängig von Timer vs. Pomodoro). */
export function usePushSubscription() {
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)

  const refresh = useCallback(() => {
    if (!isSupported) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {})
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const subscribe = useCallback(async () => {
    if (!isSupported) return
    setBusy(true); setError(null)
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      if (Notification.permission !== 'granted') {
        throw new Error('Benachrichtigungen wurden nicht erlaubt')
      }
      const { public_key } = await api.getPushPublicKey()
      if (!public_key) throw new Error('Push ist serverseitig nicht konfiguriert')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      })
      const json = sub.toJSON()
      await api.subscribePush({ endpoint: json.endpoint, keys: json.keys })
      setSubscribed(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return
    setBusy(true); setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await api.unsubscribePush(sub.endpoint)
      }
      setSubscribed(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  return { isSupported, subscribed, busy, error, subscribe, unsubscribe }
}
