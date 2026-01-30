import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import VerifyEmail from './components/VerifyEmail.tsx'
import ResetPassword from './components/ResetPassword.tsx'
import AdminAnalytics from './components/AdminAnalytics.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/challenge/:date" element={<App />} />
        <Route path="/deal/:dealId" element={<App />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
