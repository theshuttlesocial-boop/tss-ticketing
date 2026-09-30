# Marketing site launch checklist (theshuttlesocial.com)

The marketing site and the tickets app are one Vercel project. `proxy.ts` decides what each domain shows:

| Address | Result |
|---|---|
| `theshuttlesocial.com/…` | marketing site (pages in `app/site`) |
| `www.theshuttlesocial.com/…` | 301 → `theshuttlesocial.com/…` |
| `theshuttlesocial.com/tickets`, `/account`, `/privacy`, … | 308 → same path on `tickets.theshuttlesocial.com` |
| `tickets.theshuttlesocial.com/…` | tickets app, unchanged (`/` → `/tickets`) |
| Previews and local dev | behave like the tickets domain; the marketing site is at `/site` |

## 1. Before pointing the domain

- [ ] PR merged and the production deployment is green.
- [ ] Open `https://tickets.theshuttlesocial.com/site` — it should redirect to `https://theshuttlesocial.com/`
      (that only works after step 2; before then just check the preview at `/site`).
- [ ] Check what `theshuttlesocial.com` shows today. Pointing the domain at Vercel replaces it.

## 2. Point the domain at Vercel

In **Vercel** → project **tss-ticketing** → Settings → Domains:

1. Add `theshuttlesocial.com`.
2. Add `www.theshuttlesocial.com` (either "redirect to theshuttlesocial.com" or serve the project; the proxy
   redirects www either way).
3. Vercel shows the DNS records it needs. Copy them exactly.

In **Cloudflare** → theshuttlesocial.com → DNS:

1. Apex (`@`): the **A** record Vercel shows (normally `76.76.21.21`).
2. `www`: **CNAME** to the target Vercel shows (normally `cname.vercel-dns.com`).
3. Set both to **DNS only** (grey cloud), as Vercel recommends.
4. **Don't touch** the `tickets` record, MX records, or any TXT records (SPF/DKIM/DMARC for
   bookings@theshuttlesocial.com email via Resend). Changing those would break tickets or email.

Wait for Vercel to show both domains as valid (usually minutes, can take a few hours).

## 3. After the switch

- [ ] `https://theshuttlesocial.com` shows the new homepage, with live "This week".
- [ ] `https://www.theshuttlesocial.com` redirects to the apex.
- [ ] `https://theshuttlesocial.com/tickets` goes to the tickets site; booking still works end to end.
- [ ] `https://tickets.theshuttlesocial.com` is unchanged.
- [ ] `https://theshuttlesocial.com/robots.txt` points at `https://theshuttlesocial.com/sitemap.xml`.
- [ ] `https://theshuttlesocial.com/sitemap.xml` lists the homepage.
- [ ] Share the link in WhatsApp: the green "Badminton that's social." card appears.
- [ ] A made-up address (e.g. `/nope`) shows the site's own 404.
- [ ] [PageSpeed Insights](https://pagespeed.web.dev/) on the homepage: performance above 90 on mobile and desktop.
- [ ] Dark mode, reduced motion (turn on "Reduce motion" on a phone) and keyboard navigation all work.

## 4. Search

- [ ] Google Search Console: add `theshuttlesocial.com` as a Domain property (DNS TXT verification in Cloudflare;
      adding a TXT record is safe).
- [ ] Submit `https://theshuttlesocial.com/sitemap.xml` and `https://tickets.theshuttlesocial.com/sitemap.xml`.
- [ ] Check the homepage with the [Rich Results Test](https://search.google.com/test/rich-results)
      (organisation and upcoming sessions as events).
- [ ] Update the Instagram and TikTok bio links to `theshuttlesocial.com` if you want people to land on the site
      rather than straight on tickets.

## What's where

- Homepage: `app/site/page.tsx`; styles and tokens: `app/site/site.css`; design rules: `docs/design-brief.md`.
- Stats the club supplies (players, WhatsApp, regulars, fastest sell-out): `lib/site/stats.ts`.
  The sessions count is live.
- Share image: `app/site/opengraph-image.tsx`. Robots and sitemap: `app/robots.ts`, `app/sitemap.ts`.
