import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './tailwind.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('无法找到应用挂载节点。')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
