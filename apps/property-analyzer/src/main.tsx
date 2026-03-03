import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@deal-platform/shared-auth';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';
import './styles/analyzer.css';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/*', element: <App /> },
], {
  basename: '/property-analyzer',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
