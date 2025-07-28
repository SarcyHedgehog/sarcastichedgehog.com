# VoteTogether

A real-time voting and prediction game built with [Multisynq](https://multisynq.io). Players vote on polls and try to predict which option will be most popular, earning points for correct predictions.

## 🎮 How It Works

1. **Vote**: Choose your preferred option from a poll
2. **Predict**: Guess which option will get the most votes
3. **Score**: Earn points for correctly predicting the majority choice
4. **Compete**: Climb the leaderboard with your prediction accuracy

## 🚀 Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd votetogether
   ```

2. **Configure API credentials**
   ```bash
   cp config.example.js config.js
   ```
   Edit `config.js` and add your Multisynq API key and App ID:
   ```javascript
   window.APP_CONFIG = {
       API_KEY: "your-multisynq-api-key",
       APP_ID: "your-multisynq-app-id"
   };
   ```

3. **Serve the files**
   - Use any web server (Live Server, Python's `http.server`, etc.)
   - Or simply open `index.html` in a modern browser

## 🔐 Authentication System

### Password-Protected Usernames per Session

VoteTogether uses a unique authentication approach designed for persistent group sessions:

**How it works:**
- Each room (session) maintains its own independent user registry
- Users create a username + password combination that's tied to that specific room
- The password is hashed using SHA-256 before storage
- Once registered, that username/password combo is permanent for that room

**Login Flow:**
1. User enters: `username`, `password`, `room code`
2. System checks if username exists in that room's registry
3. **New user**: Username doesn't exist → Register and login
4. **Existing user**: Username exists → Verify password hash → Login if correct
5. **Wrong password**: Username exists but password doesn't match → Reject

**Why this approach?**
- **Persistent identity**: Users keep the same name across sessions
- **Room isolation**: Same username can exist in different rooms with different passwords  
- **No global accounts**: Each room is completely independent
- **Simple security**: SHA-256 hashing protects passwords in storage

### Host Role Persistence

The host role is designed to survive disconnections and work for long-running sessions (like daily polls):

**Host Assignment:**
- First person to click "Become Host" in a room becomes the permanent host
- Their username is stored in `model.hostUsername` (persistent)
- Their current connection ID is stored in `model.hostViewId` (temporary)

**Host Reconnection:**
- When the host user rejoins the room, they automatically regain host privileges
- System matches their username against `model.hostUsername`
- Host controls immediately become available

**Host Offline Handling:**
- When host disconnects: `hostViewId` becomes `null`, but `hostUsername` remains set
- Other users see "Host: [name] (offline)" status
- Non-host users cannot claim the host role while a host is assigned
- Only the original host can "Resume Host Role" when they return

**Why persistent hosts?**
- **Daily polls**: Host can set up questions and leave, returning later to close polls
- **Consistent control**: Prevents host role from bouncing between users
- **Clear ownership**: Everyone knows who the designated host is, even when offline

## 🎯 Game Features

### Voting Process
1. Host creates a poll with question and multiple choice options
2. Players first vote for their personal preference
3. Players then predict which option will be most popular
4. Host closes the poll to reveal results
5. Players earn points for correct predictions

### Scoring System
- **Polls Voted**: Total number of polls participated in
- **Guesses Correct**: Number of times correctly predicted the majority
- **Accuracy**: Percentage of correct predictions (Guesses Correct / Polls Voted)
- **Leaderboard**: Sorted by accuracy percentage

### Session Management
- **Room Codes**: Simple text codes (e.g., "drinks", "office", "family")
- **Persistent Data**: All votes, questions, and user stats are preserved
- **History**: View results from all previous polls in the session
- **Real-time Updates**: All players see changes instantly via Multisynq sync

## 🛠 Technical Architecture

### Multisynq Integration
- **Model**: `PollModel` - Manages questions, votes, users, and game state
- **View**: `PollView` - Handles UI rendering and user interactions  
- **Session**: Room-based multiplayer sessions with real-time synchronization

### Key Design Patterns
- **Single-object payloads**: All Multisynq `publish()` calls send one object parameter
- **State synchronization**: Model publishes "state-updated" events to trigger re-renders
- **Event-driven updates**: Views subscribe to model changes for real-time UI updates

### Data Structure
```javascript
// Model state
{
  questions: [
    {
      id: 1,
      text: "What's your favorite drink?",
      options: ["Coffee", "Tea", "Water", "Soda"],
      votes: {
        "username": { vote: 0, guess: 1 }
      },
      closed: false
    }
  ],
  users: {
    "username": {
      passwordHash: "sha256hash...",
      pollsVoted: 5,
      guessesCorrect: 3
    }
  },
  hostUsername: "admin",
  hostViewId: "view-123",
  currentQuestionIndex: 0
}
```

## 🎨 UI Features

- **Responsive Design**: Works on mobile and desktop
- **Real-time Updates**: Instant synchronization across all connected devices
- **Visual Feedback**: Clear indication of voting steps and results
- **Accessibility**: Semantic HTML and proper contrast ratios
- **Progressive Web App**: Installable with offline manifest

## 🔧 Development

Built with:
- **Multisynq**: Real-time multiplayer synchronization
- **Tailwind CSS**: Utility-first styling
- **Vanilla JavaScript**: No framework dependencies
- **SHA-256**: Password hashing for security

## 📝 License

MIT
