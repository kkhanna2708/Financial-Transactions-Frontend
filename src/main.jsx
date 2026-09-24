import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, err) => (err?.status === 0 || err?.status >= 500) && n < 2,
      refetchOnWindowFocus: true,
      staleTime: 0,
    },
  },
});

async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return;
  const { worker } = await import('./mocks/browser.js');
  return worker.start({ onUnhandledRequest: 'bypass' });
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
});
