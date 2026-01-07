// Leaderboard API module
// Replace this URL with your Google Apps Script web app URL
const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbwe2zV953jKE6AqhZpgAePmnpjqCmtjLhlnjK-kGDDTj-y00G4_2zmV6bs7hMZmEFyh/exec';

// Cache key for localStorage
const LEADERBOARD_CACHE_KEY = 'downhill_leaderboard_cache';

// Global leaderboard data
let leaderboardData = [];
let leaderboardLoading = false;

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

// Fetch leaderboard data from Google Sheets
async function fetchLeaderboard() {
    if (!LEADERBOARD_URL) {
        console.log('Leaderboard URL not configured');
        return [];
    }

    // Only show loading if we don't have cached data
    if (leaderboardData.length === 0) {
        leaderboardLoading = true;
    }

    try {
        // Use redirect: 'follow' for Google Apps Script
        const response = await fetch(LEADERBOARD_URL, {
            method: 'GET',
            redirect: 'follow'
        });
        if (!response.ok) {
            throw new Error('Failed to fetch leaderboard');
        }
        const data = await response.json();
        // Ensure data has the new format (type, value)
        leaderboardData = data.map(entry => ({
            name: entry.name,
            type: entry.type || 'time', // Default to 'time' for backwards compatibility
            value: entry.value !== undefined ? entry.value : entry.time
        }));
        leaderboardData.sort(compareScoresLeaderboard);
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
    if (!LEADERBOARD_URL) {
        console.log('Leaderboard URL not configured - score not submitted');
        // Add to local leaderboard for testing
        leaderboardData.push({ name, type, value, date: new Date().toISOString() });
        leaderboardData.sort(compareScoresLeaderboard);
        leaderboardData = leaderboardData.slice(0, 10);
        saveCachedLeaderboard();
        return leaderboardData;
    }

    leaderboardLoading = true;
    try {
        // Use POST with text/plain to avoid CORS preflight
        // Google Apps Script will parse the JSON from the text body
        const response = await fetch(LEADERBOARD_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ name, type, value }),
        });

        if (!response.ok) {
            throw new Error('Failed to submit score');
        }

        const data = await response.json();
        // Ensure data has the new format
        leaderboardData = data.map(entry => ({
            name: entry.name,
            type: entry.type || 'time',
            value: entry.value !== undefined ? entry.value : entry.time
        }));
        leaderboardData.sort(compareScoresLeaderboard);
        // Cache the updated data
        saveCachedLeaderboard();
        return leaderboardData;
    } catch (error) {
        console.error('Error submitting score:', error);
        // Fallback: add to local data
        leaderboardData.push({ name, type, value, date: new Date().toISOString() });
        leaderboardData.sort(compareScoresLeaderboard);
        leaderboardData = leaderboardData.slice(0, 10);
        saveCachedLeaderboard();
        return leaderboardData;
    } finally {
        leaderboardLoading = false;
    }
}

// Load cached data immediately, then fetch fresh data
loadCachedLeaderboard();
fetchLeaderboard();
