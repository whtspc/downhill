// Leaderboard API module - Supabase backend
// ============================================
// SETUP INSTRUCTIONS:
// 1. Go to https://supabase.com and create a free account
// 2. Create a new project
// 3. Go to SQL Editor and run this query to create the table:
//
//    CREATE TABLE leaderboard (
//      id SERIAL PRIMARY KEY,
//      name TEXT NOT NULL,
//      type TEXT NOT NULL CHECK (type IN ('time', 'distance')),
//      value NUMERIC NOT NULL,
//      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
//    );
//
//    -- Enable Row Level Security but allow all operations for anon
//    ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
//    CREATE POLICY "Allow all" ON leaderboard FOR ALL USING (true) WITH CHECK (true);
//
// 4. Go to Project Settings > API and copy:
//    - Project URL (paste below as SUPABASE_URL)
//    - anon public key (paste below as SUPABASE_ANON_KEY)
// ============================================

// Replace these with your Supabase project credentials
const SUPABASE_URL = 'https://srxehxudmlpheagaypiw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyeGVoeHVkbWxwaGVhZ2F5cGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODUzMTMsImV4cCI6MjA4MzM2MTMxM30.pcuvRVyTRK5CXL30kEuV31PFcPD8Wa4bonFDhNKgwCA';

// Cache key for localStorage
const LEADERBOARD_CACHE_KEY = 'downhill_leaderboard_cache';

// Global leaderboard data
let leaderboardData = [];
let leaderboardLoading = false;

// Supabase client (initialized after script loads)
let supabaseClient = null;

// Initialize Supabase client
function initSupabase() {
    if (typeof window.supabase !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return true;
    }
    return false;
}

// Load cached data from localStorage
function loadCachedLeaderboard() {
    try {
        const cached = localStorage.getItem(LEADERBOARD_CACHE_KEY);
        if (cached) {
            leaderboardData = JSON.parse(cached);
            leaderboardData.sort(compareScoresLeaderboard);
        }
    } catch (e) {
        console.log('No cached leaderboard data');
    }
}

// Save data to localStorage cache
function saveCachedLeaderboard() {
    try {
        localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(leaderboardData));
    } catch (e) {
        console.log('Could not cache leaderboard data');
    }
}

// Compare scores for sorting (time > distance, lower time better, higher distance better)
function compareScoresLeaderboard(a, b) {
    // Time scores always rank above distance scores
    if (a.type === 'time' && b.type === 'distance') return -1;
    if (a.type === 'distance' && b.type === 'time') return 1;

    // Same type: lower time is better, higher distance is better
    if (a.type === 'time') return a.value - b.value;
    return b.value - a.value;
}

// Fetch leaderboard data from Supabase
async function fetchLeaderboard() {
    // Initialize Supabase if not done yet
    if (!supabaseClient) {
        if (!initSupabase()) {
            console.log('Supabase not configured - using local data only');
            return leaderboardData;
        }
    }

    // Only show loading if we don't have cached data
    if (leaderboardData.length === 0) {
        leaderboardLoading = true;
    }

    try {
        // Fetch all scores, we'll sort them client-side
        const { data, error } = await supabaseClient
            .from('leaderboard')
            .select('name, type, value, created_at')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Transform and sort data
        leaderboardData = data.map(entry => ({
            name: entry.name,
            type: entry.type,
            value: Number(entry.value)
        }));
        leaderboardData.sort(compareScoresLeaderboard);

        // Keep only top entries
        leaderboardData = leaderboardData.slice(0, 50);

        // Cache the fresh data
        saveCachedLeaderboard();
        return leaderboardData;
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return leaderboardData; // Return cached data on error
    } finally {
        leaderboardLoading = false;
    }
}

// Submit a score to the leaderboard
async function submitScore(name, type, value) {
    // Initialize Supabase if not done yet
    if (!supabaseClient) {
        if (!initSupabase()) {
            console.log('Supabase not configured - score not submitted');
            // Add to local leaderboard for testing
            leaderboardData.push({ name, type, value });
            leaderboardData.sort(compareScoresLeaderboard);
            leaderboardData = leaderboardData.slice(0, 50);
            saveCachedLeaderboard();
            return leaderboardData;
        }
    }

    leaderboardLoading = true;
    try {
        // Insert the new score
        const { error } = await supabaseClient
            .from('leaderboard')
            .insert([{ name, type, value }]);

        if (error) throw error;

        // Fetch updated leaderboard
        await fetchLeaderboard();
        return leaderboardData;
    } catch (error) {
        console.error('Error submitting score:', error);
        // Fallback: add to local data
        leaderboardData.push({ name, type, value });
        leaderboardData.sort(compareScoresLeaderboard);
        leaderboardData = leaderboardData.slice(0, 50);
        saveCachedLeaderboard();
        return leaderboardData;
    } finally {
        leaderboardLoading = false;
    }
}

// Load cached data immediately, then fetch fresh data
loadCachedLeaderboard();
// Delay fetch slightly to ensure Supabase script is loaded
setTimeout(() => {
    fetchLeaderboard();
}, 100);
