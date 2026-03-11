import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@deal-platform/shared-auth';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';
import Home from './pages/Home';
import Games from './pages/Games';
import Resources from './pages/Resources';
import Tools from './pages/Tools';
import Leaderboard from './pages/Leaderboard';
import News from './pages/News';
import Profile from './pages/Profile';
import AdminManage from './pages/AdminManage';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import './styles/dashboard.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route path="/" element={<Home />} />
            <Route path="/games" element={<Games />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/news" element={<News />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminManage />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
