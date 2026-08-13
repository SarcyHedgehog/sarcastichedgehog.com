## Tutorial 1: Configuration Management with config.js

### Why Use a Separate Config File?

VoteTogether uses an external `config.js` file instead of hardcoding API keys and URLs. This pattern provides several key benefits:

**Security & Deployment:**
- Keeps sensitive API keys out of your main codebase
- Allows different configurations for development/production
- Enables automated deployment with secret injection

**Code Organization:**
- Single source of truth for all configuration
- Easy to modify without touching core application logic
- Makes the app portable across different environments

### Implementation

**config.example.js** (tracked in git):
```javascript
// Copy this to config.js and add your actual values
window.APP_CONFIG = {
    API_KEY: "your-api-key-here",
    APP_ID: "your-app-id-here", 
    BASE_URL: "http://localhost:3000/votetogether"
};
```

**config.js** (ignored by git):
```javascript
window.APP_CONFIG = {
    API_KEY: "sk_live_actual_api_key",
    APP_ID: "app_actual_app_id",
    BASE_URL: "https://sarcastichedgehog.com/votetogether"
};
```

**Using the Config in Your App:**
```javascript
// Access configuration anywhere in your app
const client = new MultisynqClient(window.APP_CONFIG.API_KEY);
const model = client.model(window.APP_CONFIG.APP_ID);

// For copy link functionality  
const shareMessage = `Join my VoteTogether game!\n\nLink: ${window.APP_CONFIG.BASE_URL}\nRoom Code: ${code}`;
```

**Automated Deployment Integration:**
```yaml
# GitHub Actions creates config.js from secrets
- name: Create config.js for VoteTogether
  run: |
    echo "window.APP_CONFIG = {" > config.js
    echo "  API_KEY: \"${{ secrets.MULTISYNQ_API_KEY }}\"," >> config.js
    echo "  APP_ID: \"${{ secrets.MULTISYNQ_APP_ID }}\"," >> config.js
    echo "  BASE_URL: \"${{ secrets.MULTISYNQ_BASE_URL }}\"" >> config.js
    echo "};" >> config.js
```

---