import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const ForgotPassword = () => {
    const [step, setStep] = useState(1); // 1: email, 2: otp, 3: reset password, 4: success
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || data.error || 'Failed to send OTP.');
            
            setSuccess(data.message || 'OTP sent successfully!');
            setStep(2);
        } catch (err) {
            setError(err.message);
        } finally { setIsLoading(false); }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || data.error || 'Failed to verify OTP.');
            
            setSuccess('OTP verified successfully!');
            setStep(3);
        } catch (err) {
            setError(err.message);
        } finally { setIsLoading(false); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp, new_password: newPassword })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || data.error || 'Failed to reset password.');
            
            setSuccess('Password updated successfully!');
            setStep(4);
        } catch (err) {
            setError(err.message);
        } finally { setIsLoading(false); }
    };

    return (
        <div className="container flex-center">
            <div className="glass-panel" style={{ width: '100%', maxWidth: '420px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Reset Password</h2>

                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {/* Step 1: Send OTP */}
                {step === 1 && (
                    <form onSubmit={handleSendOtp}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                            Enter your email and we'll send you a 6-digit OTP to reset your password.
                        </p>
                        <div className="input-group">
                            <label className="input-label">Email Address</label>
                            <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="your@email.com" />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isLoading}>
                            {isLoading ? <div className="loader"></div> : 'Send OTP'}
                        </button>
                    </form>
                )}

                {/* Step 2: Verify OTP */}
                {step === 2 && (
                    <form onSubmit={handleVerifyOtp}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                            We sent a 6-digit OTP to <b>{email}</b>. It expires in 5 minutes.
                        </p>
                        <div className="input-group">
                            <label className="input-label">Enter OTP</label>
                            <input type="text" className="input-field" value={otp} onChange={(e) => setOtp(e.target.value)} required placeholder="123456" maxLength={6} style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '1.25rem' }} />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }} disabled={isLoading}>
                            {isLoading ? <div className="loader"></div> : 'Verify OTP'}
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setStep(1); setOtp(''); setSuccess(''); setError(''); }} disabled={isLoading}>
                            Change Email
                        </button>
                    </form>
                )}

                {/* Step 3: New Password */}
                {step === 3 && (
                    <form onSubmit={handleResetPassword}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                            OTP verified. Enter your new password below.
                        </p>
                        <div className="input-group">
                            <label className="input-label">New Password</label>
                            <input type="password" className="input-field" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Enter new password" minLength={6} />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Confirm Password</label>
                            <input type="password" className="input-field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Confirm new password" />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isLoading}>
                            {isLoading ? <div className="loader"></div> : 'Update Password'}
                        </button>
                    </form>
                )}

                {/* Step 4: Success */}
                {step === 4 && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <p style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>Your password has been reset successfully!</p>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
                            Go to Login
                        </button>
                    </div>
                )}

                {step !== 4 && (
                    <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Remember your password? <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Login here</Link>
                    </p>
                )}
            </div>
        </div>
    );
};

export default ForgotPassword;
