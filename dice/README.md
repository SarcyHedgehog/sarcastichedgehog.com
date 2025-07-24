# 🎲 Poker Dice

A modern, multiplayer Poker Dice game built as a Progressive Web App (PWA). This application uses Three.js for a 3D dice experience and is powered by the serverless Multisynq platform for real-time state synchronization.

This project was developed as a "Vibe Coding" experiment, showcasing rapid development from concept to a complete, deployable application.

![Screenshot of Poker Dice Game](https://www.sarcastichedgehog.com/images/poker-dice-screenshot.png)
*Note: You will need to replace this with your own screenshot URL.*

---

## ✨ Features

* **Real-Time Multiplayer:** Create or join game rooms using a simple 5-letter code.
* **Classic Poker Dice Rules:** Each player gets up to three rolls per turn to achieve the best hand.
* **3D Dice Interaction:** Built with Three.js, dice can be "held" by clicking on them, which visually separates them for the next roll.
* **Synchronized Animations:** All players see the dice tumble and settle in real-time.
* **Automatic Hand Evaluation:** The game automatically calculates and displays the best hand for each player.
* **Progressive Web App (PWA):** Fully installable on both mobile and desktop devices for an app-like experience.
* **Responsive Design:** Mobile-first layout that works great on any screen size.

---

## 🛠️ Tech Stack

* **Real-Time Backend:** [Multisynq](https://multisynq.io)
* **3D Rendering:** [Three.js](https://threejs.org/)
* **Core Logic:** Vanilla JavaScript (ESM)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) (via CDN Browser Build)

---

## 📁 Project Structure

```
/
├── index.html             # The main application file
├── config.js              # (Local Only) Contains secret API keys
├── config.example.js      # Example config file to be committed
├── manifest.json          # PWA configuration
├── sw.js                  # PWA service worker for caching
├── .gitignore             # Specifies files for Git to ignore
├── README.md              # This file
├── /textures/             # Contains the 6 PNG files for dice faces
├── /icons/                # Contains PWA icons (192x192, 512x512)
└── /workshop/             # (Ignored) For work-in-progress graphics
```

---

## 🚀 Local Development

Follow these steps to run the game on your local machine.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/poker-dice.git
cd poker-dice
```

### 2. Create config.js

This file is required to connect to the Multisynq service. It is intentionally not committed to the repository. Copy `config.example.js` to a new file named `config.js` and add your credentials.

```javascript
// config.js - DO NOT COMMIT THIS FILE!
window.APP_CONFIG = {
  API_KEY: "your-multisynq-api-key",
  APP_ID: "com.yourdomain.pokerdice", // e.g., com.sarcastichedgehog.pokerdice
  BASE_URL: "http://localhost:8000"
};
```

### 3. Ensure Assets are in Place

Make sure you have the required images in the following folders:

* `/textures/`: `face1.png` through `face6.png`
* `/icons/`: `icon-192x192.png` and `icon-512x512.png`

### 4. Start a Local Server

Since the game uses ES Modules, you need to run it from a web server. The simplest way is to use Python's built-in server:

```bash
python -m http.server
```

Now, open your browser and navigate to `http://localhost:8000`.

---

## 🔧 Deployment (GitHub Actions)

To deploy the game to a live website, use GitHub Actions to securely inject your secrets into the `config.js` file at build time.

**Required GitHub Secrets:**

* `MULTISYNQ_API_KEY`
* `MULTISYNQ_APP_ID`
* `MULTISYNQ_BASE_URL` (e.g., `https://www.yourdomain.com/poker-dice`)

**Deployment YAML Snippet:**

Add the following step to your GitHub Actions workflow:

```yaml
- name: Create config.js for Poker Dice
  working-directory: ./poker-dice # Adjust this path to your project folder
  run: |
    echo "Generating config.js from secrets..."
    echo "window.APP_CONFIG = {" > config.js
    echo "  API_KEY: \"${{ secrets.MULTISYNQ_API_KEY }}\"," >> config.js
    echo "  APP_ID: \"${{ secrets.MULTISYNQ_APP_ID }}\"," >> config.js
    echo "  BASE_URL: \"${{ secrets.MULTISYNQ_BASE_URL }}\"" >> config.js
    echo "};" >> config.js
```

---

## 🔮 Future Ideas

* **Liar's Dice Mode:** Implement the "Liar's Dice" game variant using the same 3D dice and networking foundation.
* **Sound Effects:** Add sounds for dice rolls, holds, and winning.

---

## 📜 License

This project is licensed under the MIT License.
