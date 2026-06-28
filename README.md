# TaskHub Pro - Full-Stack Telegram Mini App

This project is a Telegram Mini App featuring a dynamic earn model with tasks, survey questionnaires, a lucky daily spin, referral systems, weekly leaderboards, and payout wallets.

## 🛠️ Tech Stack
*   **Frontend**: Single Page Application (HTML5, Vanilla CSS, JS, Telegram WebApp SDK) deployed to **Vercel**.
*   **Backend**: Serverless API built on **Cloudflare Workers**.
*   **Database**: PostgreSQL hosted on **Supabase**.

---

## 📂 Project Structure
```text
C:\TaskHub_Pro
├── database/
│   └── schema.sql           # PostgreSQL tables & initial data for Supabase
├── backend/
│   ├── src/
│   │   └── index.js         # API endpoint router & Telegram verify logic
│   ├── package.json         # Worker node packages & dev tools
│   └── wrangler.toml        # Cloudflare Workers configuration binding
└── frontend/
    ├── index.html           # Main Telegram WebApp interface
    ├── style.css            # Custom HSL green-cyan glassmorphism styling
    ├── app.js               # Event handlers, API caller & offline local simulation
    └── vercel.json          # Deployment configuration for Vercel
```

---

## 🚀 Setup & Deployment Guide

### Step 1: Database Setup (Supabase)
1.  Go to [Supabase Console](https://supabase.com/) and create a new project.
2.  Navigate to the **SQL Editor** tab in your project dashboard.
3.  Click **New Query**, copy the contents of `database/schema.sql`, and click **Run**.
4.  Copy your **Project URL** and **Anon API Key** from the **API Settings** tab (`Settings -> API`).

---

### Step 2: Backend Setup (Cloudflare Workers)
1.  Open your terminal and navigate to the backend directory:
    ```bash
    cd C:\TaskHub_Pro\backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Edit `C:\TaskHub_Pro\backend\wrangler.toml` and replace:
    *   `SUPABASE_URL` with your Supabase Project URL.
    *   `SUPABASE_KEY` with your Supabase Anon API Key.
4.  Start local development worker:
    ```bash
    npm run dev
    ```
5.  *(Optional)* Deploy to Cloudflare:
    ```bash
    npm run deploy
    ```
    *Note: For production environments, configure `BOT_TOKEN` and `SUPABASE_KEY` as secrets:*
    ```bash
    npx wrangler secret put SUPABASE_KEY
    npx wrangler secret put BOT_TOKEN
    ```

---

### Step 3: Frontend Setup (Vercel)
1.  Open `C:\TaskHub_Pro\frontend\app.js`.
2.  Update the `API_BASE_URL` variable to point to your deployed Cloudflare Workers URL (e.g., `https://taskhub-pro-backend.your-username.workers.dev`).
3.  Install the Vercel CLI globally or use the Vercel Dashboard:
    *   **Vercel Dashboard**: Drag and drop the `frontend` folder to [Vercel Dashboard](https://vercel.com).
    *   **Vercel CLI**:
        ```bash
        cd C:\TaskHub_Pro\frontend
        vercel deploy
        ```

---

### Step 4: Connecting the Mini App to Telegram Bot
1.  Go to [@BotFather](https://t.me/BotFather) on Telegram and create a new bot `/newbot`.
2.  Create a new WebApp attachment using `/newapp`.
3.  Follow prompts: select your bot, provide a title, description, and input your deployed Vercel URL as the **Web App URL**.
4.  Copy the Telegram Bot Token and bind it to your worker using:
    ```bash
    npx wrangler secret put BOT_TOKEN
    ```

---

## ⚡ Client-Side Simulator (Mock Offline Mode)
To let you test the interface immediately without deploying Supabase or Cloudflare Workers:
*   The frontend is equipped with a **Dual-Mode Engine**.
*   If the frontend cannot connect to `http://localhost:8787` or a live server, it automatically falls back to **Simulation Mode**.
*   In simulation mode, all records, daily spins, surveys, referrals, and balance deductions are kept in the browser's `localStorage`, letting you play through the entire app immediately!
