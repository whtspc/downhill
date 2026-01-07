// Leaderboard API module
// Replace this URL with your Google Apps Script web app URL
const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbwe2zV953jKE6AqhZpgAePmnpjqCmtjLhlnjK-kGDDTj-y00G4_2zmV6bs7hMZmEFyh/exec';

// Global leaderboard data
let leaderboardData = [];
let leaderboardLoading = false;

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

    leaderboardLoading = true;
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
        return leaderboardData;
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
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
        return leaderboardData;
    } catch (error) {
        console.error('Error submitting score:', error);
        // Fallback: add to local data
        leaderboardData.push({ name, type, value, date: new Date().toISOString() });
        leaderboardData.sort(compareScoresLeaderboard);
        leaderboardData = leaderboardData.slice(0, 10);
        return leaderboardData;
    } finally {
        leaderboardLoading = false;
    }
}

// Fetch leaderboard on page load
fetchLeaderboard();
