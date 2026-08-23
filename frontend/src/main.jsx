import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

if (import.meta.env.DEV || import.meta.env.VITE_APP_ENV === 'development') {
  const favicon = document.querySelector('link[rel="icon"]')
  if (favicon) favicon.href = '/favicon-dev.svg'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
