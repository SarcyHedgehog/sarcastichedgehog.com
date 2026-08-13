## Tutorial 2: Signin Lobby Pattern

### Why Use a Signin Lobby?

VoteTogether implements a "signin lobby" that collects user credentials before joining the Multisynq session. This pattern provides:

- **User Identity Management**: Collect and validate usernames
- **Room Access Control**: Password-protected sessions
- **State Preparation**: Set up user data before real-time sync begins
- **Better UX**: Clear separation between setup and gameplay

### Implementation

**HTML Structure:**
```html
<!-- Signin Screen (shown first) -->
<div id="signinScreen">
    <h1>🗳️ VoteTogether</h1>
    <div class="input-group">
        <input type="text" id="usernameInput" placeholder="Your name" maxlength="20">
    </div>
    <div class="input-group">
        <input type="text" id="roomCodeInput" placeholder="Room code" maxlength="10">
    </div>
    <div class="input-group">
        <input type="password" id="passwordInput" placeholder="Room password" maxlength="50">
    </div>
    <button onclick="joinRoom()">Join Room</button>
    <button onclick="createRoom()">Create New Room</button>
</div>

<!-- Game Screen (shown after signin) -->
<div id="gameScreen" style="display: none;">
    <!-- Main game interface here -->
</div>
```

**Signin Logic:**
```javascript
async function joinRoom() {
    const username = document.getElementById('usernameInput').value.trim();
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    const password = document.getElementById('passwordInput').value;
    
    // Validate inputs before attempting connection
    if (!username || !code || !password) {
        alert('Please fill in all fields');
        return;
    }
    
    if (username.length > 20) {
        alert('Username must be 20 characters or less');
        return;
    }
    
    try {
        // Initialize Multisynq connection
        const client = new MultisynqClient(window.APP_CONFIG.API_KEY);
        const model = client.model(window.APP_CONFIG.APP_ID);
        
        // Join the room with collected credentials
        await model.join(code, { username, password });
        
        // Store user info globally for the session
        window.currentUser = { username, code, password };
        
        // Transition to game interface
        showGameScreen();
        
    } catch (error) {
        alert('Failed to join room. Check your room code and password.');
        console.error('Join error:', error);
    }
}

function showGameScreen() {
    document.getElementById('signinScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    
    // Initialize game-specific UI
    updateRoomInfo();
    loadGameState();
}
```

**Room Creation with Auto-Signin:**
```javascript
async function createRoom() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    
    if (!username || !password) {
        alert('Please enter a username and password');
        return;
    }
    
    // Generate unique room code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
        const client = new MultisynqClient(window.APP_CONFIG.API_KEY);
        const model = client.model(window.APP_CONFIG.APP_ID);
        
        // Create and join in one step
        await model.join(code, { username, password });
        
        // Auto-populate room code for user convenience
        document.getElementById('roomCodeInput').value = code;
        
        window.currentUser = { username, code, password };
        showGameScreen();
        
    } catch (error) {
        alert('Failed to create room');
        console.error('Create room error:', error);
    }
}
```

---