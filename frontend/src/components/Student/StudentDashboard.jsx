import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';
import { useAuth } from '../../context/AuthContext';
import { Camera, CheckCircle, AlertCircle, Clock, RefreshCw, User, CalendarDays } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const AXIOS_TIMEOUT = 10000;

const CACHE_BUSTER = new Date().getTime();
const getLatestImageUrl = (url) => {
    if (!url) return url;
    return `${url.replace(/\/v\d+\//, '/')}?t=${CACHE_BUSTER}`;
};

const StudentDashboard = () => {
    const { user, token } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState(null);
    const webcamRef = useRef(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyError, setHistoryError] = useState(null);
    const [profileStatus, setProfileStatus] = useState('loading');
    const [profileData, setProfileData] = useState(null);

    // Calendar state
    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const [calYear, setCalYear] = useState(new Date().getFullYear());

    const checkProfileStatus = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/student/status`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: AXIOS_TIMEOUT
            });
            setProfileData(res.data);
            if (!res.data.has_profile) {
                setProfileStatus('no_profile');
            } else if (!res.data.has_face) {
                setProfileStatus('no_face');
            } else {
                setProfileStatus('ready');
            }
            // Fetch history
            try {
                const histRes = await axios.get(`${API}/attendance/history`, {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: AXIOS_TIMEOUT
                });
                setHistory(histRes.data);
                setHistoryError(null);
            } catch (err) {
                console.error('Failed to fetch attendance history:', err);
                setHistoryError('Failed to load attendance history.');
            }
        } catch (err) {
            console.error('Profile status check failed:', err);
            setProfileStatus('error');
        }
    }, [token]);

    useEffect(() => { checkProfileStatus(); }, [checkProfileStatus]);

    const captureAndVerify = useCallback(async () => {
        if (!webcamRef.current) return;
        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) return;
        setCapturedImage(imageSrc);
        setStatus('processing');
        setMessage(null);
        try {
            const response = await axios.post(`${API}/attendance/mark`,
                { image_base64: imageSrc },
                { headers: { Authorization: `Bearer ${token}` }, timeout: AXIOS_TIMEOUT }
            );
            setStatus('success');
            setMessage({ type: 'success', text: response.data.message || 'Attendance Successfully Recorded!' });
            checkProfileStatus();
            setTimeout(() => { setStatus('idle'); setCapturedImage(null); setMessage(null); }, 5000);
        } catch (error) {
            setStatus('error');
            setMessage({ type: 'error', text: error.response?.data?.detail || 'Verification Failed. Please try again.' });
            setTimeout(() => { setStatus('idle'); setCapturedImage(null); }, 4000);
        }
    }, [webcamRef, token, checkProfileStatus]);

    // Calendar helpers
    const presentDatesSet = new Set();
    if (profileData?.monthly_attendance) {
        profileData.monthly_attendance.forEach(iso => {
            const d = new Date(iso);
            presentDatesSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        });
    }

    const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth(calMonth, calYear);
        const firstDay = getFirstDayOfMonth(calMonth, calYear);
        const cells = [];
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        for (let i = 0; i < firstDay; i++) {
            cells.push(<div key={`e-${i}`} style={{ width: '36px', height: '36px' }}></div>);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const key = `${calYear}-${calMonth}-${d}`;
            const isPresent = presentDatesSet.has(key);
            const isToday = d === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
            cells.push(
                <div key={d} style={{
                    width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: isPresent ? 600 : 400,
                    background: isPresent ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    color: isPresent ? '#10b981' : isToday ? '#4F46E5' : 'var(--text-muted)',
                    border: isToday ? '1px solid #4F46E5' : '1px solid transparent',
                }}>
                    {d}
                </div>
            );
        }

        const goBack = () => {
            if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
            else setCalMonth(calMonth - 1);
        };
        const goForward = () => {
            if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
            else setCalMonth(calMonth + 1);
        };

        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <button onClick={goBack} className="btn" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.3rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer' }}>←</button>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{monthNames[calMonth]} {calYear}</span>
                    <button onClick={goForward} className="btn" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.3rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer' }}>→</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                        <div key={d} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, padding: '0.25rem 0' }}>{d}</div>
                    ))}
                    {cells}
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(16,185,129,0.3)' }}></span> Present
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', border: '1px solid #4F46E5' }}></span> Today
                    </span>
                </div>
            </div>
        );
    };

    const getPercentColor = (pct) => pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

    const tabBtn = (key, label, icon) => (
        <button
            className={`btn ${activeTab === key ? 'btn-primary' : ''}`}
            onClick={() => setActiveTab(key)}
            style={{ background: activeTab !== key ? 'var(--glass-bg)' : '', fontSize: '0.85rem' }}
        >
            {icon} {label}
        </button>
    );

    return (
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h1 className="text-gradient" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Student Portal</h1>

            {/* Status alerts */}
            {profileStatus === 'no_profile' && (
                <div className="alert alert-error" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <AlertCircle size={20} />
                    Student profile not created by admin yet. Please ask your administrator.
                </div>
            )}
            {profileStatus === 'no_face' && (
                <div className="alert alert-error" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <AlertCircle size={20} />
                    Face biometrics not registered. Please ask your administrator to enroll your face.
                </div>
            )}
            {profileStatus === 'error' && (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <AlertCircle size={40} style={{ color: 'var(--accent)', marginBottom: '1rem' }} />
                    <p style={{ color: 'var(--accent)', marginBottom: '1rem' }}>Failed to load your profile. The server may be unavailable.</p>
                    <button className="btn btn-primary" onClick={checkProfileStatus}>
                        <RefreshCw size={16} /> Retry
                    </button>
                </div>
            )}

            {profileStatus !== 'loading' && profileStatus !== 'error' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        {tabBtn('overview', 'Overview', <User size={16} />)}
                        {profileStatus === 'ready' && tabBtn('mark', 'Mark Attendance', <Camera size={16} />)}
                        {tabBtn('calendar', 'Calendar', <CalendarDays size={16} />)}
                        {tabBtn('history', 'History', <Clock size={16} />)}
                    </div>

                    <div className="glass-panel" style={{ padding: '2rem' }}>

                        {/* ========== OVERVIEW ========== */}
                        {activeTab === 'overview' && profileData && (
                            <div>
                                {/* Profile Card */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem', padding: '1.25rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: 'white', flexShrink: 0, border: '2px solid var(--glass-border)' }}>
                                        {profileData.face_image_url ? (
                                            <img src={getLatestImageUrl(profileData.face_image_url)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            profileData.profile_name ? profileData.profile_name.charAt(0).toUpperCase() : '?'
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{profileData.profile_name || 'Not Set'}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {profileData.roll_number || '—'} &nbsp;·&nbsp; User #{profileData.user_id}
                                        </div>
                                        <div style={{ marginTop: '0.35rem' }}>
                                            {profileData.has_face ? (
                                                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '50px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>
                                                    <CheckCircle size={12} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} />Face Enrolled
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '50px', background: 'rgba(244,63,94,0.1)', color: '#ef4444', fontWeight: 600 }}>
                                                    <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} />No Face Data
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Stats Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={{ padding: '1rem', borderRadius: '10px', background: 'var(--input-bg)', border: '1px solid rgba(79,70,229,0.2)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4F46E5' }}>{profileData.total_present}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Present</div>
                                    </div>
                                    <div style={{ padding: '1rem', borderRadius: '10px', background: 'var(--input-bg)', border: '1px solid rgba(56,189,248,0.2)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38BDF8' }}>{profileData.total_days}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Classes</div>
                                    </div>
                                    <div style={{ padding: '1rem', borderRadius: '10px', background: 'var(--input-bg)', border: `1px solid ${getPercentColor(profileData.attendance_percentage)}33`, textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: getPercentColor(profileData.attendance_percentage) }}>
                                            {profileData.attendance_percentage}%
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attendance</div>
                                    </div>
                                </div>

                                {/* Attendance Bar */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Attendance Rate</span>
                                        <span style={{ fontWeight: 600, color: getPercentColor(profileData.attendance_percentage) }}>
                                            {profileData.attendance_percentage}%
                                        </span>
                                    </div>
                                    <div style={{ height: '8px', borderRadius: '4px', background: 'var(--glass-border)', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${Math.min(profileData.attendance_percentage, 100)}%`,
                                            height: '100%', borderRadius: '4px',
                                            background: getPercentColor(profileData.attendance_percentage)
                                        }}></div>
                                    </div>
                                    {profileData.attendance_percentage < 75 && profileData.total_days > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.5rem' }}>
                                            ⚠ Your attendance is below 75%. Please attend more classes.
                                        </div>
                                    )}
                                </div>

                                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={checkProfileStatus}>
                                    <RefreshCw size={16} /> Refresh
                                </button>
                            </div>
                        )}

                        {/* ========== MARK ATTENDANCE ========== */}
                        {activeTab === 'mark' && profileStatus === 'ready' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Camera size={20} /> Mark Your Attendance
                                </h3>

                                {message && (
                                    <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem' }}>
                                        {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                                        {message.text}
                                    </div>
                                )}

                                <div className="webcam-container" style={{ marginBottom: '1.5rem' }}>
                                    {!capturedImage ? (
                                        <>
                                            <Webcam
                                                audio={false}
                                                ref={webcamRef}
                                                screenshotFormat="image/jpeg"
                                                videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
                                                style={{ width: '100%', height: 'auto', display: 'block' }}
                                            />
                                            <div className="webcam-overlay"></div>
                                        </>
                                    ) : (
                                        <img src={capturedImage} alt="Captured" style={{ width: '100%', display: 'block' }} />
                                    )}
                                </div>

                                {status === 'processing' ? (
                                    <div className="flex-center" style={{ padding: '1rem' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px', margin: '0 auto 0.75rem' }}></div>
                                            <p style={{ color: 'var(--text-muted)' }}>Verifying your face...</p>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
                                        onClick={captureAndVerify}
                                        disabled={status !== 'idle'}
                                    >
                                        <Camera size={22} /> Capture & Verify
                                    </button>
                                )}
                            </div>
                        )}

                        {/* ========== CALENDAR ========== */}
                        {activeTab === 'calendar' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <CalendarDays size={20} /> Attendance Calendar
                                </h3>
                                {renderCalendar()}
                            </div>
                        )}

                        {/* ========== HISTORY ========== */}
                        {activeTab === 'history' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Clock size={20} /> Attendance History
                                </h3>
                                {historyError ? (
                                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                                        <AlertCircle size={32} style={{ color: 'var(--accent)', marginBottom: '0.75rem' }} />
                                        <p style={{ color: 'var(--accent)', marginBottom: '1rem' }}>{historyError}</p>
                                        <button className="btn btn-primary" onClick={checkProfileStatus}>
                                            <RefreshCw size={16} /> Retry
                                        </button>
                                    </div>
                                ) : history.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No attendance records yet.</p>
                                ) : (
                                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Date</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Time</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {history.map((rec) => {
                                                    const d = new Date(rec.timestamp);
                                                    return (
                                                        <tr key={rec.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                                            <td style={{ padding: '0.5rem 0.75rem' }}>{d.toLocaleDateString()}</td>
                                                            <td style={{ padding: '0.5rem 0.75rem' }}>{d.toLocaleTimeString()}</td>
                                                            <td style={{ padding: '0.5rem 0.75rem' }}>
                                                                <span style={{
                                                                    padding: '0.15rem 0.5rem', borderRadius: '50px', fontSize: '0.8rem',
                                                                    backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--secondary)', fontWeight: 600
                                                                }}>
                                                                    {rec.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </>
            )}

            {profileStatus === 'loading' && (
                <div className="flex-center" style={{ padding: '3rem' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px', margin: '0 auto 1rem' }}></div>
                        <p style={{ color: 'var(--text-muted)' }}>Loading your profile...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentDashboard;
