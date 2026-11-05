import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  // Solo rutas internas, para no redirigir a otra web.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await register(name, email, password);
      else await login(email, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <div className="auth">
      <h1>{isRegister ? 'Create account' : 'Log in'}</h1>
      {next && <p className="muted">Log in or create an account to save concerts.</p>}
      <form onSubmit={onSubmit} className="form">
        {isRegister && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : isRegister ? 'Sign up' : 'Log in'}
        </button>
      </form>
      <p className="muted">
        {isRegister ? (
          <>
            Already have an account? <Link to={`/login${suffix}`}>Log in</Link>
          </>
        ) : (
          <>
            New to Zyntra? <Link to={`/register${suffix}`}>Create an account</Link>
          </>
        )}
      </p>
    </div>
  );
}
