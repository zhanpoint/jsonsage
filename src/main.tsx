import React, { lazy, Suspense, useSyncExternalStore } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './palettes.css';
import LandingPage from './components/LandingPage';

const App = lazy(() => import('./App'));

function subscribeToRoute(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function Router() {
  const hash = useSyncExternalStore(subscribeToRoute, () => window.location.hash);
  return hash === '#workspace'
    ? <Suspense fallback={null}><App /></Suspense>
    : <LandingPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
