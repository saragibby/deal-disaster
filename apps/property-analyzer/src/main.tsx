import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@deal-platform/shared-auth';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';
import SharedAnalysisView from './components/SharedAnalysisView';
import './styles/analyzer.css';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/analysis/:id', element: <App /> },
  { path: '/compare', element: <App /> },
  { path: '/shared/:slug', element: <SharedAnalysisView /> },
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
