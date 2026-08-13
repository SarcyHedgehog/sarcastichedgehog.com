## Tutorial 3: Session-Based Authentication

### Username + Password Per Session

VoteTogether uses a unique authentication pattern: each user provides a username and password that's specific to each room/session. This isn't traditional user account authentication, but rather **session-based identity**.

### Why This Pattern?

**Perfect for Group Games:**
- No permanent accounts needed
- Anyone can join with the room credentials  
- Same person can rejoin with same identity
- Natural access control (shared password)

**User Experience Benefits:**
- No signup/registration friction
- Immediate gameplay
- Perfect for recurring groups (daily polls, team games)
- Mobile-friendly (just bookmark with credentials)

### Implementation

**Authentication Data Structure:**
```javascript
// Each user joins with session credentials
const joinData = {
    username: "Alice",           // Display name for this session
    password: "dailypoll123"     // Shared session password
};

// Stored globally during session
window.currentUser = {
    username: "Alice",
    code: "ABC123", 
    password: "dailypoll123"
};
```

**Session Authentication Check:**
```javascript
// VoteTogether authenticates on every Multisynq operation
async function authenticatedJoin(code, userData) {
    try {
        // Multisynq handles the actual room joining
        await model.join(code, userData);
        
        // Success - user is now authenticated for this session
        return true;
    } catch (error) {
        // Authentication failed
        if (error.message.includes('password')) {
            throw new Error('Incorrect room password');
        }
        throw new Error('Could not join room');
    }
}
```

**Reconnection with Same Identity:**
```javascript
// When user returns to the app, they use same credentials
async function reconnect() {
    const savedUser = window.currentUser;
    if (!savedUser) {
        // No previous session - show signin
        showSigninScreen();
        return;
    }
    
    try {
        // Rejoin with same identity
        await model.join(savedUser.code, {
            username: savedUser.username,
            password: savedUser.password
        });
        
        // Resume session seamlessly
        showGameScreen();
    } catch (error) {
        // Credentials no longer valid - restart signin
        showSigninScreen();
    }
}
```

**Multi-Device Support:**
```javascript
// Same credentials work across devices
// User can join from phone and laptop simultaneously
// Each gets separate viewId but same username identity

model.subscribe(modelId, (state, viewId) => {
    // viewId is unique per browser/tab
    // username is consistent across all user's devices
    const myUsername = window.currentUser.username;
    
    // Find my data regardless of which device I'm on
    const myVotes = state.votes.filter(vote => vote.username === myUsername);
});
```

---
