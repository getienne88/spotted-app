import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// AUTH HELPERS
// ============================================

export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });
  return { data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ============================================
// PROFILE HELPERS
// ============================================

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

// ============================================
// VIOLATION TYPES
// ============================================

export async function getViolationTypes() {
  const { data, error } = await supabase
    .from('violation_types')
    .select('*')
    .order('label');
  return { data, error };
}

// ============================================
// REPORTS HELPERS
// ============================================

export async function createReport({ 
  violationType, 
  latitude, 
  longitude, 
  locationText, 
  photoUrl, 
  plateNumber 
}) {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');

  // Get the fine amount for this violation type
  const { data: violationData } = await supabase
    .from('violation_types')
    .select('fine')
    .eq('id', violationType)
    .single();

  const fineAmount = violationData?.fine || 115;
  const rewardAmount = fineAmount * 0.10;

  const { data, error } = await supabase
    .from('reports')
    .insert({
      user_id: user.id,
      violation_type: violationType,
      latitude,
      longitude,
      location_text: locationText,
      photo_url: photoUrl,
      plate_number: plateNumber?.toUpperCase(),
      fine_amount: fineAmount,
      reward_amount: rewardAmount,
      status: 'pending'
    })
    .select()
    .single();

  return { data, error };
}

export async function getUserReports(userId, limit = 50) {
  const { data, error } = await supabase
    .from('reports')
    .select(`
      *,
      violation_types (
        label,
        icon,
        fine
      )
    `)
    .eq('user_id', userId)
    .order('reported_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

export async function getReportById(reportId) {
  const { data, error } = await supabase
    .from('reports')
    .select(`
      *,
      violation_types (
        label,
        icon,
        fine
      )
    `)
    .eq('id', reportId)
    .single();

  return { data, error };
}

// ============================================
// STATS HELPERS
// ============================================

export async function getUserStats(userId) {
  const { data, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  return { data, error };
}

// Manual stats calculation (backup if view doesn't work)
export async function calculateUserStats(userId) {
  const { data: reports } = await getUserReports(userId, 1000);
  
  if (!reports) return null;

  const approved = reports.filter(r => r.status === 'approved');
  const pending = reports.filter(r => r.status === 'pending');
  const rejected = reports.filter(r => r.status === 'rejected');

  return {
    total_reports: reports.length,
    approved_reports: approved.length,
    pending_reports: pending.length,
    rejected_reports: rejected.length,
    total_earned: approved.reduce((sum, r) => sum + (r.reward_amount || 0), 0),
    pending_earnings: pending.reduce((sum, r) => sum + (r.reward_amount || 0), 0),
    success_rate: reports.length > 0 
      ? Math.round((approved.length / reports.length) * 100) 
      : 0
  };
}

// ============================================
// PHOTO UPLOAD HELPERS
// ============================================

export async function uploadPhoto(file, userId) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('violation-photos')
    .upload(fileName, file);

  if (error) return { data: null, error };

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('violation-photos')
    .getPublicUrl(fileName);

  return { data: { path: data.path, url: publicUrl }, error: null };
}

// ============================================
// DUPLICATE CHECK
// ============================================

export async function checkDuplicate(plateNumber, latitude, longitude, violationType) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('reports')
    .select('id')
    .eq('plate_number', plateNumber?.toUpperCase())
    .eq('violation_type', violationType)
    .gte('reported_at', twoHoursAgo)
    .limit(1);

  if (error) return { isDuplicate: false, error };
  
  return { isDuplicate: data && data.length > 0, error: null };
}
