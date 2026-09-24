import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

export function renderWithProviders(ui, { route = '/', path = '*' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path={path}
            element={
              <>
                {ui}
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { ...utils, queryClient, user: userEvent.setup() };
}
