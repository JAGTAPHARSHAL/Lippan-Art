const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Node does not load .env files by default; keep the project dependency-free.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 3000);
const COOKIE = 'lippan_studio';
const sessions = new Map();
const loginAttempts = new Map();
const money = n => Math.round(Number(n) * 100);
const uid = prefix => `${prefix}_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

const starterProducts = [
  { id: 'lotus-moon', name: 'Lotus Moon Mirrorwork', category: 'Wall art', price: 4850, description: 'A hand-modelled lotus, tiny mirrors and warm ivory detailing on a terracotta ground.', dimensions: '30 cm · round', image: '/art/lotus.svg', active: true },
  { id: 'desert-sun', name: 'Desert Sun Mandala', category: 'Wall art', price: 6200, description: 'A sunburst inspired by the courtyards and pale sands of Kutch.', dimensions: '38 cm · round', image: '/art/sun.svg', active: true },
  { id: 'peacock-pair', name: 'Peacock Pair', category: 'Wall art', price: 7900, description: 'Two mirrored mor birds framed by a rhythm of hand-placed mirrorwork.', dimensions: '42 × 32 cm', image: '/art/peacock.svg', active: true },
  { id: 'little-lotus', name: 'Little Lotus', category: 'Small treasures', price: 2450, description: 'A petite statement for a reading nook, altar or a thoughtful housewarming gift.', dimensions: '20 cm · round', image: '/art/little-lotus.svg', active: true }
];

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = { products: starterProducts, orders: [], processedWebhooks: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { products: starterProducts, orders: [], processedWebhooks: [] }; }
}
let db = loadDb();
function saveDb() {
  const temp = `${DB_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_PATH);
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function getSession(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  return true;
}
function admin(req, res) {
  if (getSession(req)) return true;
  send(res, 401, { error: 'Please sign in to the studio.' }); return false;
}
async function body(req, limit = 4_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Request is too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function json(req, limit) { return JSON.parse((await body(req, limit)).toString('utf8') || '{}'); }
function publicProduct(p) { const { id, name, category, price, description, dimensions, image, active } = p; return { id, name, category, price, description, dimensions, image, active }; }
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function fail(res, error, status = 400) { send(res, status, { error: error.message || 'Something went wrong.' }); }
function verifyHmac(message, secret, signature) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return safeEqual(expected, signature);
}
function cleanText(value, max = 200) { return String(value ?? '').trim().slice(0, max); }

async function api(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/products') return send(res, 200, { products: db.products.filter(x => x.active).map(publicProduct) });
  if (req.method === 'POST' && p === '/api/admin/login') {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) return send(res, 503, { error: 'Set ADMIN_PASSWORD (at least 12 characters) in .env to enable the studio.' });
    const address = req.socket.remoteAddress || 'unknown';
    const attempts = loginAttempts.get(address) || { count: 0, until: 0 };
    if (attempts.until > Date.now()) return send(res, 429, { error: 'Too many sign-in attempts. Please wait a little and try again.' });
    const input = await json(req, 10_000);
    if (!safeEqual(input.password || '', process.env.ADMIN_PASSWORD)) {
      attempts.count += 1;
      if (attempts.count >= 8) { attempts.count = 0; attempts.until = Date.now() + 15 * 60 * 1000; }
      loginAttempts.set(address, attempts);
      return send(res, 401, { error: 'That password did not match.' });
    }
    loginAttempts.delete(address);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' || process.env.PUBLIC_URL?.startsWith('https://') ? '; Secure' : ''}` });
  }
  if (req.method === 'POST' && p === '/api/admin/logout') {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (token) sessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }
  if (req.method === 'GET' && p === '/api/admin/session') return send(res, 200, { authenticated: getSession(req), enabled: Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12) });
  if (p.startsWith('/api/admin/')) {
    if (!admin(req, res)) return;
    if (!sameOrigin(req)) return send(res, 403, { error: 'Request origin did not match this site.' });
    if (req.method === 'GET' && p === '/api/admin/products') return send(res, 200, { products: db.products.map(publicProduct) });
    if (req.method === 'GET' && p === '/api/admin/orders') return send(res, 200, { orders: db.orders });
    if (req.method === 'POST' && p === '/api/admin/products') {
      const x = await json(req, 4_000_000);
      const product = validateProduct(x, null);
      db.products.unshift(product); saveDb(); return send(res, 201, { product });
    }
    const itemRoute = p.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (itemRoute && req.method === 'PUT') {
      const i = db.products.findIndex(x => x.id === itemRoute[1]); if (i < 0) return send(res, 404, { error: 'Piece not found.' });
      db.products[i] = validateProduct(await json(req, 4_000_000), db.products[i]); saveDb(); return send(res, 200, { product: db.products[i] });
    }
    if (itemRoute && req.method === 'DELETE') {
      const product = db.products.find(x => x.id === itemRoute[1]); if (!product) return send(res, 404, { error: 'Piece not found.' });
      product.active = false; saveDb(); return send(res, 200, { ok: true });
    }
    const orderRoute = p.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (orderRoute && req.method === 'PATCH') {
      const order = db.orders.find(x => x.id === orderRoute[1]); if (!order) return send(res, 404, { error: 'Order not found.' });
      const x = await json(req, 20_000);
      if (!['processing', 'shipped', 'delivered', 'cancelled'].includes(x.status)) return send(res, 400, { error: 'Choose a valid fulfilment status.' });
      order.status = x.status; order.trackingNumber = cleanText(x.trackingNumber, 100); order.carrier = cleanText(x.carrier, 80); order.updatedAt = new Date().toISOString(); saveDb(); return send(res, 200, { order });
    }
    return send(res, 404, { error: 'Studio route not found.' });
  }
  if (req.method === 'POST' && p === '/api/checkout') {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return send(res, 503, { error: 'Online checkout is not connected yet. Add your Razorpay test or live keys to .env.' });
    const x = await json(req, 40_000);
    const customer = { name: cleanText(x.name, 100), email: cleanText(x.email, 180).toLowerCase(), phone: cleanText(x.phone, 30), address: cleanText(x.address, 220), city: cleanText(x.city, 80), state: cleanText(x.state, 80), pincode: cleanText(x.pincode, 12) };
    if (!customer.name || !/^\S+@\S+\.\S+$/.test(customer.email) || !customer.phone || !customer.address || !customer.city || !customer.pincode) return send(res, 400, { error: 'Please complete your name, email, phone and delivery address.' });
    if (!Array.isArray(x.items) || !x.items.length || x.items.length > 30) return send(res, 400, { error: 'Your basket is empty.' });
    const items = [];
    for (const line of x.items) {
      const product = db.products.find(v => v.id === cleanText(line.id, 80) && v.active);
      const quantity = Math.max(1, Math.min(10, Number.parseInt(line.quantity, 10) || 1));
      if (!product) return send(res, 400, { error: 'A piece in your basket is no longer available. Please refresh your basket.' });
      items.push({ productId: product.id, name: product.name, quantity, unitPrice: product.price, lineTotal: product.price * quantity });
    }
    const total = items.reduce((n, x) => n + x.lineTotal, 0);
    if (total <= 0 || total > 1_000_000) return send(res, 400, { error: 'This basket total is outside the supported checkout range.' });
    const order = { id: uid('LIP'), status: 'awaiting_payment', paymentStatus: 'pending', paymentId: '', razorpayOrderId: '', customer, items, total, currency: 'INR', trackingNumber: '', carrier: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const upstream = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: money(total), currency: 'INR', receipt: order.id, notes: { store_order_id: order.id } }) });
    const result = await upstream.json();
    if (!upstream.ok) return send(res, 502, { error: result.error?.description || 'Payment provider could not start checkout. Please try again.' });
    order.razorpayOrderId = result.id; db.orders.unshift(order); saveDb();
    return send(res, 201, { orderId: order.id, razorpayOrderId: result.id, keyId: process.env.RAZORPAY_KEY_ID, amount: result.amount, currency: result.currency, name: 'Mitti & Mirror', description: 'Handmade Lippan art', customer: { name: customer.name, email: customer.email, contact: customer.phone } });
  }
  if (req.method === 'POST' && p === '/api/payment/verify') {
    const x = await json(req, 20_000);
    const order = db.orders.find(o => o.id === cleanText(x.orderId, 80));
    if (!order || order.razorpayOrderId !== x.razorpay_order_id) return send(res, 400, { error: 'Checkout could not be matched to an order.' });
    if (!verifyHmac(`${order.razorpayOrderId}|${x.razorpay_payment_id}`, process.env.RAZORPAY_KEY_SECRET, x.razorpay_signature)) return send(res, 400, { error: 'Payment confirmation could not be verified.' });
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(cleanText(x.razorpay_payment_id, 100))}`, { headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` } });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok || payment.order_id !== order.razorpayOrderId || payment.amount !== money(order.total) || payment.currency !== 'INR') return send(res, 400, { error: 'The payment details did not match this order.' });
    order.paymentId = payment.id;
    if (payment.status === 'captured') { order.paymentStatus = 'paid'; order.status = 'processing'; }
    else { order.paymentStatus = payment.status === 'failed' ? 'failed' : 'pending'; }
    order.updatedAt = new Date().toISOString(); saveDb();
    return send(res, 200, { ok: true, pending: payment.status !== 'captured', orderId: order.id });
  }
  if (req.method === 'POST' && p === '/api/webhooks/razorpay') {
    const raw = await body(req, 1_000_000);
    if (!verifyHmac(raw, process.env.RAZORPAY_WEBHOOK_SECRET, req.headers['x-razorpay-signature'])) return send(res, 400, { error: 'Invalid webhook signature.' });
    const eventId = req.headers['x-razorpay-event-id'];
    if (eventId && db.processedWebhooks.includes(eventId)) return send(res, 200, { ok: true });
    const event = JSON.parse(raw.toString('utf8'));
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const entity = event.payload?.payment?.entity || event.payload?.order?.entity;
      const order = db.orders.find(o => o.razorpayOrderId === entity?.order_id || o.razorpayOrderId === entity?.id);
      if (order) { order.paymentStatus = 'paid'; order.paymentId = entity?.id || order.paymentId; if (order.status === 'awaiting_payment') order.status = 'processing'; order.updatedAt = new Date().toISOString(); }
    }
    if (event.event === 'payment.failed') {
      const entity = event.payload?.payment?.entity; const order = db.orders.find(o => o.razorpayOrderId === entity?.order_id);
      if (order && order.paymentStatus !== 'paid') { order.paymentStatus = 'failed'; order.updatedAt = new Date().toISOString(); }
    }
    if (eventId) db.processedWebhooks.push(eventId);
    db.processedWebhooks = db.processedWebhooks.slice(-1000); saveDb(); return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/track') {
    const x = await json(req, 10_000); const id = cleanText(x.orderId, 80).toUpperCase(); const email = cleanText(x.email, 180).toLowerCase();
    const order = db.orders.find(o => o.id === id && o.customer.email === email);
    if (!order) return send(res, 404, { error: 'We could not find an order with those details.' });
    return send(res, 200, { order: { id: order.id, status: order.status, paymentStatus: order.paymentStatus, items: order.items, total: order.total, currency: order.currency, trackingNumber: order.trackingNumber, carrier: order.carrier, createdAt: order.createdAt, updatedAt: order.updatedAt } });
  }
  return send(res, 404, { error: 'API route not found.' });
}
function validateProduct(x, previous) {
  const name = cleanText(x.name, 100); const description = cleanText(x.description, 600); const category = cleanText(x.category || 'Wall art', 60); const dimensions = cleanText(x.dimensions, 80); const price = Math.round(Number(x.price));
  let image = String(x.image || '').trim();
  if (image.startsWith('data:')) {
    if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z\d+/=]+$/i.test(image) || image.length > 3_600_000) throw new Error('Use a PNG, JPG, WEBP or SVG image under 2.5 MB.');
  } else if (!image.startsWith('/') || image.startsWith('//') || image.includes('..')) throw new Error('Choose a product image.');
  if (!name || !description || !Number.isFinite(price) || price < 1 || price > 1_000_000 || !image) throw new Error('Add a name, description, image and valid price.');
  return { id: previous?.id || uid('ART'), name, description, category, dimensions, price, image, active: x.active !== false };
}

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-src https://api.razorpay.com https://checkout.razorpay.com; base-uri 'self'; form-action 'self' https://api.razorpay.com");
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const route = url.pathname === '/studio' || url.pathname === '/studio/' ? '/studio.html' : url.pathname;
    let file = path.resolve(PUBLIC, `.${decodeURIComponent(route === '/' ? '/index.html' : route)}`);
    if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, 'index.html')) return send(res, 403, { error: 'Forbidden.' });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  } catch (err) { if (!res.headersSent) fail(res, err); else res.destroy(); }
});
server.listen(PORT, () => console.log(`Mitti & Mirror is ready at http://localhost:${PORT}`));
