# Solana Sniper Bot

Scans Solana for new memecoin launches that pass safety and liquidity filters, then sends formatted alerts to Telegram. Built for free-tier APIs, always-on hosting on Fly.io.

## What it actually does

Every 30 seconds:
1. Pulls the latest Solana token profiles from DexScreener
2. For each one: fetches the most-liquid trading pair and runs a fast pre-filter
3. Survivors get a RugCheck safety report (mint/freeze authority, LP lock, holder distribution)
4. Tokens that pass every filter trigger a Telegram alert with links to DexScreener, RugCheck, and Birdeye
5. SQLite remembers what it has already alerted on so you don't get duplicates

## Honest expectations

This is an **early scanner**, not a true sub-second sniper. Free APIs lag the chain by 30s–2min. You won't be first into a launch; you'll be early-ish into launches that have already survived the initial chaos. That's a deliberate tradeoff for free + always-on + zero maintenance.

If you later want to graduate to true sniping, drop a Helius paid-tier websocket URL into `RPC_WS` in `config.js` and we can add a websocket listener for new pool creations.

## Filters (balanced preset)

Edit `src/config.js` to tune. Current defaults:
- Liquidity ≥ $5,000
- Market cap $15k – $300k
- 1h volume ≥ $3,000
- 1h buys ≥ 55% of all txns
- Holders ≥ 50, top holder < 5%, top 10 < 25%
- Mint + freeze authority revoked, LP locked or burned
- Token age between 2 and 30 minutes

## Deploy on Fly.io from your phone

Everything below is doable from a phone browser. You will need:
- A GitHub account (free)
- A Fly.io account (free, requires a payment method but won't charge for this workload)

### Step 1 — get the code into your own GitHub repo

1. Open github.com on your phone, sign in
2. Tap **+** → **Import repository** (or **New repository** and upload these files)
3. The easiest path: create a new empty repo, then use the GitHub mobile app or web "Add file → Upload" to upload all the files in this folder

### Step 2 — sign up for Fly.io

1. Go to fly.io → Sign up with GitHub
2. Add a payment method (required, but the free allowance covers this app)
3. From the dashboard, tap **Launch an app** → **Deploy from GitHub** → pick your repo

Fly will detect the `Dockerfile` and `fly.toml` automatically. If asked, accept all defaults except:
- App name: pick anything unique (e.g. `your-name-sniper`)
- Region: keep `iad` (Ashburn)
- Postgres / Redis: **no**

### Step 3 — set your secrets

In your app's Fly dashboard:
1. Go to **Secrets**
2. Add:
   - `TELEGRAM_BOT_TOKEN` = the token from @BotFather
   - `TELEGRAM_CHAT_ID` = your numeric ID from @userinfobot

After adding secrets, Fly will redeploy automatically.

### Step 4 — make sure the volume is attached

The `fly.toml` declares a volume called `sniper_data` mounted at `/data`. If Fly says the volume doesn't exist:
1. Go to **Volumes** in the dashboard
2. Create one named `sniper_data`, size 1 GB, region `iad`
3. Restart the app

### Step 5 — watch the logs

In the Fly dashboard, open **Live logs**. Within a minute you should see:
```
Solana Sniper Bot starting
[scan #1] fetching latest Solana profiles…
[scan #1] N solana candidates
```

And you should get a "🟢 Sniper bot online" message in Telegram.

## Tuning

If you get too many alerts: in `src/config.js`, raise `MIN_LIQUIDITY_USD`, raise `MIN_VOLUME_H1_USD`, or lower `MAX_TOP_HOLDER_PCT`.

If you get too few: lower `MIN_VOLUME_H1_USD`, widen `MAX_MARKET_CAP_USD`, or set `MIN_HOLDERS` to a smaller number. To see *why* candidates are being skipped, uncomment the `console.log` line in `src/index.js` inside `processCandidate`.

After editing, commit to GitHub. Fly will auto-redeploy if you connected the repo.

## Local testing (optional, requires a computer)

```bash
npm install
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...
export DB_PATH=./sniper.db
npm start
```

## Security note

The `.gitignore` excludes `.env` files. **Never commit your bot token to GitHub.** Always use Fly secrets.

If your token leaks, message @BotFather → `/revoke` → pick your bot → it issues a new one.
