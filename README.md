# teriboy.com

A teriyaki-focused restaurant website. Grilled meats, tofu and seafood glazed in a sweet
soy-based teriyaki sauce, served over rice or noodles with a side of vegetables.

Static HTML, CSS and vanilla JavaScript — no build step, no dependencies, no framework.
Open `index.html` in a browser and it runs; drop the folder on any host and it ships.

## The ordering model

Teriboy is a **next-day kitchen**, and the whole site is built around that rule:

- Order **before 9:00 PM tonight** → delivered **tomorrow**.
- Order **after 9:00 PM** → the order page automatically moves you to the following day.
- The customer picks the window at checkout: **lunch 11:00 AM – 1:30 PM** or
  **dinner 5:00 PM – 8:00 PM** — same next day either way.

This is enforced in [`assets/js/main.js`](assets/js/main.js): the delivery date field's `min`
and default value are computed from the cut-off, a live countdown runs in the header badge,
and every `data-cutoff-date` element on the site prints the real earliest delivery date.

## Pages

| File | Purpose |
| --- | --- |
| [index.html](index.html) | Home — hero, how it works, signature dishes, the glaze, services, reviews |
| [about.html](about.html) | Story, values, milestones, the team |
| [services.html](services.html) | Delivery, office catering, party trays, meal plans, live grill events, pickup |
| [menu.html](menu.html) | Full menu with category filters and "add to order" links |
| [order.html](order.html) | Order builder — quantity steppers, live totals, cut-off logic, Formspree |
| [video.html](video.html) | Feature film and clip gallery |
| [contact.html](contact.html) | Formspree contact form, kitchen details, hours, quick FAQs |
| [faqs.html](faqs.html) | Accordion FAQs — ordering, delivery, food, catering, payments |
| [terms.html](terms.html) | Terms of Service |
| [privacy.html](privacy.html) | Privacy Policy (includes the Formspree processing disclosure) |
| [404.html](404.html) | Not-found page |

Header menu: Home · About · Services · Menu · Order · Video · Contact
Footer menu: Terms · Privacy · FAQs (plus Explore, Support and kitchen details)

## Forms

Both forms post to your Formspree endpoint:

```
https://formspree.io/f/xjyvjzjg
```

They submit over `fetch` with `Accept: application/json`, so the visitor stays on the page and
gets an inline success panel instead of a Formspree redirect. Each form sends a `form_type`
field (`Order` or `Contact`) and its own `_subject`, so the two are easy to tell apart in your
inbox, and both carry a hidden `_gotcha` honeypot for spam.

The order form also sends `order_details` — a plain-text itemised receipt built by JavaScript:

```
2 x Chicken Teriyaki @ $13.50 = $27.00
1 x Salmon Teriyaki @ $17.90 = $17.90
----------------------------------------
Subtotal: $44.90
Delivery: $4.90
TOTAL: $49.80
Delivery date: 2026-09-11
Delivery slot: Lunch (11:00 AM - 1:30 PM)
```

**No payment is taken on the site.** The customer chooses cash on delivery or a card link
emailed after confirmation — keep it that way unless you add a real payment processor.

## Things to change before going live

Everything below is placeholder content standing in for your real details:

1. **Phone** — `(206) 555-0142` (a reserved fictional number). Appears in the footer, contact
   page, FAQs, terms, privacy, the JSON-LD block and one error message in `main.js`.
2. **Address** — `Ember Lane Food Hall, Unit 12, Seattle, WA 98101`.
3. **Email** — `hello@teriboy.com`, `catering@teriboy.com`, `privacy@teriboy.com`.
4. **Social links** — the footer icons point at bare `instagram.com`, `facebook.com`,
   `tiktok.com` and `youtube.com`. Swap in your profile URLs.
5. **Prices and currency** — menu prices live in the HTML; the order builder reads them from
   `data-price` on each `.pick-row`. Currency, delivery fee and free-delivery threshold are
   constants at the top of `main.js` (`CURRENCY`, `DELIVERY_FEE`, `FREE_DELIVERY_OVER`).
6. **Delivery zones and fees** — described on `services.html`, `faqs.html` and `terms.html`.
7. **Videos** — every clip on `video.html` carries an empty `data-video` attribute. Paste an
   embed URL to make it play:
   ```html
   <div class="video-card__thumb" data-video="https://www.youtube.com/embed/XXXXXXXXXXX">
   ```
   Until then, clicking shows a "publishing soon" state instead of a broken player.
8. **Legal pages** — `terms.html` and `privacy.html` are written for this business model but
   are not legal advice. Have them reviewed, and update the "Last updated" dates.
9. **Domain references** — `sitemap.xml`, `robots.txt` and the canonical/Open Graph tags all
   assume `https://teriboy.com/`.

## Menu ↔ order page

The "+ Add to order" links on the menu page pass a dish name to the order builder:

```
order.html?add=Chicken%20Teriyaki
```

The name must match a `data-name` on a `.pick-row` in `order.html` exactly, or the link
silently does nothing. All 14 links currently match. Add a dish to the order page and you can
link to it the same way.

## Design

Black theme, red accent, gold detailing.

- Colours, spacing, radii and fonts are CSS custom properties at the top of
  [`assets/css/style.css`](assets/css/style.css) — change `--red` or `--gold` once and the whole
  site follows.
- Fonts: **Marcellus** for headings, **Inter** for body, loaded from Google Fonts.
- Dish artwork is inline SVG, not photography — nothing to optimise and nothing to break.
  Replacing it with real food photos is the single biggest visual upgrade available.
- Sections fade in on scroll. Content is visible by default and only hidden once the page
  confirms JavaScript is running, so the site still reads with JS disabled.
- Responsive down to 320px; the nav becomes a slide-in drawer below 1024px.
- Honours `prefers-reduced-motion` and has a print stylesheet.

## Deploying

Any static host works — Netlify, Vercel, GitHub Pages, Cloudflare Pages or plain shared
hosting. Upload the folder as-is. There is nothing to build and nothing to install.

For GitHub Pages, push to the default branch and point Pages at the repository root. Most hosts
pick up `404.html` automatically.
