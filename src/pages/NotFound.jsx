import { Link } from 'react-router-dom';

export default function NotFound({ message }) {
  return (
    <div className="text-center py-5">
      <div className="display-4 fw-bold text-body-tertiary">404</div>
      <h1 className="h4 mb-3">{message || 'Page not found'}</h1>
      <Link to="/" className="btn btn-outline-primary">
        Go home
      </Link>
    </div>
  );
}
