# Taking Backline live — a step-by-step guide

This guide assumes **no coding knowledge**. Every step says exactly what to click, what
to type, and how to check it worked. Follow it top to bottom.

Set aside **4–6 hours** for a first run. Budget **~$25–45/month** to start (see
[Costs](#appendix-a--what-this-costs)).

> **Read [Part 0](#part-0--before-you-sell-anything-important) first.** There are things
> this app does *not* do yet that affect whether you can charge money for it today.

---

## Contents

- [Part 0 — Before you sell anything (IMPORTANT)](#part-0--before-you-sell-anything-important)
- [Part 1 — What you're building](#part-1--what-youre-building)
- [Part 2 — Accounts and apps you need](#part-2--accounts-and-apps-you-need)
- [Part 3 — Put your code on GitHub (private)](#part-3--put-your-code-on-github-private)
- [Part 4 — Create the database (MongoDB Atlas)](#part-4--create-the-database-mongodb-atlas)
- [Part 5 — Create file storage (Cloudflare R2)](#part-5--create-file-storage-cloudflare-r2)
- [Part 6 — Set up email (Resend)](#part-6--set-up-email-resend)
- [Part 7 — Generate your secret keys](#part-7--generate-your-secret-keys)
- [Part 8 — Deploy the backend (Railway)](#part-8--deploy-the-backend-railway)
- [Part 9 — Deploy the dashboard (Vercel)](#part-9--deploy-the-dashboard-vercel)
- [Part 10 — Connect your domain](#part-10--connect-your-domain)
- [Part 11 — Close the loop (the step everyone forgets)](#part-11--close-the-loop-the-step-everyone-forgets)
- [Part 12 — Optional: Google sign-in](#part-12--optional-google-sign-in)
- [Part 13 — Turn on error alerts (Sentry)](#part-13--turn-on-error-alerts-sentry)
- [Part 14 — Prove it works (smoke test)](#part-14--prove-it-works-smoke-test)
- [Part 15 — Backups and safety](#part-15--backups-and-safety)
- [Part 16 — How to ship an update later](#part-16--how-to-ship-an-update-later)
- [Part 17 — Legal and business must-haves](#part-17--legal-and-business-must-haves)
- [Appendix A — Costs](#appendix-a--what-this-costs)
- [Appendix B — Troubleshooting](#appendix-b--troubleshooting)
- [Appendix C — Every setting explained](#appendix-c--every-setting-explained)

---

## Part 0 — Before you sell anything (IMPORTANT)

Your app is genuinely functional: website review, pinned comments, threads, replies,
file attachments, real-time updates, team members, share links for clients, integrations
scaffolding. That core loop works.

**But these are not built yet.** If you promise them to a paying customer, you will not
be able to deliver:

| Thing | Current state | What it means for selling |
|---|---|---|
| **Taking payments** | **Not built at all.** "Upgrade to Pro" opens a pricing popup whose button does nothing. | **You cannot charge money inside the app today.** See below. |
| **Plan limits** | Not enforced. Every workspace can create unlimited projects/users regardless of "plan". | A "Free plan" customer gets everything. Nothing stops them. |
| Web App / Mobile / Image & PDF projects | Show a "Coming soon" popup | Only **Website** review works. Don't sell the others. |
| MCP Server page | Buttons show "Coming soon" | Don't sell AI-agent integration. |
| AI Usage page | Always shows zeros (no AI feature exists) | Don't sell AI features. |
| Version history | "Add new version" leads to the paywall popup | Only one version per project really exists. |
| Page approval / Private mode | Both lead to the paywall popup | Not functional. |

### So how do you charge customers *today*?

Pick one — both are completely normal for a first launch:

1. **Invoice manually (recommended to start).** Talk to your first 5–10 customers, agree a
   price, send an invoice (Stripe Invoicing, Razorpay, or your bank). You create their
   workspace by hand. This is how most B2B tools start, and it gets you paid **this week**
   without writing code.
2. **Add Stripe Checkout later.** Once you have paying customers and know your pricing,
   wire up real billing and enforce plan limits. That's a separate build.

### Also fix before real customers

- **Email must be configured** ([Part 6](#part-6--set-up-email-resend)). Without it, sign-in
  codes are only written to the server log — **nobody can log into your app**.
- **You must change two secret keys** ([Part 7](#part-7--generate-your-secret-keys)). The
  built-in defaults are published in this repo; leaving them means anyone could forge a
  login.

---

## Part 1 — What you're building

Your app is not one program — it's five pieces that talk to each other. You'll set up
each one, then tell them each other's addresses.

```
                     ┌──────────────────────────┐
   Your customer  →  │  DASHBOARD (Vercel)      │   app.yourdomain.com
   (agency staff)    │  the screens you built   │
                     └───────────┬──────────────┘
                                 │ calls
                     ┌───────────▼──────────────┐
   Their client   →  │  BACKEND API (Railway)   │   api.yourdomain.com
   (reviewer)        │  logic + review widget   │
                     └──┬─────────┬─────────┬───┘
                        │         │         │
              ┌─────────▼──┐ ┌────▼────┐ ┌──▼──────────┐
              │  MongoDB   │ │  Redis  │ │ Cloudflare  │
              │  Atlas     │ │         │ │ R2 (files)  │
              │ (the data) │ │ (speed) │ │ screenshots │
              └────────────┘ └─────────┘ └─────────────┘
```

In plain English:

- **MongoDB Atlas** — the filing cabinet. Every workspace, project, comment lives here.
  If you lose this, you lose everything. (Part 4)
- **Redis** — short-term memory. Rate limiting and live updates. Losing it is annoying,
  not fatal. (Part 8, one click)
- **Cloudflare R2** — the photo album. Screenshots and file attachments. (Part 5)
- **Railway** — runs your backend, and also serves the little review widget that gets
  injected into your customers' websites. (Part 8)
- **Vercel** — serves the dashboard screens. (Part 9)

---

## Part 2 — Accounts and apps you need

### Apps to install on your computer

| App | What it's for | Where |
|---|---|---|
| **GitHub Desktop** | Uploading your code without typing commands | [desktop.github.com](https://desktop.github.com) |
| **A code editor** (VS Code) | Occasionally opening a file | [code.visualstudio.com](https://code.visualstudio.com) |

You already have the rest (your project files, a terminal).

### Accounts to create (all have free tiers)

Create these now, with the **same email**, ideally a company one like
`you@yourdomain.com`:

1. **GitHub** — [github.com](https://github.com) — stores your code
2. **MongoDB Atlas** — [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) — database
3. **Cloudflare** — [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) — file storage
4. **Railway** — [railway.app](https://railway.app) — backend hosting
5. **Vercel** — [vercel.com/signup](https://vercel.com/signup) — dashboard hosting
6. **Resend** — [resend.com](https://resend.com) — sending emails
7. **Sentry** — [sentry.io](https://sentry.io) — error alerts (optional but recommended)

> **Turn on two-factor authentication (2FA) on all of them**, especially GitHub. These
> accounts control your product and your customers' data.

### One more thing: a domain

Buy a domain if you don't have one (Namecheap, GoDaddy, Cloudflare Registrar — ~$10–15/yr).
This guide assumes `yourdomain.com`; replace it with yours everywhere.

You'll use:
- `app.yourdomain.com` → the dashboard
- `api.yourdomain.com` → the backend

---

## Part 3 — Put your code on GitHub (private)

Right now your code exists **only on your laptop**. If it dies, your product is gone.
This step fixes that and lets your team collaborate.

### 3.1 Create an Organization (not a personal repo)

An Organization lets you control who sees the code, and survives you leaving.

1. Go to [github.com](https://github.com), click your avatar (top right) → **Your organizations**
2. Click **New organization** → choose the **Free** plan
3. Organization name: e.g. `minute-creative` (lowercase, no spaces)
4. Contact email: your company email
5. Choose **My personal account** when asked who it belongs to
6. Skip inviting people for now → **Complete setup**

### 3.2 Create the private repository

1. On your organization's page click **New repository**
2. **Repository name:** `backline`
3. **Description:** e.g. "Collaborative website review platform"
4. Select **🔒 Private** — critical. Public means the whole world can read your code.
5. **Do NOT** tick "Add a README", "Add .gitignore", or "Choose a license" —
   your project already has these, and ticking them causes a conflict
6. Click **Create repository**
7. Leave this page open — you'll need the URL

### 3.3 Upload your code with GitHub Desktop

1. Open **GitHub Desktop** → **File → Add Local Repository**
2. Click **Choose…** and select your project folder (`Q_A_TOOL`)
3. It will say the repository already exists — good, click through
4. Bottom left, you'll see a list of changed files. In the **Summary** box type:
   `Production deployment setup`
5. Click **Commit to main**
6. Top of the window: click **Publish repository**
   - **Uncheck** "Keep this code private"? **NO — leave it CHECKED (private).**
   - Organization: pick your organization
   - Click **Publish repository**
7. Wait for the upload. Refresh the GitHub page — your files should appear.

### 3.4 Confirm your secrets did NOT get uploaded

**Do this check. It matters.**

On GitHub, look at the file list and use the search box (press `t`) to look for a file
called exactly `.env`.

- ✅ You should find `.env.example` and `.env.production.example` — safe templates, no real secrets.
- ❌ You should **NOT** find `backend/.env`.

If you *do* see `backend/.env`, stop and tell your developer — real passwords are now on
GitHub and every key inside must be regenerated.

### 3.5 Give your team access

1. Your organization page → **Teams** → **New team** → name it `engineering`
2. Open the team → **Members** → **Add a member** → type their GitHub username
3. Now go to the **repository** → **Settings** → **Collaborators and teams**
4. **Add teams** → pick `engineering` → permission level:
   - **Write** — can push code (developers)
   - **Read** — can only look (designers, PMs)
   - **Admin** — full control (only you)

Because the repo is Private and owned by the Org, **only people you add can see it.**

---

## Part 4 — Create the database (MongoDB Atlas)

This is your most important asset. Take your time here.

### 4.1 Create the cluster

1. Log into [Atlas](https://cloud.mongodb.com) → **Build a Database**
2. Choose a tier:
   - **M0 (Free)** — fine for your first few customers. No automatic backups.
   - **M10 (~$57/mo)** — **required once you have paying customers**, because it includes
     continuous backups and you can restore to any point in time.
   - Start on M0 if money is tight; upgrade before customer #1 depends on you.
3. **Provider & Region:** pick the region physically closest to your customers
   (e.g. Mumbai `ap-south-1` for India, Frankfurt for the EU). **Use the same region for
   Railway later** — this makes the app noticeably faster.
4. **Cluster name:** `backline-prod`
5. Click **Create Deployment**

### 4.2 Create the database user (this is a login for your app, not for you)

Atlas will immediately show a "Connect" / security quickstart panel.

1. **Username:** `backline_app`
2. **Password:** click **Autogenerate Secure Password**, then **Copy** it
3. **Paste it into a temporary note right now.** You cannot view it again later.
4. Click **Create Database User**

### 4.3 Allow Railway to connect

Still in the quickstart, or via **Network Access** in the left sidebar:

1. Click **Add IP Address**
2. Choose **Allow Access from Anywhere** (`0.0.0.0/0`)
3. Click **Confirm**

> **"Isn't 'anywhere' insecure?"** Reasonable question. Railway doesn't give you fixed IP
> addresses on its standard plans, so restricting by IP isn't possible. Your database is
> still protected by the username and the long random password, and it's the standard
> setup for Railway + Atlas. If you later move to a host with static IPs, tighten this.

### 4.4 Get your connection string

1. Left sidebar → **Database** → click **Connect** on your cluster
2. Choose **Drivers**
3. Driver: **Python**, Version: **3.12 or later**
4. Copy the string shown. It looks like:
   ```
   mongodb+srv://backline_app:<db_password>@backline-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **Replace `<db_password>`** (including the angle brackets) with the password you saved
   in 4.2.
6. Save the finished string in your note. This is `MONGO_URI`.

> ⚠️ If your password contains `@`, `/`, `:`, or `#`, it must be URL-encoded or the
> connection breaks. Easiest fix: regenerate a password without those characters.

---

## Part 5 — Create file storage (Cloudflare R2)

This holds screenshots and the files people attach to comments. R2 is used instead of
AWS S3 because it doesn't charge for downloads, which matters a lot for image-heavy apps.

### 5.1 Create the bucket

1. Log into [Cloudflare](https://dash.cloudflare.com) → left sidebar **R2 Object Storage**
2. First time, it asks for a payment card even for the free tier — add it (10 GB/month free)
3. Click **Create bucket**
4. **Bucket name:** `backline-prod`
5. **Location:** choose the hint closest to your users
6. Click **Create bucket**

> Leave the bucket **private**. Do not enable public access. Your app generates temporary
> signed links whenever a file needs to be viewed — that's deliberate, so a customer's
> screenshots can't be found by strangers guessing URLs.

### 5.2 Create the access keys

1. In **R2**, go to **Manage R2 API Tokens** (right side, or under **API**)
2. Click **Create API Token**
3. **Token name:** `backline-backend`
4. **Permissions:** **Object Read & Write**
5. **Specify bucket:** choose `backline-prod` only (not "all buckets")
6. Click **Create API Token**
7. You'll now see three values — **copy all three into your note immediately**, the secret
   is shown only once:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
   - **Endpoint** — looks like `https://abc123....r2.cloudflarestorage.com` → `R2_ENDPOINT_URL`
8. Your **Account ID** is on the R2 overview page (and inside that endpoint URL) →
   `R2_ACCOUNT_ID`

### 5.3 Allow browser uploads with an R2 CORS rule

The review widget uploads screenshots directly to short-lived, single-object presigned
R2 URLs. Because the widget can run on any client website, the private bucket must allow
browser `PUT` requests from arbitrary origins. This does **not** make the bucket public:
an upload still needs a valid signed URL, object key, HTTP method, and unexpired signature.

1. Open the `backline-prod` bucket in Cloudflare → **Settings** → **CORS Policy**.
2. Add this policy:

   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

3. Save it. Keep the bucket's public-development URL and custom-domain access disabled;
   Backline reads files through expiring signed URLs instead.

---

## Part 6 — Set up email (Resend)

**Do not skip this.** Your app signs people in by emailing them a 6-digit code. Without
this configured, that code is only written to the server log — **your customers cannot
log in at all.**

### 6.1 Verify your domain

1. Log into [Resend](https://resend.com) → **Domains** → **Add Domain**
2. Enter `yourdomain.com` → **Add**
3. Resend shows several DNS records (DKIM, SPF, etc.)
4. Go to wherever you bought your domain (or Cloudflare DNS) and add each record exactly
   as shown — copy/paste, don't retype
5. Back in Resend, click **Verify**. This can take 15 minutes to a few hours.

> You *can* test with Resend's sandbox domain, but it only delivers to your own address —
> useless for real customers. Verify your domain properly.

### 6.2 Create the API key

1. Resend → **API Keys** → **Create API Key**
2. **Name:** `backline-prod`
3. **Permission:** **Sending access**
4. **Domain:** your verified domain
5. Copy the key (starts with `re_`) into your note → `RESEND_API_KEY`

Also decide your from-address, e.g. `Backline <hello@yourdomain.com>` →
`RESEND_FROM_ADDRESS`. The domain part **must** be the domain you just verified.

---

## Part 7 — Generate your secret keys

Two keys **must** be changed from their built-in defaults. The defaults are written in
your source code, which means anyone reading it could forge a login to any account.

Open your **Terminal** app (Mac: press `Cmd+Space`, type "Terminal", Enter).

### 7.1 The login-signing key

Copy this line, paste into Terminal, press Enter:

```bash
openssl rand -hex 32
```

It prints a long line of letters and numbers. Copy it → `JWT_SIGNING_KEY`.

### 7.2 The integrations encryption key

Paste this whole block into Terminal and press Enter:

```bash
cd ~/Q_A_TOOL/backend && uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

It prints a line ending in `=`. Copy it → `INTEGRATIONS_ENCRYPTION_KEY`.

> Keep both in your password manager (1Password, Bitwarden). If you lose the second one,
> any connected ClickUp/Slack integrations must be reconnected. Never put either in a
> chat message, screenshot, or the code itself.

---

## Part 8 — Deploy the backend (Railway)

### 8.1 Create the project from GitHub

1. Log into [Railway](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo**
3. Click **Configure GitHub App**, grant access to your **organization** and select the
   `backline` repository
4. Back in Railway, pick the `backline` repo

Railway will start a build and it may fail — that's expected. Configure it now.

### 8.2 Point it at the right Dockerfile

**This part is important and easy to get wrong.**

1. Click the service → **Settings** tab
2. Under **Source**:
   - **Root Directory:** leave **empty** (meaning the repo root) — **not** `backend`
   - **Dockerfile Path:** `backend/Dockerfile`
3. Under **Networking** → click **Generate Domain**. You'll get something like
   `backline-production-abc1.up.railway.app`. Copy it — call this your **temporary API URL**.

> **Why root and not `backend`?** Your backend also serves the little review widget that
> gets injected into your customers' websites, and that widget is built from `apps/widget/`,
> which sits outside `backend/`. If Railway builds with `backend/` as the root, the widget
> isn't in the image and **it silently 404s — reviewers would see your customers' site with
> no commenting layer at all, and no error message anywhere.**

### 8.3 Add Redis

1. In your Railway project, click **+ New** → **Database** → **Add Redis**
2. That's it. Railway wires `REDIS_URL` in automatically.
3. Click the Redis service → **Variables** and confirm a `REDIS_URL` exists.

If your backend service doesn't automatically get `REDIS_URL`, add it manually in the next
step using the value `${{Redis.REDIS_URL}}`.

### 8.4 Add your settings (variables)

Click your **backend service** → **Variables** tab → **RAW Editor**. Paste the block
below, replacing every `...` with your saved values:

```
ENVIRONMENT=production
MONGO_URI=mongodb+srv://backline_app:YOURPASSWORD@backline-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=backline_prod
REDIS_URL=${{Redis.REDIS_URL}}
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=backline-prod
R2_ENDPOINT_URL=https://....r2.cloudflarestorage.com
JWT_SIGNING_KEY=...
INTEGRATIONS_ENCRYPTION_KEY=...
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=Backline <hello@yourdomain.com>
CORS_ALLOW_ORIGINS=["https://app.yourdomain.com"]
PUBLIC_API_BASE_URL=https://api.yourdomain.com
PUBLIC_DASHBOARD_BASE_URL=https://app.yourdomain.com
```

> 🚨 **`CORS_ALLOW_ORIGINS` must be in square brackets with double quotes**, exactly like
> the example. Writing it as a plain comma-separated list **crashes the app on startup**
> with a confusing error. This is the single most common mistake here.

Don't worry that `api.yourdomain.com` and `app.yourdomain.com` don't exist yet — you'll
create them in Part 10 and come back in Part 11.

Click **Deploy**.

### 8.5 Check it started

1. **Deployments** tab → watch the log. You want "Application startup complete."
2. Open in your browser: `https://YOUR-TEMP-URL.up.railway.app/health`
3. You should see:
   ```json
   {"status":"ok","mongo":"ok","redis":"ok"}
   ```

If any value isn't `ok`, jump to [Appendix B](#appendix-b--troubleshooting).

### 8.6 Start the background worker

Some work runs in the background (re-finding comments when a client's site changes,
sending digest emails). It needs its own service.

1. Railway → **+ New** → **GitHub Repo** → pick `backline` again (yes, the same repo)
2. This new service → **Settings**:
   - **Root Directory:** empty
   - **Dockerfile Path:** `backend/Dockerfile`
   - **Custom Start Command:** `arq app.workers.main.WorkerSettings`
   - **Networking:** do **not** generate a domain — this service has no website
3. **Variables** → RAW Editor → paste **the exact same variables** as in 8.4
4. Deploy. The log should read `Starting worker for N functions`.

---

## Part 9 — Deploy the dashboard (Vercel)

### 9.1 Import the project

1. Log into [Vercel](https://vercel.com) → **Add New… → Project**
2. **Import Git Repository** → grant access to your org → select `backline`
3. On the configure screen:
   - **Framework Preset:** Vite
   - **Root Directory:** click **Edit** and choose `apps/web` ← **required**
   - Leave Build Command and Output Directory at their defaults

### 9.2 Add the dashboard's settings

Still on that screen, expand **Environment Variables** and add:

| Name | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://api.yourdomain.com` |

(If you're testing before your domain works, temporarily use your Railway temp URL.)

Optional, add later if you set them up:

| Name | Value |
|---|---|
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | from Part 12 |
| `VITE_SENTRY_DSN` | from Part 13 |

### 9.3 Deploy

Click **Deploy** and wait ~1–2 minutes. Vercel gives you a URL like
`backline-xyz.vercel.app`. Open it — you should see your login screen.

> **Note:** these `VITE_` values get baked in at build time, not read live. Whenever you
> change one, you must **redeploy** for it to take effect.

---

## Part 10 — Connect your domain

### 10.1 Dashboard → `app.yourdomain.com`

1. Vercel → your project → **Settings** → **Domains**
2. Type `app.yourdomain.com` → **Add**
3. Vercel shows a DNS record (usually a `CNAME` to `cname.vercel-dns.com`)
4. Add that record at your domain provider
5. Wait for Vercel to show **Valid Configuration** (usually minutes, up to 48h)

### 10.2 Backend → `api.yourdomain.com`

1. Railway → your **backend** service → **Settings** → **Networking** → **Custom Domain**
2. Type `api.yourdomain.com` → Railway shows a `CNAME` target
3. Add that record at your domain provider
4. Wait for Railway to confirm

HTTPS certificates are issued automatically by both — you don't need to buy one.

---

## Part 11 — Close the loop (the step everyone forgets)

Your services were configured with domain names that didn't exist yet. Now they do, so
make sure everything points at the real ones.

1. **Railway → backend service → Variables**, confirm exactly:
   ```
   CORS_ALLOW_ORIGINS=["https://app.yourdomain.com"]
   PUBLIC_API_BASE_URL=https://api.yourdomain.com
   PUBLIC_DASHBOARD_BASE_URL=https://app.yourdomain.com
   ```
   No trailing slashes. `https`, not `http`.
2. **Railway → worker service → Variables** — same values.
3. **Vercel → Settings → Environment Variables** — `VITE_API_BASE_URL=https://api.yourdomain.com`
4. **Vercel → Deployments → ⋯ on the latest → Redeploy** (required — see the note in 9.3)

Why each one matters:
- `CORS_ALLOW_ORIGINS` — the backend refuses browser requests from origins not on this
  list. Wrong here = dashboard loads but every action fails.
- `PUBLIC_API_BASE_URL` — the address stamped into the review widget injected into your
  customers' sites. Wrong here = the commenting layer never appears for reviewers.
- `VITE_API_BASE_URL` — where the dashboard sends its requests.

---

## Part 12 — Optional: Google sign-in

Skip this for launch if you like; email codes work on their own.

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project
2. **APIs & Services → OAuth consent screen** → External → fill in app name, support
   email, logo
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. **Application type:** Web application
5. **Authorised JavaScript origins:** `https://app.yourdomain.com`
6. **Authorised redirect URIs:** `https://app.yourdomain.com/auth/callback`
   (must match **exactly** — no trailing slash)
7. Copy the **Client ID** and **Client Secret**
8. Add to **Railway** (both services):
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   GOOGLE_OAUTH_REDIRECT_URI=https://app.yourdomain.com/auth/callback
   ```
9. Add to **Vercel**: `VITE_GOOGLE_OAUTH_CLIENT_ID=...` then **redeploy**

---

## Part 13 — Turn on error alerts (Sentry)

Without this, you only find out something is broken when a customer complains.

1. [sentry.io](https://sentry.io) → **Create Project** → **FastAPI** → name `backline-backend`
2. Copy the **DSN** → add to Railway (both services): `SENTRY_DSN=https://...`
3. Create a second project → **React** → name `backline-dashboard`
4. Copy that DSN → add to Vercel: `VITE_SENTRY_DSN=https://...` → **redeploy**
5. Sentry → **Alerts** → create a rule to email you on new issues

---

## Part 14 — Prove it works (smoke test)

Don't assume. Walk the real path a customer takes.

**A. Sign-in works (proves database + email)**
1. Open `https://app.yourdomain.com`
2. Enter your email → **Send sign-in code**
3. **Check your inbox** — the code must actually arrive. If it doesn't, email is
   misconfigured (Part 6) and no customer can ever log in.
4. Enter the code → you should land in the app

**B. Create real work (proves the core loop)**
1. Create a workspace
2. Create a project pointing at a real website you own
3. Open the project — the site should load inside the canvas

**C. The review widget works (proves the Dockerfile fix)**
1. In the project, click **Share** and copy the client review link
2. **Open that link in a private/incognito window** (this is what your customer's client sees)
3. Enter a name when prompted
4. **Click somewhere on the page** — a pin and comment box must appear

> If nothing happens when you click, the widget didn't load. Check
> `https://api.yourdomain.com/widget/sdk.js` in your browser — it should download a
> JavaScript file, not show an error. If it errors, re-check Part 8.2.

**D. Comments stick (proves storage + database)**
1. Post a comment, attach an image
2. **Refresh the page** — the pin must still be there, in the same spot
3. Back in the dashboard, open the **Comments** panel — the comment and its attachment
   should be listed

**E. Nothing leaks (proves security)**
1. Still in incognito, try to open `https://app.yourdomain.com` directly
2. You should be asked to log in — a client must never reach your dashboard

If all five pass, you're live.

---

## Part 15 — Backups and safety

### Database backups — do this before your first paying customer

- **On M0 (free): there are no automatic backups.** If data is deleted, it's gone forever.
- **Upgrade to M10** and Atlas takes continuous backups you can restore point-in-time.
  Atlas → your cluster → **Backup** → confirm it's **On**.

**Test your restore once**, before you need it. A backup you've never restored is a guess,
not a safety net.

### Other safety basics

- **2FA everywhere** — GitHub, Atlas, Railway, Vercel, Cloudflare
- **Never paste secrets into chat, tickets, or screenshots**
- **Rotate keys if someone leaves the team** — regenerate `JWT_SIGNING_KEY` (this logs
  everyone out, which is the point) and the R2 tokens
- **Uptime monitoring** — free at [uptimerobot.com](https://uptimerobot.com): ping
  `https://api.yourdomain.com/health` every 5 minutes, alert your phone

---

## Part 16 — How to ship an update later

Your setup deploys automatically. The flow is:

1. Developer makes changes on their computer
2. They push to a **branch** and open a **Pull Request** on GitHub
3. They run the affected lint, typecheck, build, and permitted isolated test checks
   locally and record the result in `docs/implementation/06-delivery.md`
4. The reviewer confirms that evidence before approving the change
5. Merge the PR into `main`
6. Railway and Vercel each detect the change and deploy automatically, in ~2–5 minutes
7. **Re-run the smoke test** (Part 14) after anything significant

Railway watch paths can skip an unaffected service. For example, a docs-only change may
deploy Vercel but correctly show "No deployment needed" for the API and worker.

### Protect `main` with review

1. GitHub repo → **Settings** → **Branches** → **Add branch protection rule**
2. **Branch name pattern:** `main`
3. Tick:
   - **Require a pull request before merging**
   - **Do not allow bypassing the above settings**
4. **Create**

### If a deploy breaks production

- **Railway:** Deployments tab → find the last good one → **⋯ → Redeploy**
- **Vercel:** Deployments → last good one → **⋯ → Promote to Production**

Roll back first, diagnose after. Don't debug live with customers watching.

---

## Part 17 — Legal and business must-haves

You're handling other companies' data. Before charging money:

- [ ] **Privacy Policy** and **Terms of Service** on your site, linked from sign-up.
      Templates: [termly.io](https://termly.io), [iubenda.com](https://iubenda.com), or a
      lawyer if you're selling to enterprises.
- [ ] **Tell customers where their data lives** (which cloud region) — EU customers will
      ask, and GDPR requires it.
- [ ] **A support email that a human reads**, e.g. `support@yourdomain.com`
- [ ] **A way to delete a customer's data on request** — currently a manual database
      operation; be honest that it's manual, and actually do it when asked
- [ ] **Decide your pricing** before your first sales call
- [ ] **An invoicing method** (see [Part 0](#part-0--before-you-sell-anything-important) —
      the app cannot take payments yet)
- [ ] **Know your limits** — re-read Part 0's table so you never promise an unbuilt feature

---

## Appendix A — What this costs

**Starting out (first customers):**

| Service | Plan | Cost/month |
|---|---|---|
| MongoDB Atlas | M0 free (⚠️ no backups) | $0 |
| Railway (backend + worker + Redis) | Hobby | ~$5–20 |
| Vercel | Hobby | $0 |
| Cloudflare R2 | 10 GB free | $0 |
| Resend | 3,000 emails/mo free | $0 |
| Sentry | Developer | $0 |
| Domain | — | ~$1 |
| **Total** | | **~$6–21** |

**Once you have paying customers (recommended):**

| Service | Plan | Cost/month |
|---|---|---|
| MongoDB Atlas | **M10 (backups!)** | ~$57 |
| Railway | Pro | ~$20–40 |
| Vercel | Pro (needed for commercial use) | $20 |
| Cloudflare R2 | pay-as-you-go | ~$1–5 |
| Resend | Pro | $20 |
| Sentry | Team | $26 |
| **Total** | | **~$145–170** |

> Vercel's Hobby plan is **not licensed for commercial use**. Once you're charging money,
> you need Vercel Pro.

---

## Appendix B — Troubleshooting

### `/health` shows `"mongo":"unreachable"`
- Password not substituted for `<db_password>` in `MONGO_URI` (angle brackets left in)
- Password contains `@ / : #` — regenerate one without them
- Atlas **Network Access** doesn't include `0.0.0.0/0` (Part 4.3)

### `/health` shows `"redis":"unreachable"`
- Redis service not added, or `REDIS_URL` missing from the backend's Variables
- Use `${{Redis.REDIS_URL}}` rather than pasting the URL by hand

### Backend won't start / crashes instantly
Read the Railway deploy log, top to bottom. Most common:
- **`error parsing value for field "cors_allow_origins"`** → your `CORS_ALLOW_ORIGINS`
  isn't a JSON array. It must be `["https://app.yourdomain.com"]`.
- A required variable is missing entirely

### Dashboard loads, but every action fails / "Network error"
- `CORS_ALLOW_ORIGINS` doesn't exactly match your dashboard URL (check `https`, no
  trailing slash, correct subdomain)
- `VITE_API_BASE_URL` is wrong, **or you changed it and didn't redeploy Vercel**

### Refreshing a page in the dashboard shows a 404
- `apps/web/vercel.json` is missing from your repo. It should exist — re-check it got
  committed and pushed.

### Clicking on the client's site does nothing (no pin appears)
- Open `https://api.yourdomain.com/widget/sdk.js` — must download a file, not 404
- If 404: Railway **Root Directory** must be empty and **Dockerfile Path** must be
  `backend/Dockerfile` (Part 8.2)
- `PUBLIC_API_BASE_URL` must be your real `https://api.yourdomain.com`

### Sign-in code email never arrives
- `RESEND_API_KEY` missing → codes are only written to the Railway log
- Domain not verified in Resend, or `RESEND_FROM_ADDRESS` uses an unverified domain
- Check spam; check Resend's dashboard for delivery failures

### Screenshots/attachments don't appear
- R2 keys wrong, or the token wasn't scoped to the `backline-prod` bucket
- `R2_ENDPOINT_URL` must be the full `https://....r2.cloudflarestorage.com`

### Comments exist in the dashboard but no pins on the page
Usually normal: pins hide when their element is scrolled out of view, and a comment whose
element no longer exists (the client redesigned that section) can't be placed. Click the
comment in the Comments panel to jump to it.

---

## Appendix C — Every setting explained

The full annotated list lives in **`.env.production.example`** in your repo — it documents
every variable, which are required, and how to generate the secret ones.

**Required in production**

| Variable | Meaning |
|---|---|
| `ENVIRONMENT` | Set to `production` |
| `MONGO_URI` | Database address + login |
| `MONGO_DB_NAME` | Database name, e.g. `backline_prod` |
| `REDIS_URL` | Redis address |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_ENDPOINT_URL` | File storage |
| `JWT_SIGNING_KEY` | Signs logins — **must be changed** |
| `INTEGRATIONS_ENCRYPTION_KEY` | Encrypts integration tokens — **must be changed** |
| `CORS_ALLOW_ORIGINS` | Who may call the API — **JSON array** |
| `PUBLIC_API_BASE_URL` | This backend's public address |
| `PUBLIC_DASHBOARD_BASE_URL` | The dashboard's public address |

**Optional (blank = feature simply off)**

| Variable | Meaning |
|---|---|
| `RESEND_API_KEY` / `RESEND_FROM_ADDRESS` | Email — **effectively required for real customers** |
| `GOOGLE_OAUTH_*` | "Sign in with Google" |
| `CLICKUP_OAUTH_*` | ClickUp integration |
| `SENTRY_DSN` | Error alerts |

**Dashboard (Vercel) — baked in at build time, redeploy after changing**

| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | Where the dashboard sends requests |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Google sign-in |
| `VITE_SENTRY_DSN` | Error alerts |
