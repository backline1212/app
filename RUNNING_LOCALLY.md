# Running Backline on Your Computer

This guide assumes no coding experience. Follow it top to bottom, in order.

## The two main folders

Everything lives inside one project folder: `/Users/harsh/Q_A_TOOL`. Inside it:

| Folder | What it is |
|---|---|
| `backend/` | The "engine" - stores data, handles logins. No visual interface; runs quietly in a terminal window. |
| `apps/web` | The "frontend" - the actual website/dashboard you see and click around in your browser. |
| `apps/widget` | A small script that would sit on a *client's* website so they can leave feedback. You build it once; you don't run it directly. |

## What is "the terminal"?

A text-only window where you type commands and press Enter to run them. On a Mac: press `Cmd + Space`, type **Terminal**, press Enter.

You'll end up with **4 terminal windows open at once**, each running one piece of the app. All 4 need to stay open while you use the app. Closing one stops that piece.

---

## First-time setup checklist

Confirm these are installed (only needs doing once, ever, on this machine):
- Node 20 (`nvm install 20`) and pnpm (`corepack enable`)
- Python 3.12 + `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh` then `uv python install 3.12`)
- Either Docker, or the native `mongod`/`redis-server`/`minio` programs on your `PATH`

If you're reading this after already following it once with Claude's help, these are already done.

---

## Every time you want to run the app

### Step 1 - Open a terminal and go to the project

```bash
cd /Users/harsh/Q_A_TOOL
```

### Step 2 - Start the databases (Terminal window #1)

```bash
./infra/local/start-all.sh
```
Starts Mongo (database), Redis (cache), and MinIO (file storage) quietly in the background. You'll see a few confirmation lines. **Leave this window open.**

*(If you have Docker installed instead, use `docker compose up -d`.)*

### Step 3 - Start the backend (Terminal window #2)

```bash
cd /Users/harsh/Q_A_TOOL/backend
uv run uvicorn app.main:app --reload --port 8000
```
First run installs dependencies automatically (may take a minute). Leave it running - you'll see log lines scroll by as you use the app.

✅ **Check it worked:** visit http://localhost:8000/health in a browser. You should see `{"status":"ok","mongo":"ok","redis":"ok"}`.

### Step 4 - Start the background worker (Terminal window #3)

```bash
cd /Users/harsh/Q_A_TOOL/backend
uv run arq app.workers.main.WorkerSettings
```
Handles things like sending emails and processing updates behind the scenes.

### Step 5 - Build the widget and start the frontend (Terminal window #4)

```bash
cd /Users/harsh/Q_A_TOOL
pnpm install
pnpm --filter @backline/widget build
pnpm --filter @backline/web dev
```
- `pnpm install` - downloads everything the website needs (first time only, may take a minute or two).
- `pnpm --filter @backline/widget build` - builds the small feedback-widget piece.
- `pnpm --filter @backline/web dev` - starts the actual website. Leave it running.

### Step 6 - Open the app

Go to **http://localhost:5173** in your browser.

---

## Signing in

Backline has two sign-in options: **email code** (works out of the box) and **Google** (needs a one-time setup, below).

### Email code (no setup needed)

1. Type any email address (real or made up, e.g. `test@example.com`).
2. Click "Send sign-in code."
3. **The code will not arrive in your inbox** - no real email service is connected. Instead, go to your **backend terminal window** (Terminal #2 from Step 3), scroll down, and look for a line containing your email and a 6-digit code.
4. Type that code into the website and submit.

The first workspace you create automatically comes with a sample "Example Project" pre-loaded with example feedback comments, so there's something to click around right away.

### Google sign-in (one-time setup)

This needs a Google Cloud project. Takes about 10 minutes.

1. Go to **console.cloud.google.com**, sign in, create a new project (any name).
2. **APIs & Services → OAuth consent screen** → User type **External** → fill in the required fields (app name, your email) → add your own email under "Test users" → save through to the end.
3. **APIs & Services → Credentials** → **+ Create Credentials → OAuth client ID** → Application type **Web application**.
   - Under **Authorized redirect URIs**, add exactly: `http://localhost:5173/auth/callback`
   - Click Create. Copy the **Client ID** and **Client Secret** shown.
4. Open the file `/Users/harsh/Q_A_TOOL/.env` in a text editor and fill in:
   ```
   GOOGLE_OAUTH_CLIENT_ID=<your Client ID>
   GOOGLE_OAUTH_CLIENT_SECRET=<your Client Secret>
   VITE_GOOGLE_OAUTH_CLIENT_ID=<your Client ID, again>
   ```
   Save the file.
5. Restart the backend and frontend so they pick up the change: go to Terminal #2 and #4, press `Ctrl+C` in each, then re-run their Step 3 / Step 5 commands above.
6. Reload the site and try "Continue with Google" again.

---

## Stopping everything

In each of the 4 terminal windows, press `Ctrl + C`. Then, to stop the databases:
```bash
cd /Users/harsh/Q_A_TOOL
./infra/local/stop-all.sh
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| http://localhost:8000/health won't load | Backend (Terminal #2) isn't running, or crashed - check that window for red error text. |
| "No OTP code" in the terminal | Make sure you're looking at the **backend** terminal (#2), not the frontend one, and that you already clicked "Send sign-in code" on the site first. |
| Google sign-in still fails after setup | Double check the redirect URI is *exactly* `http://localhost:5173/auth/callback` (no trailing slash), and that you restarted both the backend and frontend after editing `.env`. |
| Edited `.env` at the project root but the backend doesn't seem to see the change (Google sign-in, AI keys, etc. still act unconfigured) | The backend only reads `.env` from **inside `backend/`** (`config.py`'s `env_file=".env"` resolves relative to Step 3's `cd backend`, not the project root this doc otherwise tells you to edit). Copy the same edit into `backend/.env` too, then restart the backend terminal. Keep both files in sync until this is fixed to read one file. |
| Page at :5173 won't load | Frontend (Terminal #4) isn't running - check that window. |
