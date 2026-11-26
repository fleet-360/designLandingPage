import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { applyLang } from '@/i18n'

applyLang()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
