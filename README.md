# teriboy.com

A teriyaki restaurant website. Grilled meats, tofu and seafood glazed in a sweet soy-based
teriyaki sauce, served over rice or noodles with a side of vegetables.

Serving **NAS Lemoore** — sailors, civilian staff and their families — starting with delivery
inside the base to **Main Side** and **Ops Side**.

Static HTML, CSS and vanilla JavaScript. No build step, no dependencies, no framework. Open
`index.html` in a browser and it runs; drop the folder on any host and it ships.

## The ordering model

Teriboy is a **next-day kitchen**, and the whole site is built around that rule:

- Order **before 9:00 PM tonight** → delivered **tomorrow**.
- Order **after 9:00 PM** → the order page automatically moves you to the following day.
- The customer picks the window at checkout: **lunch 11:00 AM – 1:30 PM** or
  **dinner 5:00 PM – 8:00 PM** — same next day, their call.

This is enforced in [`assets/js/main.js`](assets/js/main.js): the delivery date field's `min`
and default value are computed from the cut-off, a live countdown runs in the header badge, and
every `data-cutoff-date` element on the site prints the real earliest delivery date.

## Payment: Zelle + the Julian code

No payment is taken on the website. When an order is submitted, the site issues a **payment
code** and shows it with your Zelle QR code, asking the customer to type the code in the Zelle
memo field so you can match the transfer to the food.

**Code format** — `<sequence>-<YY><DDD>`:

| Part | Meaning | Example |
| --- | --- | --- |
| sequence | Order number for that day, starting at 1 | `1` |
| YY | Last two digits of the year | `26` |
| DDD | Day of the year since 1 January | `253` |

So the first order on 10 September 2026 is stored as `00001-26253` and **displayed to the
customer as `1-26253`**, exactly as specified. Both forms are sent to you: the short one in the
`payment_code` field, and `1-26253  [00001-26253]` at the bottom of the itemised order.

The QR shown on the confirmation screen is [`assets/img/zelle-qr.jpg`](assets/img/zelle-qr.jpg).
Replace that one file if your Zelle account ever changes.

### The one caveat worth knowing

The site is static — there is no server keeping a counter. The daily sequence lives in the
customer's own browser (`localStorage`), so **two different customers ordering on the same day
can both be given `1-26253`.** The number only increments for repeat orders from the same
device.

In practice each Formspree email still carries the name, the amount, the delivery date and the
timestamp, so two identical codes remain easy to tell apart — but if order volume grows, the
clean fix is a small backend (or a form service with a sequence field) that hands out the number
authoritatively. Until then, treat the code as a matching hint rather than a guaranteed unique key.

## Portion sizes

Every main is built to one of three sizes, chosen once at checkout and applied to **each main
dish** in the order. Sides and drinks are unaffected.

| Portion | What is on the plate | Upcharge per main |
| --- | --- | --- |
| Diet | 1 cup of rice, extra vegetables, full protein | **+$1.50** |
| Regular | 2 cups of rice, vegetables, protein | Included |
| Extra | 2.5 cups of rice, more vegetables, more protein, soda | **+$3.99** |
| Extra with a Monster | as above, with a Monster instead of a regular soda | **+$5.99** |

Choosing Extra reveals the soda selector; picking Monster swaps the $3.99 for $5.99. The order
summary shows the maths in plain language — "Extra portions with Monster × 3 = $17.97" — and the
same line goes into the order email. The upcharge counts toward the $60 free-delivery threshold.

Prices live in two places and must be changed together: `data-fee` attributes on the portion
radios in [order.html](order.html), and `PORTION_FEES` / `MONSTER_FEE` in
[`assets/js/admin.js`](assets/js/admin.js).

## The workbook — [admin.html](admin.html)

An eight-tab spreadsheet for running the business. It is **not linked from the site** and is
excluded in `robots.txt`; open it directly at `/admin.html`.

| Tab | What it does |
| --- | --- |
| 1 · Customers | One row per customer, keyed by phone number. Orders, lifetime spend and last order date are calculated. |
| 2 · Daily | Where orders are recorded — the ledger everything else reads from. Plus a per-day rollup. |
| 3 · Weekly | Monday-start weeks. |
| 4 · Monthly | Calendar months. |
| 5 · Quarterly | Q1–Q4. |
| 6 · Semi-annual | H1 January–June, H2 July–December. |
| 7 · Annual | One row per year. |
| 8 · Summary | Expense ledger, total income, total expenses, net profit, margin, and a category breakdown. |

**How it fits together.** You only ever type into three places: customers (tab 1), orders
(tab 2) and expenses (tab 8). Tabs 3–7 are computed views of those rows — every report shows
orders, unique customers, food, portion upcharges, delivery, income, expenses and net profit,
with a totals row. Cancelled orders are excluded from income everywhere.

Entering an order for an unknown phone number **adds that customer automatically**, and typing a
known number fills in the name. Portion upcharges are computed with the same rules as the
website, so the books and the order form can never drift apart.

**Where the data lives.** In this browser's `localStorage`, on this device. Nothing is uploaded.
That means:

- Clearing site data wipes the books. **Use the Backup button** — it writes a JSON file you can
  keep, and Restore reads it back.
- The books do not sync between your phone and your laptop. Backup and restore to move them.
- Every tab has an **Export CSV** button if you would rather work in Excel or Sheets.

If the business outgrows this — more than one person entering orders, or you want the website's
orders to land here automatically — that is the point to move the ledger to a real backend.

## Pages

| File | Purpose |
| --- | --- |
| [index.html](index.html) | Home — hero, how it works, signature dishes, the glaze, services, reviews |
| [about.html](about.html) | Story, values, milestones, the team |
| [services.html](services.html) | Delivery, command catering, party trays, meal plans, live grill events, pickup |
| [menu.html](menu.html) | Full menu with category filters and "add to order" links |
| [order.html](order.html) | Order builder — steppers, live totals, cut-off logic, Zelle confirmation |
| [video.html](video.html) | Feature film and clip gallery |
| [contact.html](contact.html) | Formspree contact form, kitchen details, hours, quick FAQs |
| [faqs.html](faqs.html) | Accordion FAQs — ordering, delivery, food, catering, payment codes |
| [terms.html](terms.html) | Terms of Service |
| [privacy.html](privacy.html) | Privacy Policy (covers Formspree and what Zelle does not share) |
| [404.html](404.html) | Not-found page |
| [admin.html](admin.html) | The workbook — internal, unlisted, `noindex` |

Header menu: Home · About · Services · Menu · Order · Video · Contact
Footer menu: Terms · Privacy · FAQs (plus Explore, Support and kitchen details)

## Forms

Both forms post to your Formspree endpoint:

```
https://formspree.io/f/xjyvjzjg
```

They submit over `fetch` with `Accept: application/json`, so the visitor stays on the page. Each
form sends a `form_type` field (`Order` or `Contact`) and its own `_subject`, so the two are easy
to tell apart in your inbox, and both carry a hidden `_gotcha` honeypot for spam.

An order email includes `payment_code`, `base_area` (Main Side / Ops Side), `command`, `payment`
and an itemised `order_details` receipt:

```
2 x Chicken Teriyaki @ $13.50 = $27.00
1 x Salmon Teriyaki @ $17.90 = $17.90
----------------------------------------
Subtotal: $44.90
Delivery: $4.90
TOTAL: $49.80
Delivery date: 2026-09-11
Delivery slot: Lunch (11:00 AM - 1:30 PM)
PAYMENT: Zelle
PAYMENT CODE (Zelle memo): 1-26253  [00001-26253]
```

## Delivery areas

Currently on base only. Flat **$4.90**, free over **$60**, no minimum, pickup free.

- **Main Side** — housing, admin buildings, the NEX area, the schools.
- **Ops Side** — squadron spaces, hangars, flight line buildings.
- **Off base** — Lemoore town and Hanford are described as "next" on the services page.

The order form asks for the base area, the delivery point, and building/command/squadron. If
your driver arrangements differ — escorts, gate meets, who can get where — the wording lives in
[services.html](services.html), [faqs.html](faqs.html) and [terms.html](terms.html).

## Still placeholder — change before going live

1. **Emails** — `hello@teriboy.com`, `catering@teriboy.com`, `privacy@teriboy.com`.
2. **Social links** — the footer icons point at bare `instagram.com`, `facebook.com`,
   `tiktok.com`, `youtube.com`.
3. **Prices** — menu prices live in the HTML; the order builder reads them from `data-price` on
   each `.pick-row`. Currency, delivery fee and the free-delivery threshold are constants at the
   top of `main.js` (`CURRENCY`, `DELIVERY_FEE`, `FREE_DELIVERY_OVER`).
4. **The team and the story** — names, dates and milestones on [about.html](about.html) are
   invented. So are the three reviews on the home page.
5. **Videos** — every clip on `video.html` has an empty `data-video`. Paste an embed URL to make
   it play:
   ```html
   <div class="video-card__thumb" data-video="https://www.youtube.com/embed/XXXXXXXXXXX">
   ```
   Until then, clicking shows a "publishing soon" state instead of a broken player.
6. **Legal pages** — written for this business model, but not legal advice. Have them reviewed
   and update the "Last updated" dates.
7. **A Zelle name or number in text.** The confirmation screen shows the QR only. Some people
   pay from the same phone they are reading on and cannot scan their own screen — the page tells
   them to screenshot it, but a written Zelle handle next to the QR is friendlier. Add it in
   `zelleBlock()` in `main.js` if you want one.

Contact details are live and correct: **(619) 730-8655**, **676 Siena Way, Lemoore, CA 93245**.

## Menu ↔ order page

The "+ Add to order" links on the menu page pass a dish name to the order builder:

```
order.html?add=Chicken%20Teriyaki
```

The name must match a `data-name` on a `.pick-row` in `order.html` exactly, or the link silently
does nothing. All 14 links currently match.

## Design

Black theme, red accent, gold detailing.

- Colours, spacing, radii and fonts are CSS custom properties at the top of
  [`assets/css/style.css`](assets/css/style.css) — change `--red` or `--gold` once and the whole
  site follows.
- Fonts: **Marcellus** for headings, **Inter** for body, from Google Fonts.
- Dish artwork is inline SVG, not photography. Replacing it with real food photos is the single
  biggest visual upgrade available.
- **Mobile menu** is a full-screen panel sized in `vh` units so all seven links and the Order
  Now button fit on one screen with no scrolling, down to short landscape phones. The brand and
  close button are layered above it so the menu can always be dismissed.
- Content is visible with JavaScript disabled; `prefers-reduced-motion` is honoured.
- **Motion**: `scroll-behavior: smooth` site-wide, so in-page links and the back-to-top button
  glide rather than jump. The mobile menu opens over 0.62s with its links easing in on a
  stagger, instead of snapping open.
- **Back to top**: a round button appears bottom-right once you are 420px down the page, and
  hides itself again at the top and whenever the mobile menu is open.
- Responsive to 320px.

## Deploying

Any static host works. This repo has a `CNAME` for **teriboy.com**, so GitHub Pages serves it
from the repository root — push to `main` and it publishes. There is nothing to build.
