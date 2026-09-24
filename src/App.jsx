import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import TransactionDetailPage from './pages/TransactionDetailPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import CustomerDetailPage from './pages/CustomerDetailPage.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions/:id" element={<TransactionDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
