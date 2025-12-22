// Leaderboard API module
// Replace this URL with your Google Apps Script web app URL
const LEADERBOARD_URL = '';

// Fetch leaderboard data from Google Sheets
async function fetchLeaderboard() {
    if (!LEADERBOARD_URL) {
        console.log('Leaderboard URL not configured');
        return [];
    }

    try {
        const response = await fetch(LEADERBOARD_URL);
        if (!response.ok) {
            throw new Error('Failed to fetch leaderboard');
        }
        const data = await response.json();
        leaderboardData = data;
        return data;
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
}

// Submit a score to the leaderboard
async function submitScore(name, time) {
    if (!LEADERBOARD_URL) {
        console.log('Leaderboard URL not configured - score not submitted');
        // Add to local leaderboard for testing
        leaderboardData.push({ name, time, date: new Date().toISOString() });
        leaderboardData.sort((a, b) => a.time - b.time);
        leaderboardData = leaderboardData.slice(0, 10);
        return leaderboardData;
    }

    try {
        const response = await fetch(LEADERBOARD_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, time }),
        });

        if (!response.ok) {
            throw new Error('Failed to submit score');
        }

        const data = await response.json();
        leaderboardData = data;
        return data;
    } catch (error) {
        console.error('Error submitting score:', error);
        // Fallback: add to local data
        leaderboardData.push({ name, time, date: new Date().toISOString() });
        leaderboardData.sort((a, b) => a.time - b.time);
        leaderboardData = leaderboardData.slice(0, 10);
        return leaderboardData;
    }
}

// Fetch leaderboard on page load
fetchLeaderboard();
