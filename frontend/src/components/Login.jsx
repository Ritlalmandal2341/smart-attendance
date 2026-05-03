import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const navigate = useNavigate();
    const { login, user, logout } = useAuth();

    // Redirect if already logged in
    React.useEffect(() => {
        if (user) {
            if (user.role === 'pending_student') {
                setError('Your account is pending admin approval. Please contact admin.');
                logout();
            } else {
                navigate(user.role === 'admin' ? '/admin' : '/attendance', { replace: true });
            }
        }
    }, [user, navigate, logout]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
            // Redirection is handled by the useEffect above
        } catch (err) {
            setError(err.message || 'An error occurred during login.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container flex-center" style={{ minHeight: '100vh', position: 'relative' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Welcome Back</h2>

                {error && <div className="alert alert-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label">Email Address</label>
                        <input
                            type="email"
                            className="input-field"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="your@email.com"
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Password</label>
                        <input
                            type="password"
                            className="input-field"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '1rem' }}
                        disabled={isLoading}
                    >
                        {isLoading ? <div className="loader"></div> : 'Login'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
                    <Link to="/forgot-password" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Forgot Password?</Link>
                </p>

                <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Don't have an account? <Link to="/register" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Register here</Link>
                </p>

                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <Link to="/auto-attendance" className="btn btn-secondary" style={{ width: '100%', display: 'inline-flex', justifyContent: 'center', fontSize: '1rem', padding: '0.75rem', textDecoration: 'none' }}>
                        Take Attendance
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default Login;
