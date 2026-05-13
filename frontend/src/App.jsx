import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Login from './components/Login';
import Register from './components/Register';
import AdminDashboard from './components/Admin/AdminDashboard';
import StudentDashboard from './components/Student/StudentDashboard';
import AutoAttendance from './components/AutoAttendance';
import ForgotPassword from './components/ForgotPassword';
import ThemeToggle from './components/ThemeToggle';

// ── Error Boundary ──────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("App Crash:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-end))',
          color: 'var(--text-main)', fontFamily: 'Inter, sans-serif', padding: '2rem'
        }}>
          <div className="glass-panel" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ marginBottom: '0.75rem' }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginBottom: '1.5rem', wordBreak: 'break-word' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Private Route ───────────────────────────────────────────────
const PrivateRoute = ({ children, allowedRole }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container flex-center" style={{ minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px', margin: '0 auto 1rem' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading your session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// ── Header ──────────────────────────────────────────────────────
const Header = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isKiosk = location.pathname === '/auto-attendance';

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <span className="text-gradient">Smart</span> Attendance
      </div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {isKiosk && (
          <Link to="/login" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', textDecoration: 'none' }}>
            Exit
          </Link>
        )}
        <ThemeToggle />
        {user && (
          <>
            <span style={{ fontSize: '0.875rem' }}>Welcome, {user.username}</span>
            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={logout}>Logout</button>
          </>
        )}
      </div>
    </nav>
  );
};

// ── Root Redirect ───────────────────────────────────────────────
const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container flex-center" style={{ minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px', margin: '0 auto 1rem' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'pending_student') return <Navigate to="/login" replace />;
  return <Navigate to="/attendance" replace />;
};

// ── App Content ─────────────────────────────────────────────────
const AppContent = () => {
  // Pre-warm the backend immediately on load (especially useful for Render cold starts)
  React.useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_URL || 'https://smart-attendance-backend-62hr.onrender.com';
    fetch(`${API_BASE}/ping`).catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route
          path="/admin/*"
          element={
            <PrivateRoute allowedRole="admin">
              <AdminDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/attendance/*"
          element={
            <PrivateRoute allowedRole="student">
              <StudentDashboard />
            </PrivateRoute>
          }
        />

        <Route path="/auto-attendance" element={<AutoAttendance />} />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

// ── App ─────────────────────────────────────────────────────────
function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
