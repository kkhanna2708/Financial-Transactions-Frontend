import { NavLink, Outlet } from 'react-router-dom';

const navClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;

export default function Layout() {
  return (
    <div className="min-vh-100">
      <header className="navbar navbar-expand navbar-dark bg-dark shadow-sm">
        <div className="container-xl">
          <span className="navbar-brand fw-semibold">Txn Ops</span>
          <nav aria-label="Main navigation" className="navbar-nav">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/customers" className={navClass}>
              Customers
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="container-xl py-4">
        <Outlet />
      </main>
    </div>
  );
}
