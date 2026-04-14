# PackPath

AI-powered backpacking route planner. Tell it where you want to go, how far you want to hike, what scenery you want, and what you're afraid of — it stitches together real named trail segments into 3 ranked itineraries and exports them to Gaia GPS, onX, CalTopo, AllTrails, or Garmin.

---

## Repo structure

```
packpath/
├── index.html              ← The entire frontend (one file)
├── vercel.json             ← Vercel routing config
├── api/
│   ├── generate-routes.js  ← Claude API proxy (route generation)
│   └── save-email.js       ← Email capture → Beehiiv
└── README.md
```

---

## Deploy to Vercel (10 minutes)

### 1. Push to GitHub

Create a new repo at github.com — name it `packpath` or whatever you want. Then:

```bash
git init
git add .
git commit -m "Initial PackPath deploy"
git remote add origin https://github.com/YOUR_USERNAME/packpath.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `packpath` GitHub repo
3. Framework preset: **Other** (not Next.js)
4. Root directory: `/` (leave as default)
5. Click **Deploy**

### 3. Add environment variables

In Vercel → your project → **Settings** → **Environment Variables**, add:

| Variable | Value | Required |
|----------|-------|----------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | ✅ Yes |
| `BEEHIIV_API_KEY` | Your Beehiiv API key | Optional |
| `BEEHIIV_PUB_ID` | Your Beehiiv publication ID | Optional |

After adding variables → **Redeploy** (Deployments tab → three dots → Redeploy).

### 4. Custom domain (optional)

Vercel → your project → **Domains** → Add:
- `packpath.app` if you buy it (~$12/yr on Namecheap)
- or `packpath.promptlyconsulting.com` for free using your existing domain

---

## How it works

```
User fills form
  → clicks "Find my routes"
    → email gate (optional email capture → Beehiiv)
      → loading screen
        → POST /api/generate-routes
          → Vercel serverless function calls Claude Sonnet
            → Claude returns 3 JSON route objects with real trail segments
              → Frontend renders route cards
                → User taps "Send to app"
                  → GPX/KML download + deep link to Gaia/onX/CalTopo/AllTrails/Garmin
```

---

## Environment variables explained

### `ANTHROPIC_API_KEY` (required)
Get this from [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key.

The app uses `claude-sonnet-4-20250514`. Each route generation call costs roughly **$0.025** (2.5 cents) — about $0.75/day at 30 searches/day.

### `BEEHIIV_API_KEY` + `BEEHIIV_PUB_ID` (optional)
If set, emails captured at the gate are automatically subscribed to your Beehiiv publication. Without these, emails are just logged to Vercel function logs (still captured, just not auto-synced).

Get from: Beehiiv → Settings → Integrations → API.

---

## Rate limiting

The `/api/generate-routes` function has in-memory rate limiting at **3 requests per IP per minute**. This resets per function cold start — good enough for launch.

For production at scale, swap to persistent rate limiting:

```bash
vercel kv create packpath-ratelimit
```

Then replace the `rateLimitMap` in `generate-routes.js` with `@vercel/kv`.

---

## Cost at scale

| Monthly searches | Claude API | Vercel | Total |
|-----------------|-----------|--------|-------|
| 500 | ~$12 | Free | ~$12 |
| 2,000 | ~$50 | Free | ~$50 |
| 10,000 | ~$250 | ~$20 | ~$270 |
| 50,000 | ~$1,250 | ~$20 | ~$1,270 |

---

## Monetization (when ready)

### Stripe paywall
Add a Stripe checkout before the email gate. Free users get 3 lifetime searches, $7/month for unlimited. Same pattern as ReBrief.

```
/api/create-checkout.js   ← Stripe checkout session
/api/stripe-webhook.js    ← Handle successful payments
```

### Affiliate links
The export sheet already has affiliate link placeholders for Gaia GPS, onX Backcountry, and REI. Swap these URLs for your actual affiliate links:

- **Gaia GPS**: gaiagps.com affiliate program
- **onX Backcountry**: onxmaps.com/affiliate
- **REI**: rei.com affiliate program (Impact Radius)
- **AllTrails**: alltrails.com (ShareASale)

---

## Local development

```bash
npm install -g vercel
vercel dev
```

This starts a local server at `localhost:3000` with the serverless functions running. You'll need your env vars in a `.env.local` file:

```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Questions

Built by Promptly Consulting. Contact: info@promptlyconsulting.com
