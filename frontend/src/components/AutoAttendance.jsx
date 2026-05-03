import React, { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Camera, CheckCircle, AlertCircle, RefreshCw, XCircle, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'https://smart-attendance-backend-62hr.onrender.com';

const AutoAttendance = () => {
    const webcamRef = useRef(null);
    const [status, setStatus] = useState('scanning'); // scanning, processing, results, error
    const [message, setMessage] = useState('');
    const [scanResults, setScanResults] = useState(null); // { results: [], total_faces, recognized, unknown }
    const captureAndVerify = useCallback(async () => {
        if (!webcamRef.current) return;

        const imageSrc1 = webcamRef.current.getScreenshot();
        if (!imageSrc1) return;

        // Wait 1000ms (1 second) and capture the second frame for ultra-strict liveness (movement) check
        await new Promise(resolve => setTimeout(resolve, 1000));
        const imageSrc2 = webcamRef.current.getScreenshot();

        setStatus('processing');
        setScanResults(null);

        try {
            const res = await axios.post(`${API}/attendance/mark-auto`, {
                image_base64: imageSrc1,
                image_base64_2: imageSrc2
            });

            setScanResults(res.data);
            setStatus('results');

            // Reset back to scanning after 6 seconds
            setTimeout(() => {
                setStatus('scanning');
                setScanResults(null);
                setMessage('');
            }, 6000);

        } catch (err) {
            setStatus('error');
            let errorMsg = "No faces detected or error occurred.";
            if (err.response?.data?.detail) {
                if (Array.isArray(err.response.data.detail)) {
                    errorMsg = err.response.data.detail.map(d => d.msg).join(", ");
                } else if (typeof err.response.data.detail === 'string') {
                    errorMsg = err.response.data.detail;
                } else {
                    errorMsg = JSON.stringify(err.response.data.detail);
                }
            }
            setMessage(errorMsg);

            // Reset back to scanning faster on error
            setTimeout(() => {
                setStatus('scanning');
                setMessage('');
            }, 3000);
        }
    }, [webcamRef]);

    const getStatusIcon = (faceStatus) => {
        switch (faceStatus) {
            case 'new_present': return <CheckCircle size={28} />;
            case 'already_present': return <RefreshCw size={28} />;
            case 'unknown': return <UserX size={28} />;
            default: return <AlertCircle size={28} />;
        }
    };

    const getStatusColor = (faceStatus) => {
        switch (faceStatus) {
            case 'new_present': return { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#10b981' };
            case 'already_present': return { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#f59e0b' };
            case 'unknown': return { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#ef4444' };
            default: return { bg: 'rgba(100,100,100,0.15)', border: '#666', text: '#666' };
        }
    };

    const getStatusLabel = (faceStatus) => {
        switch (faceStatus) {
            case 'new_present': return '✅ Attendance Marked';
            case 'already_present': return '🟡 Already Present';
            case 'unknown': return '🔴 Unknown Face';
            default: return faceStatus;
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}>
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>

                <h1 style={{ marginBottom: '1rem', fontSize: '2.5rem', textAlign: 'center' }}>Automated Attendance Scanner</h1>
                <p style={{ marginBottom: '2rem', color: 'var(--text-muted)', fontSize: '1.2rem', textAlign: 'center' }}>
                    Stand in front of the camera, multiple faces are detected simultaneously.
                </p>

                <div style={{ width: '100%', maxWidth: '1100px', display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>

                    {/* Camera Panel */}
                    <div className="glass-panel" style={{ flex: '1 1 500px', maxWidth: '700px', padding: '2rem', position: 'relative', overflow: 'hidden' }}>

                        {/* Processing Overlay */}
                        {status === 'processing' && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                <div className="loader" style={{ width: '60px', height: '60px', borderWidth: '5px' }}></div>
                                <h2 style={{ marginTop: '1.5rem' }}>Scanning All Faces...</h2>
                            </div>
                        )}

                        {/* Error Overlay */}
                        {status === 'error' && (
                            <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', backgroundColor: 'var(--accent)', color: 'white', padding: '1rem', borderRadius: '8px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontWeight: 'bold' }}>
                                <XCircle size={24} /> {message}
                            </div>
                        )}

                        <div style={{ borderRadius: '12px', overflow: 'hidden', backgroundColor: '#000', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', position: 'relative' }}>
                            <Webcam
                                audio={false}
                                ref={webcamRef}
                                screenshotFormat="image/jpeg"
                                videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                                style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
                            />

                            {/* Scanning HUD Overlay */}
                            <div style={{ position: 'absolute', inset: '10%', border: '2px solid rgba(56, 189, 248, 0.5)', borderRadius: '20px', pointerEvents: 'none' }}>
                                <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '30px', height: '30px', borderTop: '4px solid var(--primary)', borderLeft: '4px solid var(--primary)' }}></div>
                                <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '30px', height: '30px', borderTop: '4px solid var(--primary)', borderRight: '4px solid var(--primary)' }}></div>
                                <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '30px', height: '30px', borderBottom: '4px solid var(--primary)', borderLeft: '4px solid var(--primary)' }}></div>
                                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '30px', height: '30px', borderBottom: '4px solid var(--primary)', borderRight: '4px solid var(--primary)' }}></div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '1.5rem 4rem', fontSize: '1.5rem', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 20px rgba(56, 189, 248, 0.4)' }}
                                onClick={captureAndVerify}
                                disabled={status !== 'scanning'}
                            >
                                <Camera size={32} /> FAST SCAN
                            </button>
                        </div>
                    </div>

                    {/* Results Panel */}
                    {status === 'results' && scanResults && (
                        <div className="glass-panel" style={{ flex: '1 1 320px', maxWidth: '400px', padding: '1.5rem', animation: 'fadeIn 0.3s' }}>
                            {/* Summary Header */}
                            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>Scan Results</h2>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem' }}>
                                    <strong>{scanResults.total_faces}</strong> face{scanResults.total_faces !== 1 ? 's' : ''} detected
                                    {' · '}
                                    <span style={{ color: '#10b981' }}>{scanResults.recognized} recognized</span>
                                    {scanResults.unknown > 0 && (
                                        <>
                                            {' · '}
                                            <span style={{ color: '#ef4444' }}>{scanResults.unknown} unknown</span>
                                        </>
                                    )}
                                </p>
                            </div>

                            {/* Per-face result cards */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {scanResults.results.map((face, index) => {
                                    const colors = getStatusColor(face.status);
                                    return (
                                        <div key={index} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            padding: '1rem 1.25rem',
                                            borderRadius: '12px',
                                            backgroundColor: colors.bg,
                                            border: `1px solid ${colors.border}`,
                                            animation: `fadeIn 0.3s ${index * 0.1}s both`
                                        }}>
                                            <div style={{ color: colors.text, flexShrink: 0 }}>
                                                {getStatusIcon(face.status)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontWeight: 'bold',
                                                    fontSize: '1.15rem',
                                                    color: face.status === 'unknown' ? colors.text : 'var(--text-color)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {face.student_name === 'Spoof Attempt' ? (
                                                        <span style={{ color: '#ef4444' }}>🚫 SPOOF DETECTED</span>
                                                    ) : (
                                                        face.student_name
                                                    )}
                                                </div>
                                                {face.roll_number && (
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        Roll: {face.roll_number}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '0.8rem', color: colors.text, marginTop: '0.25rem' }}>
                                                    {face.student_name === 'Spoof Attempt' ? (
                                                        'Static image detected - Attendance blocked'
                                                    ) : (
                                                        getStatusLabel(face.status)
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AutoAttendance;

