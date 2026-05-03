import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';
import { Camera, CheckCircle, AlertCircle, RefreshCw, Users, Clock, Trash2, Edit3, X, Save, Download, Search, BarChart3, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'https://smart-attendance-backend-62hr.onrender.com';
const AXIOS_TIMEOUT = 10000; // 10s timeout for all API calls

const CACHE_BUSTER = new Date().getTime();
const getLatestImageUrl = (url) => {
    if (!url) return url;
    // Just add cache buster without modifying the path
    return url.includes('?') ? `${url}&t=${CACHE_BUSTER}` : `${url}?t=${CACHE_BUSTER}`;
};

const AdminDashboard = () => {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');

    // Student user accounts from backend
    const [studentUsers, setStudentUsers] = useState([]);

    // Student Form State
    const [studentData, setStudentData] = useState({ userId: '', name: '', rollNumber: '' });
    const [studentMessage, setStudentMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Face Registration State
    const [faceData, setFaceData] = useState({ studentId: '' });
    const [faceMessage, setFaceMessage] = useState(null);
    const [isFaceLoading, setIsFaceLoading] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);
    const webcamRef = useRef(null);

    // Student List State
    const [students, setStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');
    const [editingStudent, setEditingStudent] = useState(null);

    // Daily Attendance State
    const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyAttendance, setDailyAttendance] = useState([]);
    const [isDailyLoading, setIsDailyLoading] = useState(false);
    const [attendanceSearch, setAttendanceSearch] = useState('');

    // Dashboard Stats
    const [dashStats, setDashStats] = useState(null);

    // Attendance Summary
    const [summary, setSummary] = useState([]);
    const [summaryDays, setSummaryDays] = useState(30);
    const [summaryLoading, setSummaryLoading] = useState(false);

    // CSV Export
    const [exportStart, setExportStart] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
    const [exportEnd, setExportEnd] = useState(new Date().toISOString().split('T')[0]);

    // Error states for each section
    const [dashError, setDashError] = useState(null);
    const [studentsError, setStudentsError] = useState(null);
    const [dailyError, setDailyError] = useState(null);
    const [summaryError, setSummaryError] = useState(null);
    const [studentUsersError, setStudentUsersError] = useState(null);

    // ---- Fetchers with proper error handling ----

    const fetchDashStats = useCallback(async () => {
        setDashError(null);
        try {
            const res = await axios.get(`${API}/admin/dashboard-stats`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: AXIOS_TIMEOUT
            });
            setDashStats(res.data);
        } catch (err) {
            console.error('Failed to fetch dashboard stats:', err);
            setDashError('Failed to load dashboard statistics. Please check your connection.');
        }
    }, [token]);

    const fetchStudentUsers = useCallback(async () => {
        setStudentUsersError(null);
        try {
            const res = await axios.get(`${API}/admin/student-users`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: AXIOS_TIMEOUT
            });
            setStudentUsers(res.data);
        } catch (err) {
            console.error('Failed to fetch student users:', err);
            setStudentUsersError('Failed to load student user accounts.');
        }
    }, [token]);

    const fetchStudents = useCallback(async () => {
        setStudentsLoading(true);
        setStudentsError(null);
        try {
            const res = await axios.get(`${API}/admin/students`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: AXIOS_TIMEOUT
            });
            setStudents(res.data);
        } catch (err) {
            console.error('Failed to fetch students:', err);
            setStudentsError('Failed to load student list.');
        } finally { setStudentsLoading(false); }
    }, [token]);

    const fetchDailyAttendance = useCallback(async () => {
        setIsDailyLoading(true);
        setDailyError(null);
        try {
            const res = await axios.get(`${API}/admin/attendance/date?date_str=${dailyDate}`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: AXIOS_TIMEOUT
            });
            setDailyAttendance(res.data);
        } catch (err) {
            console.error('Failed to fetch daily attendance:', err);
            setDailyError('Failed to load attendance data.');
        } finally { setIsDailyLoading(false); }
    }, [dailyDate, token]);

    const fetchSummary = useCallback(async () => {
        setSummaryLoading(true);
        setSummaryError(null);
        try {
            const res = await axios.get(`${API}/admin/attendance/summary?days=${summaryDays}`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: AXIOS_TIMEOUT
            });
            setSummary(res.data);
        } catch (err) {
            console.error('Failed to fetch summary:', err);
            setSummaryError('Failed to load attendance summary.');
        } finally { setSummaryLoading(false); }
    }, [summaryDays, token]);

    // ---- Effects ----

    useEffect(() => { fetchStudentUsers(); }, [fetchStudentUsers]);
    useEffect(() => {
        if (activeTab === 'dashboard') fetchDashStats();
    }, [activeTab, fetchDashStats]);
    useEffect(() => {
        if (activeTab === 'daily_attendance') fetchDailyAttendance();
    }, [activeTab, fetchDailyAttendance]);
    useEffect(() => {
        if (activeTab === 'view_students' || activeTab === 'register_face') fetchStudents();
    }, [activeTab, fetchStudents]);
    useEffect(() => {
        if (activeTab === 'summary') fetchSummary();
    }, [activeTab, fetchSummary]);

    const availableStudentUsers = studentUsers.filter(u => !u.has_profile);

    // ---- Handlers ----

    const handleAddStudent = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setStudentMessage(null);
        try {
            const response = await axios.post(`${API}/admin/student`, {
                user_id: parseInt(studentData.userId, 10),
                name: studentData.name,
                roll_number: studentData.rollNumber
            }, { headers: { Authorization: `Bearer ${token}` }, timeout: AXIOS_TIMEOUT });
            setStudentMessage({ type: 'success', text: `Student "${response.data.name}" added successfully with Profile ID: ${response.data.id}` });
            setStudentData({ userId: '', name: '', rollNumber: '' });
            fetchStudentUsers();
        } catch (err) {
            setStudentMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to add student' });
        } finally { setIsLoading(false); }
    };

    const capture = useCallback(() => {
        if (!webcamRef.current) return;
        const imageSrc = webcamRef.current.getScreenshot();
        setCapturedImage(imageSrc);
    }, [webcamRef]);

    const handleRegisterFace = async (e) => {
        e.preventDefault();
        if (!capturedImage) { setFaceMessage({ type: 'error', text: 'Please capture an image first.' }); return; }
        setIsFaceLoading(true);
        setFaceMessage(null);
        try {
            await axios.post(`${API}/admin/face`, {
                student_id: parseInt(faceData.studentId, 10),
                image_base64: capturedImage
            }, { headers: { Authorization: `Bearer ${token}` }, timeout: AXIOS_TIMEOUT });
            setFaceMessage({ type: 'success', text: 'Face registered successfully and stored securely.' });
            setCapturedImage(null);
            setFaceData({ studentId: '' });
        } catch (err) {
            setFaceMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to register face' });
            setCapturedImage(null);
        } finally { setIsFaceLoading(false); }
    };

    const handleDeleteStudent = async (studentId, studentName) => {
        if (!window.confirm(`Are you sure you want to delete "${studentName}" and all their data (face, attendance)?\n\nThis action cannot be undone.`)) return;
        try {
            await axios.delete(`${API}/admin/student/${studentId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: AXIOS_TIMEOUT });
            fetchStudents();
            fetchStudentUsers();
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to delete student');
        }
    };

    const handleEditStudent = async () => {
        if (!editingStudent) return;
        try {
            await axios.put(`${API}/admin/student/${editingStudent.id}`, {
                name: editingStudent.name,
                roll_number: editingStudent.roll_number
            }, { headers: { Authorization: `Bearer ${token}` }, timeout: AXIOS_TIMEOUT });
            setEditingStudent(null);
            fetchStudents();
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to update student');
        }
    };

    const handleExportCSV = async () => {
        try {
            const res = await axios.get(`${API}/admin/attendance/export?start_date=${exportStart}&end_date=${exportEnd}`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
                timeout: AXIOS_TIMEOUT
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `attendance_${exportStart}_to_${exportEnd}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert('Failed to export CSV. Please try again.');
        }
    };

    const handleUserSelect = (e) => {
        const userId = e.target.value;
        const selectedUser = studentUsers.find(u => u.id === parseInt(userId, 10));
        setStudentData({ ...studentData, userId, name: selectedUser ? selectedUser.username : '' });
    };

    // ---- Filtered data ----

    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.roll_number.toLowerCase().includes(studentSearch.toLowerCase())
    );

    const filteredAttendance = dailyAttendance.filter(r =>
        r.student_name.toLowerCase().includes(attendanceSearch.toLowerCase()) ||
        r.roll_number.toLowerCase().includes(attendanceSearch.toLowerCase())
    );

    // ---- Reusable Components ----

    const tabBtn = (key, label, icon) => (
        <button
            className={`btn ${activeTab === key ? 'btn-primary' : ''}`}
            onClick={() => setActiveTab(key)}
            style={{ background: activeTab !== key ? 'var(--glass-bg)' : '', fontSize: '0.85rem' }}
        >
            {icon} {label}
        </button>
    );

    const searchBar = (value, setter, placeholder) => (
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
                type="text"
                className="input-field"
                placeholder={placeholder}
                value={value}
                onChange={(e) => setter(e.target.value)}
                style={{ paddingLeft: '2.25rem' }}
            />
        </div>
    );

    const errorBlock = (errorMsg, retryFn) => (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
            <AlertCircle size={32} style={{ color: 'var(--accent)', marginBottom: '0.75rem' }} />
            <p style={{ color: 'var(--accent)', marginBottom: '1rem' }}>{errorMsg}</p>
            <button className="btn btn-primary" onClick={retryFn}>
                <RefreshCw size={16} /> Retry
            </button>
        </div>
    );

    const getPercentColor = (pct) => {
        if (pct >= 75) return '#10b981';
        if (pct >= 50) return '#f59e0b';
        return '#ef4444';
    };

    // ---- Render ----

    return (
        <div className="container">
            <h1 className="text-gradient" style={{ textAlign: 'center', marginBottom: '2rem' }}>Administrator Dashboard</h1>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                {tabBtn('dashboard', 'Overview', <LayoutDashboard size={16} />)}
                {tabBtn('add_student', 'Add Student', null)}
                {tabBtn('register_face', 'Register Face', null)}
                {tabBtn('view_students', 'Students', <Users size={16} />)}
                {tabBtn('daily_attendance', 'Attendance', <Clock size={16} />)}
                {tabBtn('summary', 'Summary', <BarChart3 size={16} />)}
            </div>

            <div className="glass-panel" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

                {/* ==================== DASHBOARD OVERVIEW ==================== */}
                {activeTab === 'dashboard' && (
                    <div>
                        <h2 style={{ marginBottom: '1.5rem' }}>Overview</h2>
                        {dashError ? (
                            errorBlock(dashError, fetchDashStats)
                        ) : dashStats ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                                {[
                                    { label: 'Total Students', value: dashStats.total_students, color: '#4F46E5' },
                                    { label: 'Faces Enrolled', value: dashStats.faces_enrolled, color: '#10B981' },
                                    { label: 'Present Today', value: dashStats.attendance_today, color: '#38BDF8' },
                                    { label: '7-Day Rate', value: `${dashStats.attendance_rate_7d}%`, color: '#F59E0B' },
                                ].map((stat, i) => (
                                    <div key={i} style={{
                                        padding: '1.25rem',
                                        borderRadius: '12px',
                                        background: 'var(--input-bg)',
                                        border: `1px solid ${stat.color}33`,
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-center" style={{ padding: '2rem' }}><div className="loader"></div></div>
                        )}
                        <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={fetchDashStats}>
                            <RefreshCw size={16} /> Refresh
                        </button>
                    </div>
                )}

                {/* ==================== ADD STUDENT ==================== */}
                {activeTab === 'add_student' && (
                    <div>
                        <h2 style={{ marginBottom: '1.5rem' }}>Student Registration</h2>
                        {studentUsersError && (
                            <div className="alert alert-error">
                                <AlertCircle size={20} /> {studentUsersError}
                                <button className="btn" onClick={fetchStudentUsers} style={{ marginLeft: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                                    <RefreshCw size={14} /> Retry
                                </button>
                            </div>
                        )}
                        {studentMessage && (
                            <div className={`alert ${studentMessage.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                                {studentMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                                {studentMessage.text}
                            </div>
                        )}
                        <form onSubmit={handleAddStudent}>
                            <div className="input-group">
                                <label className="input-label">Select Student User Account</label>
                                {availableStudentUsers.length === 0 ? (
                                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', fontSize: '0.9rem' }}>
                                        No pending student accounts found. Wait for students to register with the role "Student".
                                    </div>
                                ) : (
                                    <select className="input-field" value={studentData.userId} onChange={handleUserSelect} required style={{ appearance: 'none', backgroundColor: 'var(--input-bg)' }}>
                                        <option value="">-- Select a student user --</option>
                                        {availableStudentUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.username} (User ID: {u.id})</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            {availableStudentUsers.length > 0 && (
                                <>
                                    <div className="input-group">
                                        <label className="input-label">Full Name</label>
                                        <input type="text" className="input-field" value={studentData.name} onChange={(e) => setStudentData({ ...studentData, name: e.target.value })} required placeholder="Student's full name" />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Roll Number</label>
                                        <input type="text" className="input-field" value={studentData.rollNumber} onChange={(e) => setStudentData({ ...studentData, rollNumber: e.target.value })} required placeholder="e.g. CS2024001" />
                                    </div>
                                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isLoading}>
                                        {isLoading ? <div className="loader"></div> : 'Create Profile'}
                                    </button>
                                </>
                            )}
                        </form>
                    </div>
                )}

                {/* ==================== REGISTER FACE ==================== */}
                {activeTab === 'register_face' && (
                    <div>
                        <h2 style={{ marginBottom: '1.5rem' }}>Biometric Enrollment</h2>
                        {faceMessage && (
                            <div className={`alert ${faceMessage.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                                {faceMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                                {faceMessage.text}
                            </div>
                        )}
                        {studentsError ? (
                            errorBlock(studentsError, fetchStudents)
                        ) : (
                            <form onSubmit={handleRegisterFace}>
                                <div className="input-group">
                                    <label className="input-label">Select Student (must have profile first)</label>
                                    {students.length === 0 ? (
                                        <div style={{ padding: '0.75rem 1rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', fontSize: '0.9rem' }}>
                                            No student profiles found. Create a profile in Step 1 first.
                                        </div>
                                    ) : (
                                        <select className="input-field" value={faceData.studentId} onChange={(e) => setFaceData({ ...faceData, studentId: e.target.value })} required style={{ appearance: 'none', backgroundColor: 'var(--input-bg)' }}>
                                            <option value="">-- Select a student --</option>
                                            {students.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} — Roll: {s.roll_number} {s.has_face_data ? '(Face ✓)' : '(No face)'}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Face Capture</label>
                                    <div className="webcam-container" style={{ marginBottom: '1rem' }}>
                                        {!capturedImage ? (
                                            <>
                                                <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ width: 640, height: 480, facingMode: "user" }} style={{ width: '100%', height: 'auto', display: 'block' }} />
                                                <div className="webcam-overlay"></div>
                                            </>
                                        ) : (
                                            <img src={capturedImage} alt="Captured" style={{ width: '100%', display: 'block' }} />
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        {!capturedImage ? (
                                            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={capture}>
                                                <Camera size={20} /> Capture Face
                                            </button>
                                        ) : (
                                            <button type="button" className="btn" style={{ flex: 1, border: '1px solid var(--glass-border)', color: 'var(--text-main)', background: 'transparent' }} onClick={() => setCapturedImage(null)}>
                                                <RefreshCw size={20} /> Retake
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={isFaceLoading || !capturedImage}>
                                    {isFaceLoading ? <div className="loader"></div> : 'Extract & Store 128-D Face Encoding'}
                                </button>
                            </form>
                        )}
                    </div>
                )}

                {/* ==================== VIEW STUDENTS ==================== */}
                {activeTab === 'view_students' && (
                    <div>
                        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Users size={24} /> Registered Students
                        </h2>

                        {searchBar(studentSearch, setStudentSearch, "Search by name or roll number...")}

                        {studentsError ? (
                            errorBlock(studentsError, fetchStudents)
                        ) : studentsLoading ? (
                            <div className="flex-center" style={{ padding: '2rem' }}><div className="loader"></div></div>
                        ) : filteredStudents.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                                {students.length === 0 ? 'No students registered yet.' : 'No results match your search.'}
                            </p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>ID</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Name</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Roll No.</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Face</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map((s) => (
                                            <tr key={s.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                                <td style={{ padding: '0.75rem' }}>{s.id}</td>
                                                <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                                                    {editingStudent?.id === s.id ? (
                                                        <input type="text" className="input-field" value={editingStudent.name} onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })} style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} />
                                                    ) : s.name}
                                                </td>
                                                <td style={{ padding: '0.75rem' }}>
                                                    {editingStudent?.id === s.id ? (
                                                        <input type="text" className="input-field" value={editingStudent.roll_number} onChange={(e) => setEditingStudent({ ...editingStudent, roll_number: e.target.value })} style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} />
                                                    ) : s.roll_number}
                                                </td>
                                                <td style={{ padding: '0.75rem' }}>
                                                    {s.has_face_data ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            {s.face_image_url ? (
                                                                <a href={s.face_image_url} target="_blank" rel="noopener noreferrer" title="View Full Image">
                                                                    <img 
                                                                        src={getLatestImageUrl(s.face_image_url)} 
                                                                        alt={`${s.name} face`} 
                                                                        style={{ 
                                                                            width: '44px', 
                                                                            height: '44px', 
                                                                            borderRadius: '8px', 
                                                                            objectFit: 'cover', 
                                                                            border: '2px solid var(--secondary)',
                                                                            cursor: 'pointer',
                                                                            transition: 'transform 0.2s'
                                                                        }} 
                                                                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                                                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                                                                    />
                                                                </a>
                                                            ) : (
                                                                <CheckCircle size={20} color="var(--secondary)" />
                                                            )}
                                                            <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>Yes</span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            <AlertCircle size={16} /> No
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.75rem' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        {editingStudent?.id === s.id ? (
                                                            <>
                                                                <button className="btn" onClick={handleEditStudent} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                                                                    <Save size={14} /> Save
                                                                </button>
                                                                <button className="btn btn-secondary" onClick={() => setEditingStudent(null)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                                                                    <X size={14} /> Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button className="btn btn-secondary" onClick={() => setEditingStudent({ id: s.id, name: s.name, roll_number: s.roll_number })} title="Edit" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                                                                    <Edit3 size={14} /> Edit
                                                                </button>
                                                                <button className="btn" onClick={() => handleDeleteStudent(s.id, s.name)} title="Delete" style={{ background: 'hsla(340, 75%, 65%, 0.15)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                                                                    <Trash2 size={14} /> Delete
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={fetchStudents}>
                            <RefreshCw size={16} /> Refresh
                        </button>
                    </div>
                )}

                {/* ==================== DAILY ATTENDANCE ==================== */}
                {activeTab === 'daily_attendance' && (
                    <div>
                        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={24} color="var(--primary)" /> Daily Attendance
                        </h2>

                        <div className="input-group" style={{ marginBottom: '1rem' }}>
                            <label className="input-label">Select Date</label>
                            <input type="date" className="input-field" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
                        </div>

                        {searchBar(attendanceSearch, setAttendanceSearch, "Search by name or roll number...")}

                        {/* CSV Export section */}
                        <div style={{ padding: '1rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>Export Attendance (CSV)</div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1, minWidth: '120px' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From</label>
                                    <input type="date" className="input-field" value={exportStart} onChange={(e) => setExportStart(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: '120px' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To</label>
                                    <input type="date" className="input-field" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem' }} />
                                </div>
                                <button className="btn btn-primary" onClick={handleExportCSV} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                                    <Download size={15} /> Export
                                </button>
                            </div>
                        </div>

                        {dailyError ? (
                            errorBlock(dailyError, fetchDailyAttendance)
                        ) : isDailyLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px' }}></div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Student Name</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Roll Num</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Time</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAttendance.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No attendance records found.</td>
                                            </tr>
                                        ) : (
                                            filteredAttendance.map((record) => (
                                                <tr key={record.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>{record.student_name}</td>
                                                    <td style={{ padding: '0.75rem' }}>{record.roll_number}</td>
                                                    <td style={{ padding: '0.75rem' }}>{new Date(record.timestamp).toLocaleTimeString()}</td>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        <span style={{ padding: '0.25rem 0.5rem', borderRadius: '50px', fontSize: '0.875rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--secondary)' }}>
                                                            {record.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={fetchDailyAttendance}>
                            <RefreshCw size={16} /> Refresh
                        </button>
                    </div>
                )}

                {/* ==================== ATTENDANCE SUMMARY ==================== */}
                {activeTab === 'summary' && (
                    <div>
                        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <BarChart3 size={24} /> Attendance Summary
                        </h2>

                        <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                            <label className="input-label">Period (last N days)</label>
                            <select className="input-field" value={summaryDays} onChange={(e) => setSummaryDays(parseInt(e.target.value))} style={{ appearance: 'none', backgroundColor: 'var(--input-bg)' }}>
                                <option value={7}>Last 7 days</option>
                                <option value={15}>Last 15 days</option>
                                <option value={30}>Last 30 days</option>
                                <option value={60}>Last 60 days</option>
                                <option value={90}>Last 90 days</option>
                            </select>
                        </div>

                        {summaryError ? (
                            errorBlock(summaryError, fetchSummary)
                        ) : summaryLoading ? (
                            <div className="flex-center" style={{ padding: '2rem' }}><div className="loader"></div></div>
                        ) : summary.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No attendance data available for this period.</p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Name</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Roll No.</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Present</th>
                                            <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Attendance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.map((s) => (
                                            <tr key={s.student_id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                                <td style={{ padding: '0.75rem', fontWeight: 500 }}>{s.student_name}</td>
                                                <td style={{ padding: '0.75rem' }}>{s.roll_number}</td>
                                                <td style={{ padding: '0.75rem' }}>{s.present_count}/{s.total_days}</td>
                                                <td style={{ padding: '0.75rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ flex: 1, height: '8px', borderRadius: '4px', backgroundColor: 'var(--glass-border)', overflow: 'hidden' }}>
                                                            <div style={{
                                                                width: `${Math.min(s.attendance_percentage, 100)}%`,
                                                                height: '100%',
                                                                borderRadius: '4px',
                                                                backgroundColor: getPercentColor(s.attendance_percentage)
                                                            }}></div>
                                                        </div>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getPercentColor(s.attendance_percentage), minWidth: '42px', textAlign: 'right' }}>
                                                            {s.attendance_percentage}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={fetchSummary}>
                            <RefreshCw size={16} /> Refresh
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
