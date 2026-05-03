import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'https://smart-attendance-backend-62hr.onrender.com';

const Register = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const navigate = useNavigate();
    const { signUp, user, logout } = useAuth();

    // Redirect if already logged in
    React.useEffect(() => {
        if (user) {
            if (user.role === 'pending_student') {
                setSuccess('Registration successful. Please contact admin for approval.');
                logout();
            } else {
                navigate(user.role === 'admin' ? '/admin' : '/attendance', { replace: true });
            }
        }
    }, [user, navigate, logout]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Password validation
        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        setIsLoading(true);

        try {
            // 1. Create user in Supabase
            const data = await signUp(email, password, { username });
            
            // 2. Create user in local database so they instantly appear in Admin Panel
            try {
                const response = await fetch(`${API_BASE}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                
                // If local creation fails (e.g. username taken), log it, but they are in Supabase.
                // Normally we'd want transactions, but this connects them loosely.
                if (!response.ok) {
                    const errData = await response.json();
                    console.error("Local registration failed:", errData);
                }
            } catch (err) {
                console.error("Local backend unreachable:", err);
            }
            
            // Show the admin approval message regardless of Supabase's email confirmation setting
            setSuccess('Registration successful. Please contact admin for approval.');
        } catch (err) {
            setError(err.message || 'An error occurred during registration.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container flex-center">
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Create Account</h2>

                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label">Username</label>
                        <input
                            type="text"
                            className="input-field"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="Choose a username"
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Email</label>
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
                            minLength={6}
                            placeholder="Min. 6 characters"
                        />
                        {password.length > 0 && password.length < 6 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '0.25rem' }}>
                                Password must be at least 6 characters
                            </span>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '1rem' }}
                        disabled={isLoading}
                    >
                        {isLoading ? <div className="loader"></div> : 'Register'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Already have an account? <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Login here</Link>
                </p>
            </div>
        </div>
    );
};

export default Register;
