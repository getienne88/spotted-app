'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, signIn, signUp, signOut, getUser, getUserReports, getViolationTypes, createReport, calculateUserStats, uploadPhoto } from '../lib/supabase';

// Violation type data (fallback if DB not loaded)
const defaultViolations = [
  { id: 'hydrant', label: 'Fire Hydrant', fine: 115, icon: '🚒', description: 'Within 15ft of hydrant' },
  { id: 'double', label: 'Double Parked', fine: 115, icon: '🚗', description: 'Blocking travel lane' },
  { id: 'bike', label: 'Bike Lane', fine: 175, icon: '🚲', description: 'Blocking bicycle lane' },
  { id: 'bus', label: 'Bus Stop/Lane', fine: 175, icon: '🚌', description: 'In bus zone or lane' },
  { id: 'crosswalk', label: 'Crosswalk', fine: 115, icon: '🚶', description: 'Blocking pedestrian crossing' },
  { id: 'sidewalk', label: 'Sidewalk', fine: 115, icon: '♿', description: 'On sidewalk/ramp' },
];

export default function Home() {
  // Auth state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState('signin'); // signin, signup
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // App state
  const [activeTab, setActiveTab] = useState('home');
  const [screen, setScreen] = useState('home');
  const [violations, setViolations] = useState(defaultViolations);
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  
  // Report creation state
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [plateNumber, setPlateNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [location, setLocation] = useState(null);
  
  const fileInputRef = useRef(null);

  // Check auth on mount
  useEffect(() => {
    checkUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkUser() {
    try {
      const currentUser = await getUser();
      setUser(currentUser);
      if (currentUser) {
        await loadUserData(currentUser.id);
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadUserData(userId) {
    try {
      // Load violation types
      const { data: violationData } = await getViolationTypes();
      if (violationData) setViolations(violationData);

      // Load user reports
      const { data: reportsData } = await getUserReports(userId);
      if (reportsData) setReports(reportsData);

      // Calculate stats
      const statsData = await calculateUserStats(userId);
      if (statsData) setStats(statsData);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (authMode === 'signup') {
        const { error } = await signUp(authEmail, authPassword, authName);
        if (error) throw error;
        setAuthError('Check your email for confirmation link!');
      } else {
        const { error } = await signIn(authEmail, authPassword);
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setReports([]);
    setStats(null);
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result);
        setScreen('select-violation');
      };
      reader.readAsDataURL(file);

      // Get location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => console.log('Location error:', err)
        );
      }
    }
  }

  async function handleSubmit() {
    if (!user || !selectedViolation || !uploadedFile) return;
    
    setIsSubmitting(true);
    try {
      // Upload photo first
      let photoUrl = null;
      if (uploadedFile) {
        const { data: uploadData, error: uploadError } = await uploadPhoto(uploadedFile, user.id);
        if (uploadError) {
          console.error('Upload error:', uploadError);
        } else {
          photoUrl = uploadData?.url;
        }
      }

      // Create report
      const { data, error } = await createReport({
        violationType: selectedViolation,
        latitude: location?.lat,
        longitude: location?.lng,
        locationText: 'Brooklyn, NY', // TODO: reverse geocode
        photoUrl,
        plateNumber
      });

      if (error) throw error;

      // Show success and reset
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setScreen('home');
        setActiveTab('home');
        setUploadedImage(null);
        setUploadedFile(null);
        setSelectedViolation(null);
        setPlateNumber('');
        loadUserData(user.id);
      }, 3000);

    } catch (error) {
      console.error('Submit error:', error);
      alert('Error submitting report: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedViolationData = violations.find(v => v.id === selectedViolation);
  const estimatedReward = selectedViolationData ? (selectedViolationData.fine * 0.10).toFixed(2) : '0.00';

  // Loading screen
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">👁️</div>
          <div className="w-8 h-8 border-2 border-spotted-green border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  // Auth screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-spotted-green to-spotted-green-dark rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg shadow-spotted-green/30">
              👁️
            </div>
            <h1 className="text-3xl font-bold">Spotted</h1>
            <p className="text-white/50 mt-1">Safer streets. Rewarded.</p>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <input
                type="text"
                placeholder="Full name"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                className="w-full p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-spotted-green"
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-spotted-green"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-spotted-green"
              required
              minLength={6}
            />

            {authError && (
              <p className={`text-sm ${authError.includes('Check your email') ? 'text-spotted-green' : 'text-red-400'}`}>
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full p-4 bg-gradient-to-r from-spotted-green to-spotted-green-dark rounded-xl font-semibold text-white shadow-lg shadow-spotted-green/30 disabled:opacity-50"
            >
              {authLoading ? 'Loading...' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p className="text-center mt-6 text-white/50">
            {authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); }}
              className="text-spotted-green font-medium"
            >
              {authMode === 'signup' ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Main app
  return (
    <div className="min-h-screen relative">
      {/* Background texture */}
      <div className="fixed inset-0 opacity-30" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)',
        backgroundSize: '24px 24px'
      }} />
      
      {/* Accent glow */}
      <div className="fixed -top-1/4 -right-1/4 w-1/2 h-1/2 bg-spotted-green/10 rounded-full blur-3xl pointer-events-none" />

      {/* Phone frame */}
      <div className="max-w-md mx-auto min-h-screen relative z-10 pb-24">
        
        {/* Header */}
        <header className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-spotted-green to-spotted-green-dark rounded-xl flex items-center justify-center text-xl shadow-lg shadow-spotted-green/30">
              👁️
            </div>
            <div>
              <h1 className="text-lg font-bold">Spotted</h1>
              <p className="text-xs text-white/50">Safer streets. Rewarded.</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-5">
          
          {/* HOME TAB */}
          {activeTab === 'home' && screen === 'home' && (
            <div className="animate-fade-in">
              {/* Impact Card */}
              <div className="bg-spotted-green/10 rounded-2xl p-6 border border-spotted-green/20 mb-6 relative overflow-hidden">
                <div className="absolute -top-4 -right-4 text-8xl opacity-10">🏆</div>
                <p className="text-xs text-spotted-green font-semibold tracking-wider mb-2">YOUR IMPACT</p>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-5xl font-extrabold">{stats?.total_reports || 0}</span>
                  <span className="text-lg text-white/60">violations reported</span>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full mb-4">
                  <span className="text-green-400 text-sm font-bold">
                    💵 ${stats?.total_earned?.toFixed(2) || '0.00'} earned
                  </span>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-white/40">PENDING</p>
                    <p className="text-lg font-semibold text-spotted-yellow">{stats?.pending_reports || 0} reports</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">SUCCESS RATE</p>
                    <p className="text-lg font-semibold text-spotted-green">{stats?.success_rate || 0}%</p>
                  </div>
                </div>
              </div>

              {/* Report Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-5 bg-gradient-to-r from-spotted-green to-spotted-green-dark rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-spotted-green/30 mb-4"
              >
                <span className="text-2xl">👁️</span>
                Spot a Violation
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                className="hidden"
              />

              {/* Reminder */}
              <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20 flex items-center gap-3 mb-6">
                <span className="text-xl">💡</span>
                <p className="text-sm text-white/80">
                  <strong>Remember:</strong> Vehicle must be unoccupied & plate must be visible
                </p>
              </div>

              {/* Recent Activity */}
              {reports.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-white/40 tracking-wider mb-4">RECENT ACTIVITY</h3>
                  {reports.slice(0, 5).map((report) => (
                    <div key={report.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl mb-2 border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                          report.status === 'approved' ? 'bg-green-500/20' :
                          report.status === 'pending' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                        }`}>
                          {report.violation_types?.icon || '📋'}
                        </div>
                        <div>
                          <p className="font-medium">{report.violation_types?.label || report.violation_type}</p>
                          <p className="text-xs text-white/40">
                            {new Date(report.reported_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${
                          report.status === 'approved' ? 'text-spotted-green' :
                          report.status === 'pending' ? 'text-spotted-yellow' : 'text-spotted-red'
                        }`}>
                          {report.status === 'approved' ? `+$${report.reward_amount?.toFixed(2)}` :
                           report.status === 'pending' ? 'Pending' : 'Rejected'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SELECT VIOLATION SCREEN */}
          {screen === 'select-violation' && (
            <div className="animate-fade-in">
              <button
                onClick={() => { setScreen('home'); setUploadedImage(null); }}
                className="text-white/60 text-sm mb-5"
              >
                ← Cancel
              </button>

              {uploadedImage && (
                <div className="w-full h-48 rounded-2xl overflow-hidden mb-6 border-2 border-spotted-green/30">
                  <img src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover" />
                </div>
              )}

              <h2 className="text-2xl font-bold mb-2">What's the violation?</h2>
              <p className="text-white/50 text-sm mb-5">Select the type of violation</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {violations.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedViolation(v.id)}
                    className={`p-4 rounded-xl text-left transition-all ${
                      selectedViolation === v.id
                        ? 'bg-spotted-green/20 border-2 border-spotted-green'
                        : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    <span className="text-2xl block mb-2">{v.icon}</span>
                    <p className="font-semibold text-sm">{v.label}</p>
                    <p className="text-xs text-white/40 mt-1">{v.description}</p>
                    <p className="text-sm text-spotted-green font-semibold mt-2">
                      +${(v.fine * 0.10).toFixed(2)} reward
                    </p>
                  </button>
                ))}
              </div>

              {selectedViolation && (
                <button
                  onClick={() => setScreen('review')}
                  className="w-full p-4 bg-gradient-to-r from-spotted-green to-spotted-green-dark rounded-xl font-semibold"
                >
                  Continue →
                </button>
              )}
            </div>
          )}

          {/* REVIEW SCREEN */}
          {screen === 'review' && (
            <div className="animate-fade-in">
              <button
                onClick={() => setScreen('select-violation')}
                className="text-white/60 text-sm mb-5"
              >
                ← Back
              </button>

              <h2 className="text-2xl font-bold mb-6">Review & Submit</h2>

              {/* Summary */}
              <div className="bg-white/5 rounded-xl p-4 mb-5 border border-white/10">
                <div className="flex gap-4">
                  {uploadedImage && (
                    <img src={uploadedImage} alt="Violation" className="w-20 h-20 rounded-lg object-cover" />
                  )}
                  <div>
                    <div className="inline-block bg-spotted-green/20 px-2 py-1 rounded text-xs text-spotted-green mb-2">
                      {selectedViolationData?.icon} {selectedViolationData?.label}
                    </div>
                    <p className="text-xs text-white/40">📍 {location ? 'Location captured' : 'Brooklyn, NY'}</p>
                  </div>
                </div>
              </div>

              {/* Plate Input */}
              <div className="mb-5">
                <label className="block text-sm text-white/50 mb-2">
                  License Plate <span className="text-white/30">(helps speed up review)</span>
                </label>
                <input
                  type="text"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="e.g., ABC-1234"
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-xl text-white text-lg font-mono tracking-wider outline-none focus:border-spotted-green"
                />
              </div>

              {/* Reward Estimate */}
              <div className="bg-spotted-green/10 rounded-xl p-5 mb-6 text-center border border-spotted-green/20">
                <p className="text-xs text-white/50 tracking-wider">ESTIMATED REWARD</p>
                <p className="text-4xl font-bold text-spotted-green mt-2">${estimatedReward}</p>
                <p className="text-xs text-white/40 mt-1">10% of ${selectedViolationData?.fine} fine</p>
              </div>

              {/* Disclaimer */}
              <div className="bg-yellow-500/10 rounded-xl p-4 mb-6 border border-yellow-500/20">
                <p className="text-xs text-yellow-200/80">
                  ⚠️ By submitting, I certify this report is accurate. The vehicle was unoccupied. False reports may result in account suspension.
                </p>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full p-5 bg-gradient-to-r from-spotted-green to-spotted-green-dark rounded-xl font-bold text-lg disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Submitting...
                  </span>
                ) : (
                  'Submit Report 🎯'
                )}
              </button>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold mb-2">Report History</h2>
              <p className="text-white/50 text-sm mb-6">{reports.length} total reports</p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-green-500/10 rounded-xl p-4 text-center border border-green-500/20">
                  <p className="text-2xl font-bold text-green-400">{stats?.approved_reports || 0}</p>
                  <p className="text-xs text-white/50">Approved</p>
                </div>
                <div className="bg-yellow-500/10 rounded-xl p-4 text-center border border-yellow-500/20">
                  <p className="text-2xl font-bold text-yellow-400">{stats?.pending_reports || 0}</p>
                  <p className="text-xs text-white/50">Pending</p>
                </div>
                <div className="bg-red-500/10 rounded-xl p-4 text-center border border-red-500/20">
                  <p className="text-2xl font-bold text-red-400">{stats?.rejected_reports || 0}</p>
                  <p className="text-xs text-white/50">Rejected</p>
                </div>
              </div>

              {/* Report List */}
              {reports.map((report) => (
                <div key={report.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl mb-2 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl ${
                      report.status === 'approved' ? 'bg-green-500/20' :
                      report.status === 'pending' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                    }`}>
                      {report.violation_types?.icon || '📋'}
                    </div>
                    <div>
                      <p className="font-semibold">{report.violation_types?.label || report.violation_type}</p>
                      <p className="text-xs text-white/40">
                        {new Date(report.reported_at).toLocaleDateString()} • {report.plate_number || 'No plate'}
                      </p>
                      <p className="text-xs text-white/30">{report.location_text}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${
                      report.status === 'approved' ? 'text-green-400' :
                      report.status === 'pending' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {report.status === 'approved' ? `+$${report.reward_amount?.toFixed(2)}` :
                       report.status === 'pending' ? 'Pending' : 'Rejected'}
                    </p>
                  </div>
                </div>
              ))}

              {reports.length === 0 && (
                <div className="text-center py-12 text-white/40">
                  <p className="text-4xl mb-3">📋</p>
                  <p>No reports yet. Spot your first violation!</p>
                </div>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold mb-6">Settings</h2>

              {/* Profile */}
              <div className="bg-white/5 rounded-2xl p-5 mb-4 border border-white/10">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-spotted-green to-spotted-green-dark rounded-full flex items-center justify-center text-2xl font-bold">
                    {user?.email?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-semibold">{user?.user_metadata?.full_name || 'Spotted User'}</p>
                    <p className="text-sm text-white/50">{user?.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-white/40">REPORTS</p>
                    <p className="text-xl font-bold">{stats?.total_reports || 0}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-white/40">EARNED</p>
                    <p className="text-xl font-bold text-spotted-green">${stats?.total_earned?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
              </div>

              {/* Sign Out */}
              <button
                onClick={handleSignOut}
                className="w-full p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 font-semibold"
              >
                Sign Out
              </button>

              <p className="text-center text-xs text-white/20 mt-6">Spotted v1.0.0 (Beta)</p>
            </div>
          )}
        </main>

        {/* Success Modal */}
        {showSuccess && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-gradient-to-b from-gray-900 to-black rounded-3xl p-8 text-center border border-spotted-green/30 max-w-xs animate-scale-in">
              <div className="w-20 h-20 bg-gradient-to-br from-spotted-green to-spotted-green-dark rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-lg shadow-spotted-green/40">
                ✓
              </div>
              <h2 className="text-2xl font-bold mb-2">Report Submitted! 🎯</h2>
              <p className="text-white/50 text-sm mb-4">Thanks for helping keep streets safe.</p>
              <div className="bg-spotted-green/15 rounded-xl p-4 border border-spotted-green/20">
                <p className="text-xs text-white/40">YOUR REWARD</p>
                <p className="text-3xl font-bold text-spotted-green">+${estimatedReward}</p>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-black/95 border-t border-white/10 p-4 flex justify-around backdrop-blur-xl">
          {[
            { id: 'home', icon: '🏠', label: 'Home' },
            { id: 'history', icon: '📜', label: 'History' },
            { id: 'settings', icon: '⚙️', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setScreen('home'); }}
              className={`flex flex-col items-center gap-1 ${
                activeTab === tab.id ? 'text-spotted-green' : 'text-white/40'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
