import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Home } from './pages/Home';
import { EventDetail } from './pages/EventDetail';
import { AuthPage } from './pages/AuthPage';
import { MyConcerts } from './pages/MyConcerts';

export function App() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="header">
        <Link to="/" className="logo">
          Zyntra
        </Link>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/me">My concerts</NavLink>
          {user ? (
            <>
              <span className="muted small">Hi, {user.name}</span>
              <button className="ghost" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/me" element={<MyConcerts />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
