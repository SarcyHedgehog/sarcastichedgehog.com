## Tutorial 4: Efficient Historical Data with Score Persistence

### The Challenge

VoteTogether needs to:
- Store complete voting history for reference
- Keep total scores even after 50+ polls
- Maintain performance as data grows
- Show recent activity while preserving long-term stats

### The Solution: Hybrid Storage Strategy

VoteTogether uses a clever dual-storage approach that keeps detailed recent history while preserving cumulative statistics.

### Implementation

**Data Structure:**
```javascript
// Model state structure
{
    // Recent detailed history (last ~20 polls)
    polls: [
        {
            id: 1627834567890,
            question: "Will it rain tomorrow?",
            options: ["Yes", "No"],
            votes: [
                { username: "Alice", voteIndex: 0, guessIndex: 1 },
                { username: "Bob", voteIndex: 1, guessIndex: 0 }
            ],
            result: { winningIndex: 0, isComplete: true }
        }
        // ... more recent polls
    ],
    
    // Persistent cumulative scores
    scores: {
        "Alice": { total: 847, pollsParticipated: 156 },
        "Bob": { total: 923, pollsParticipated: 203 },
        "Charlie": { total: 445, pollsParticipated: 89 }
    },
    
    // Archive summary (optional)
    archiveStats: {
        totalPolls: 156,
        oldestPollDate: "2024-01-15",
        lastArchiveDate: "2024-07-01"
    }
}
```

**Adding New Poll Results:**
```javascript
function completePoll(pollId, winningIndex) {
    const poll = state.polls.find(p => p.id === pollId);
    if (!poll || poll.result.isComplete) return;
    
    // Mark poll as complete
    poll.result = { winningIndex, isComplete: true };
    
    // Update cumulative scores
    poll.votes.forEach(vote => {
        const username = vote.username;
        
        // Initialize user scores if needed
        if (!state.scores[username]) {
            state.scores[username] = { total: 0, pollsParticipated: 0 };
        }
        
        // Award points for correct prediction
        const earnedPoints = (vote.guessIndex === winningIndex) ? 10 : 0;
        
        // Update persistent totals
        state.scores[username].total += earnedPoints;
        state.scores[username].pollsParticipated += 1;
    });
    
    // Trigger archive if needed
    if (state.polls.length > 25) {
        archiveOldPolls();
    }
    
    this.publish(modelId, 'pollComplete', { pollId, winningIndex });
}
```

**Archiving Strategy:**
```javascript
function archiveOldPolls() {
    // Keep most recent 20 polls for detailed view
    const recentPolls = state.polls.slice(-20);
    const oldPolls = state.polls.slice(0, -20);
    
    // Update archive statistics
    if (oldPolls.length > 0) {
        state.archiveStats.totalPolls += oldPolls.length;
        state.archiveStats.lastArchiveDate = new Date().toISOString().split('T')[0];
    }
    
    // Replace polls array with recent only
    state.polls = recentPolls;
    
    // Scores persist automatically - they're never archived
    console.log(`Archived ${oldPolls.length} old polls, kept ${recentPolls.length} recent`);
}
```

**Leaderboard Generation:**
```javascript
function generateLeaderboard() {
    return Object.entries(state.scores)
        .map(([username, data]) => ({
            username,
            totalScore: data.total,
            pollsParticipated: data.pollsParticipated,
            averageScore: (data.total / Math.max(data.pollsParticipated, 1)).toFixed(1)
        }))
        .sort((a, b) => b.totalScore - a.totalScore); // Sort by total score
}
```

**Recent Activity Display:**
```javascript
function displayRecentActivity() {
    const recentPolls = state.polls
        .filter(poll => poll.result.isComplete)
        .slice(-10) // Show last 10 completed polls
        .reverse(); // Most recent first
    
    const historyHtml = recentPolls.map(poll => `
        <div class="poll-history-item">
            <div class="poll-question">${poll.question}</div>
            <div class="poll-result">
                Winner: <strong>${poll.options[poll.result.winningIndex]}</strong>
            </div>
            <div class="poll-stats">
                ${poll.votes.length} participants • 
                ${poll.votes.filter(v => v.guessIndex === poll.result.winningIndex).length} correct predictions
            </div>
        </div>
    `).join('');
    
    document.getElementById('pollHistory').innerHTML = historyHtml;
}
```

**Benefits of This Approach:**

1. **Performance**: Recent data stays fast to access and display
2. **Persistence**: Total scores never get lost, even after hundreds of polls  
3. **User Experience**: Users see both recent activity and their all-time progress
4. **Scalability**: Memory usage stays bounded while preserving key statistics
5. **Flexibility**: Can adjust archive threshold based on usage patterns

---