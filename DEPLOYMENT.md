# 🏸 TSS Ticketing — Deployment Guide

Everything you need to go live. Takes ~45 minutes on first setup.

---

## What You'll Have When Done

- **https://tickets.theshuttlesocial.com** — the booking page you share
- **https://tickets.theshuttlesocial.com/admin** — your private dashboard
- Real Stripe payments (1.5% + 20p per ticket, paid by player or absorbed by you)
- Zero double-charging — atomic seat locking at database level
- Email confirmations to every booker (optional)
- Free hosting, free database

---

## Step 1 — Supabase (Free Database)

1. Go to **supabase.com** → Sign up (free)
2. Click "New Project" → name it `tss-ticketing`
3. Choose region: **Europe West** (London)
4. Go to **SQL Editor** → paste the entire contents of `supabase/migrations/001_initial_schema.sql` → Run
5. Go to **Settings → API** → copy:
   - `Project URL` → paste as `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`
   - `anon / public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Enable auto-cleanup of expired holds (optional but recommended)
In Supabase SQL Editor:
```sql
SELECT cron.schedule('cleanup-holds', '* * * * *', 'SELECT cleanup_expired_holds()');
```

---

## Step 2 — Stripe

You already have Stripe from your current setup. You just need to:

1. Go to **dashboard.stripe.com → Developers → API Keys**
2. Copy **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. Copy **Secret key** → `STRIPE_SECRET_KEY`

### Set up the webhook (critical — this confirms payments)
1. Go to **Stripe → Developers → Webhooks → Add endpoint**
2. URL: `https://YOUR-VERCEL-URL.vercel.app/api/confirm-payment`
   (You'll come back to update this after step 3)
3. Events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
4. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## Step 3 — Vercel (Free Hosting)

1. Push this code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "TSS Ticketing initial"
   # Create a new repo on github.com, then:
   git remote add origin https://github.com/YOUR-USERNAME/tss-ticketing.git
   git push -u origin main
   ```

2. Go to **vercel.com** → Sign up with GitHub → Import your `tss-ticketing` repo

3. In Vercel project settings → **Environment Variables**, add all variables from `.env.example`:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
   STRIPE_SECRET_KEY
   STRIPE_WEBHOOK_SECRET
   NEXT_PUBLIC_APP_URL
   ADMIN_SECRET        ← make this a strong password you'll remember
   ```

4. Deploy! Vercel gives you a URL like `tss-ticketing.vercel.app`

5. **Go back to Stripe** and update your webhook URL with the real Vercel URL

---

## Step 4 — Custom Domain (Optional, ~£10/yr)

1. Buy `theshuttlesocial.com` from Namecheap / Google Domains
2. In Vercel → Settings → Domains → Add `tickets.theshuttlesocial.com`
3. Vercel gives you DNS records → add them in your domain registrar

---

## Step 5 — Email Confirmations (Optional, Free)

1. Sign up at **resend.com** (free — 3,000 emails/month)
2. Add your domain, copy API key → `RESEND_API_KEY`
3. Set `EMAIL_FROM=bookings@theshuttlesocial.com`

---

## Day-to-Day Usage

### Creating a new session
Either use the Admin dashboard, or call the API:
```bash
curl -X POST https://tickets.theshuttlesocial.com/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d '{
    "title": "TSS Session #45",
    "venue": "Harrow High School",
    "region": "North/West London",
    "date": "2026-05-08",
    "time": "19:00",
    "capacity": 24,
    "price_pence": 800,
    "status": "open"
  }'
```

### Opening/closing a session
```bash
curl -X PATCH https://tickets.theshuttlesocial.com/api/admin \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d '{"session_id": "UUID-HERE", "status": "closed"}'
```

### Viewing all bookings
Visit: `https://tickets.theshuttlesocial.com/admin`

---

## Cost Summary

| Item | Cost |
|------|------|
| Supabase (database) | £0/month (free tier) |
| Vercel (hosting) | £0/month (free tier) |
| Resend (emails) | £0/month (free tier) |
| Custom domain | ~£10/year (optional) |
| **Stripe per ticket** | **~32p** (1.5% + 20p on £8) |
| **Annual at your volume** | **~£239/year** |
| LegitFit (old price) | £534/year |
| LegitFit (new price) | **£1,068/year** |
| **Your saving** | **~£829/year** |

---

## How the Race Condition Fix Works

When someone clicks "Book":
1. Your database **locks the session row** (Postgres `FOR UPDATE`)
2. It counts confirmed bookings + active holds in the same transaction
3. If a seat is available, it creates a **10-minute hold** atomically
4. **Only then** does Stripe get involved

Two people clicking at the exact same millisecond:
- Person A's database transaction completes first → hold created ✅
- Person B's transaction tries to lock the same row → waits → counts seats → 0 left → returns "sold out" ✅
- Nobody gets double-charged ✅

This is fundamentally different from LegitFit's approach (which processes both payments then refunds one).

---

## File Structure

```
tss-ticketing/
├── app/
│   ├── api/
│   │   ├── sessions/route.ts      — GET sessions, POST new session
│   │   ├── book/route.ts          — Atomic seat hold + Stripe PaymentIntent
│   │   ├── confirm-payment/route.ts — Stripe webhook (confirms bookings)
│   │   └── admin/route.ts         — Admin overview + session management
│   ├── tickets/page.tsx           — Public booking page
│   ├── admin/page.tsx             — Admin dashboard
│   └── layout.tsx
├── lib/
│   ├── supabase.ts                — Database clients + types
│   ├── stripe.ts                  — Stripe helper
│   └── email.ts                   — Email confirmations
├── supabase/migrations/
│   └── 001_initial_schema.sql     — Run this in Supabase SQL editor
├── .env.example                   — Copy to .env.local
└── DEPLOYMENT.md                  — This file
```
