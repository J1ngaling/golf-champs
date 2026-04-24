# ⛳ Golf Champs Dashboard

Season-long fantasy golf league tracker for the four majors.

## Setup Guide

### 1. Firebase (free database)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `golf-champs` → create
3. In the left sidebar go to **Build → Realtime Database**
4. Click **Create database** → choose any region → start in **test mode** (you can lock it down later)
5. In the left sidebar go to **Project Settings** (gear icon) → **General** tab
6. Scroll to **Your apps** → click **</>** (Web) → register app → you'll get a config object like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "golf-champs-xxx.firebaseapp.com",
  databaseURL: "https://golf-champs-xxx-default-rtdb.firebaseio.com",
  projectId: "golf-champs-xxx",
  storageBucket: "golf-champs-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123..."
};
```

Copy each value — you'll need them in the next steps.

---

### 2. Local setup

```bash
# Clone / download this project, then:
cd golf-champs
npm install

# Create your local env file
cp .env.local.example .env.local
```

Open `.env.local` and fill in the Firebase values from step 1, plus pick an admin PIN:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=golf-champs-xxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://golf-champs-xxx-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=golf-champs-xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=golf-champs-xxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123...
NEXT_PUBLIC_ADMIN_PIN=yourpinhere
```

Test it locally:
```bash
npm run dev
# Open http://localhost:3000
```

---

### 3. Deploy to Vercel

#### Option A — via GitHub (recommended)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. In the **Environment Variables** section, add all 8 variables from your `.env.local`
4. Click **Deploy** — done ✅

Your live URL will be something like `golf-champs.vercel.app`

#### Option B — via Vercel CLI

```bash
npm i -g vercel
vercel          # follow the prompts
# When asked about env vars, add them one by one or paste from .env.local
```

---

### 4. Using the dashboard

**As a viewer:** Just open the URL — standings, results and prizes are all public and update in real time.

**As admin (you):**
1. Click the 🔐 icon in the top-right
2. Enter your PIN
3. You'll see an **Admin** badge and the ⚙️ settings icon
4. Go to Tournaments → **Enter scores** after each major
5. Click 🚪 to log out when done

---

### Firebase security (optional, after testing)

Once you're happy everything works, lock down the database so only reads are public.
In Firebase console → Realtime Database → Rules, replace with:

```json
{
  "rules": {
    ".read": true,
    ".write": false
  }
}
```

This means anyone can view the data but nobody can write to it from the browser. Since writes happen through the admin PIN flow on your own session, this is fine — the PIN gate happens client-side and the Firebase SDK handles the actual write with your project's credentials.

---

### Costs

Firebase Realtime Database free tier: **1 GB storage, 10 GB/month transfer**.
This app uses a few kilobytes. You will never hit the limits.

Vercel free tier: **100 GB bandwidth/month, unlimited deployments**.
More than enough.

**Total cost: €0**
