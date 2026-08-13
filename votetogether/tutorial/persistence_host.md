## Tutorial 5: Persistent Host Role Management

### The Challenge

In VoteTogether, the "host" role needs to persist even when the host leaves the session. This is crucial for games that span multiple days or have intermittent participation.

### Why This Matters

**Real-World Usage:**
- Daily polls where host sets questions each morning
- Team games where facilitator joins/leaves throughout day  
- Long-running sessions where host needs breaks
- Mobile users with unreliable connections

### The Solution: Dual Host Identity System

VoteTogether separates **permanent host identity** (`hostUsername`) from **temporary connection status** (`hostViewId`).

### Implementation

**Data Structure:**
```javascript
// Model state structure
{
    // Permanent host identity (survives disconnections)
    hostUsername: "TeamLead",
    
    // Temporary connection ID (changes when host reconnects)
    hostViewId: "view_abc123",
    
    // Host capabilities tracking
    hostCapabilities: {
        canAddQuestions: true,
        canCompletePolls: true,
        canManageUsers: true,
        lastSeen: "2024-07-28T10:30:00Z"
    },
    
    // Other game state...
    polls: [],
    scores: {}
}
```

**Host Registration (First Time):**
```javascript
async function becomeHost(username) {
    // Only allow if no current host exists
    if (state.hostUsername && state.hostUsername !== username) {
        throw new Error('Another user is already the host');
    }
    
    // Establish permanent host identity
    state.hostUsername = username;
    state.hostViewId = viewId; // Current connection
    state.hostCapabilities = {
        canAddQuestions: true,
        canCompletePolls: true, 
        canManageUsers: true,
        lastSeen: new Date().toISOString()
    };
    
    this.publish(modelId, 'hostChanged', { 
        hostUsername: username,
        action: 'became_host'
    });
}
```

**Host Reconnection:**
```javascript
// When existing host rejoins the session
model.subscribe(modelId, (state, viewId) => {
    const username = window.currentUser.username;
    
    // Check if this user is the established host
    if (state.hostUsername === username) {
        // Update the temporary connection ID
        state.hostViewId = viewId;
        state.hostCapabilities.lastSeen = new Date().toISOString();
        
        // Restore host UI immediately
        showHostControls();
        
        this.publish(modelId, 'hostReconnected', { 
            hostUsername: username,
            newViewId: viewId
        });
    }
});
```

**Host Presence Detection:**
```javascript
function isHostOnline() {
    if (!state.hostUsername) return false;
    
    // Check if host's viewId is in current connections
    const currentConnections = Object.keys(state.connections || {});
    return currentConnections.includes(state.hostViewId);
}

function updateHostStatus() {
    const hostOnline = isHostOnline();
    const hostIndicator = document.getElementById('hostStatus');
    
    if (state.hostUsername) {
        if (hostOnline) {
            hostIndicator.innerHTML = `🟢 Host: ${state.hostUsername} (online)`;
            hostIndicator.className = 'host-status online';
        } else {
            hostIndicator.innerHTML = `🔴 Host: ${state.hostUsername} (offline)`;
            hostIndicator.className = 'host-status offline';
        }
    } else {
        hostIndicator.innerHTML = '⚪ No host assigned';
        hostIndicator.className = 'host-status none';
    }
}
```

**Protected Host Actions:**
```javascript
function addQuestion(question, options) {
    const username = window.currentUser.username;
    
    // Verify host permission (works even if temporarily offline)
    if (state.hostUsername !== username) {
        alert('Only the host can add questions');
        return;
    }
    
    // Create new poll
    const newPoll = {
        id: Date.now(),
        question: question.trim(),
        options: options.map(opt => opt.trim()),
        votes: [],
        result: { winningIndex: -1, isComplete: false },
        createdBy: username,
        createdAt: new Date().toISOString()
    };
    
    state.polls.push(newPoll);
    
    // Update host activity timestamp
    if (state.hostCapabilities) {
        state.hostCapabilities.lastSeen = new Date().toISOString();
    }
    
    this.publish(modelId, 'questionAdded', { 
        poll: newPoll,
        hostUsername: username
    });
}
```

**Host UI Management:**
```javascript
function updateUserInterface() {
    const username = window.currentUser.username;
    const isHost = (state.hostUsername === username);
    
    // Show/hide host-only controls
    const hostControls = document.getElementById('hostControls');
    if (isHost) {
        hostControls.style.display = 'block';
        hostControls.innerHTML = `
            <div class="host-panel">
                <h3>🎯 Host Controls</h3>
                <button onclick="showAddQuestionForm()" class="host-btn">
                    Add New Question
                </button>
                <button onclick="completeCurrentPoll()" class="host-btn">
                    Complete Current Poll
                </button>
                <div class="host-status-info">
                    You are the host of this room
                </div>
            </div>
        `;
    } else {
        hostControls.style.display = 'none';
    }
    
    // Update general host status for all users
    updateHostStatus();
}
```

**Host Transfer (Advanced):**
```javascript
function transferHost(newHostUsername) {
    const currentUsername = window.currentUser.username;
    
    // Only current host can transfer
    if (state.hostUsername !== currentUsername) {
        alert('Only the current host can transfer host role');
        return;
    }
    
    // Verify new host is in the session
    const newHostInSession = Object.values(state.connections || {})
        .some(conn => conn.username === newHostUsername);
    
    if (!newHostInSession) {
        alert('Target user is not in the session');
        return;
    }
    
    // Transfer permanent host identity
    const previousHost = state.hostUsername;
    state.hostUsername = newHostUsername;
    
    // Find new host's current viewId
    const newHostConnection = Object.entries(state.connections || {})
        .find(([viewId, data]) => data.username === newHostUsername);
    
    if (newHostConnection) {
        state.hostViewId = newHostConnection[0];
    }
    
    // Update capabilities
    state.hostCapabilities.lastSeen = new Date().toISOString();
    
    this.publish(modelId, 'hostTransferred', {
        previousHost,
        newHost: newHostUsername,
        timestamp: new Date().toISOString()
    });
}
```

**Benefits of This System:**

1. **Continuity**: Host role survives disconnections and app restarts
2. **Flexibility**: Host can leave and return without losing control  
3. **Transparency**: All users can see host status (online/offline)
4. **Security**: Host permissions are tied to username, not connection
5. **Reliability**: Game can continue even when host is temporarily away
6. **Mobile-Friendly**: Perfect for hosts on unstable mobile connections

This pattern is especially powerful for persistent group activities like daily team polls, recurring game nights, or long-running collaborative sessions.

---