import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ConfigApp from './ConfigApp'
import './config.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigApp />
  </StrictMode>,
)
