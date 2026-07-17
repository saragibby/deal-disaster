import { StrictMode } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@deal-platform/shared-auth';
import { ThemeProvider } from './contexts/ThemeContext';
import { AssetDashboardAnalyzerProvider } from './wrapper/AssetDashboardAnalyzerContext';
import App from './App';
import '@deal-platform/property-analyzer-core/styles.css';

const withAssetDashboardWrapper = (element: ReactElement) => (
  <AssetDashboardAnalyzerProvider>{element}</AssetDashboardAnalyzerProvider>
);

const router = createBrowserRouter([
  { path: '/', element: withAssetDashboardWrapper(<App />) },
  { path: '/analysis/:id', element: withAssetDashboardWrapper(<App />) },
  { path: '/compare', element: withAssetDashboardWrapper(<App />) },
  { path: '/shared/:slug', element: withAssetDashboardWrapper(<App />) },
  { path: '/*', element: withAssetDashboardWrapper(<App />) },
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
