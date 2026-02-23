import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import VerifyEmail from './components/VerifyEmail.tsx'
import ResetPassword from './components/ResetPassword.tsx'
import AdminAnalytics from './components/AdminAnalytics.tsx'
import NotFound from './components/NotFound.tsx'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/challenge/:date', element: <App /> },
  { path: '/deal/:dealId', element: <App /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/admin/analytics', element: <AdminAnalytics /> },
  { path: '*', element: <NotFound /> },
], {
  basename: '/deal-or-disaster',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
