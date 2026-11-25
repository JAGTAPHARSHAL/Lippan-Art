# Mitti & Mirror

A responsive Lippan art storefront and password-protected studio dashboard. The site includes a product catalogue, image uploads, INR pricing, a basket, Razorpay Checkout, signed payment verification, webhook updates, customer order lookup, and fulfilment tracking fields.

The catalogue starts with four sample designs and prices. Replace those with your real artwork and pricing before launch. The brand name and shop story are starter copy in `public/index.html`; the current checkout treats delivery as included in the listed prices.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set a unique `ADMIN_PASSWORD` with at least 12 characters.
3. Run `npm start` from this folder.
4. Open [http://localhost:3000](http://localhost:3000). The studio is at [http://localhost:3000/studio](http://localhost:3000/studio).

The product and order store is created in `data/store.json` on first launch. Back up that file regularly. Images uploaded from the studio are stored in the same file.

## Connect online payments

1. Create/activate a Razorpay merchant account and create API keys in the Razorpay Dashboard. Begin with test keys.
2. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `.env`.
3. Turn on automatic payment capture in the Razorpay Dashboard.
4. In Razorpay Webhooks, add `https://YOUR-DOMAIN/api/webhooks/razorpay`, set a webhook secret, and subscribe to `payment.captured`, `payment.failed`, and `order.paid`. Copy the secret into `RAZORPAY_WEBHOOK_SECRET`.
5. Set `PUBLIC_URL` to the public HTTPS address. `PORT` is optional.
6. Complete a test payment and verify that its order status and payment status update in both the studio and the Track an order section. Switch to live keys only after testing and the Razorpay account is activated.

The app creates the Razorpay order on the server, checks the checkout signature, and confirms payment details with Razorpay before marking an order paid. The webhook endpoint verifies Razorpay’s HMAC signature against the original request bytes and ignores duplicate event IDs.

## Shop and fulfil orders

- Sign in at `/studio` with `ADMIN_PASSWORD` to add, edit, or archive pieces. Product photos may be PNG, JPG, WEBP, or SVG, up to 2.5 MB.
- Orders appear in the studio after checkout starts. The customer’s order number and checkout email are shown on successful checkout and can also be used in **Track an order**.
- In the Orders tab, update fulfilment to Processing, Shipped, or Delivered and add a carrier and tracking reference. The tracking section displays those updates.
- Prices are in INR and delivery is included in the displayed total. The app does not currently send email or SMS notifications and does not connect to a courier API; customers can check progress on the site.

## Hosting notes

Deploy the app behind HTTPS, set the environment variables in the hosting provider, and attach a persistent writable disk for the `data/` directory. This starter uses a local JSON file and in-memory admin sessions, so use a single app instance. For multiple instances or higher order volume, move the store to a managed database and sessions to a shared store before scaling. Keep API secrets on the server and out of the `public/` directory.
