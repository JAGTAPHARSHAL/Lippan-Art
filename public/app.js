const state = { products: [], cart: JSON.parse(localStorage.getItem('mitti-cart') || '[]'), filter: 'All pieces' };
const $ = selector => document.querySelector(selector);
const format = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (message) => { const el = $('#toast'); if (!el) return; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); };
const persistCart = () => { localStorage.setItem('mitti-cart', JSON.stringify(state.cart)); renderCart(); };
const countCart = () => state.cart.reduce((n, x) => n + x.quantity, 0);
const totalCart = () => state.cart.reduce((n, x) => n + x.price * x.quantity, 0);
const productById = id => state.products.find(p => p.id === id);

async function loadProducts() {
  const response = await fetch('/api/products'); const data = await response.json();
  state.products = data.products || []; renderProducts(); renderCart();
}
function renderProducts() {
  const grid = $('#product-grid'); if (!grid) return;
  const products = state.filter === 'All pieces' ? state.products : state.products.filter(x => x.category === state.filter);
  $('#results-count').textContent = `${String(products.length).padStart(2, '0')} PIECES TO KEEP`;
  if (!products.length) { grid.innerHTML = '<div class="empty-products">A new little collection is on its way.</div>'; return; }
  grid.innerHTML = products.map((p, i) => `<article class="product-card"><button class="product-image" data-add="${escapeHtml(p.id)}" aria-label="Add ${escapeHtml(p.name)} to your bag"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy"><span class="add-circle">+</span><span class="piece-tag">${i === 0 ? 'A STUDIO FAVOURITE' : escapeHtml(p.dimensions || p.category)}</span></button><div class="product-meta"><div><h3>${escapeHtml(p.name)}</h3><span>${escapeHtml(p.dimensions || p.category)}</span></div><b>${format(p.price)}</b></div><p class="product-description">${escapeHtml(p.description)}</p><button class="add-link" data-add="${escapeHtml(p.id)}">Add to bag <span>↗</span></button></article>`).join('');
  grid.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addToBag(btn.dataset.add)));
}
function addToBag(id) {
  const product = productById(id); if (!product) return;
  const found = state.cart.find(x => x.id === id);
  if (found) found.quantity = Math.min(found.quantity + 1, 10); else state.cart.push({ id, name: product.name, price: product.price, image: product.image, dimensions: product.dimensions, quantity: 1 });
  persistCart(); toast(`${product.name} was tucked into your bag.`); openBag();
}
function renderCart() {
  const count = $('#bag-count'); if (!count) return;
  count.textContent = countCart(); $('#drawer-count').textContent = `(${countCart()})`; $('#bag-total').textContent = format(totalCart()); $('#checkout-total').textContent = format(totalCart());
  const items = $('#bag-items');
  if (!state.cart.length) { items.innerHTML = '<div class="bag-empty"><span>✳</span><h3>A little room for something lovely.</h3><p>Your bag is waiting to be filled with handmade things.</p><button class="text-link" id="bag-shop">Explore the collection ↗</button></div>'; $('#checkout-open').disabled = true; $('#bag-shop')?.addEventListener('click', () => { closeBag(); location.hash = '#collection'; }); return; }
  $('#checkout-open').disabled = false;
  items.innerHTML = state.cart.map(x => `<article class="bag-item"><img src="${escapeHtml(x.image)}" alt=""><div class="bag-item-info"><h3>${escapeHtml(x.name)}</h3><span>${escapeHtml(x.dimensions || '')}</span><b>${format(x.price * x.quantity)}</b><div class="quantity"><button data-qty="-1" data-id="${escapeHtml(x.id)}" aria-label="Decrease quantity">−</button><span>${x.quantity}</span><button data-qty="1" data-id="${escapeHtml(x.id)}" aria-label="Increase quantity">+</button></div></div><button class="remove-item" data-remove="${escapeHtml(x.id)}" aria-label="Remove ${escapeHtml(x.name)}">×</button></article>`).join('');
  items.querySelectorAll('[data-qty]').forEach(btn => btn.addEventListener('click', () => { const item = state.cart.find(x => x.id === btn.dataset.id); if (!item) return; item.quantity = Math.max(1, Math.min(10, item.quantity + Number(btn.dataset.qty))); persistCart(); }));
  items.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => { state.cart = state.cart.filter(x => x.id !== btn.dataset.remove); persistCart(); }));
}
function openBag() { $('#bag-drawer').classList.add('open'); $('#bag-drawer').setAttribute('aria-hidden', 'false'); $('#drawer-scrim').classList.add('open'); document.body.classList.add('locked'); }
function closeBag() { $('#bag-drawer').classList.remove('open'); $('#bag-drawer').setAttribute('aria-hidden', 'true'); $('#drawer-scrim').classList.remove('open'); document.body.classList.remove('locked'); }
function openCheckout() { if (!state.cart.length) return; closeBag(); $('#checkout-scrim').classList.add('open'); document.body.classList.add('locked'); }
function closeCheckout() { $('#checkout-scrim').classList.remove('open'); document.body.classList.remove('locked'); }
function setMessage(node, text, bad = false) { node.textContent = text; node.classList.toggle('error', bad); }

async function trackOrder(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const msg = $('#track-message'); const result = $('#track-result'); result.innerHTML = ''; setMessage(msg, 'Looking for your order…');
  try {
    const response = await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: form.get('orderId'), email: form.get('email') }) }); const data = await response.json();
    if (!response.ok) throw new Error(data.error); setMessage(msg, 'Your order is right here.');
    const o = data.order; const steps = ['processing', 'shipped', 'delivered']; const current = steps.indexOf(o.status);
    result.innerHTML = `<div class="tracking-card"><div class="tracking-top"><div><span class="tracking-label">ORDER</span><b>${escapeHtml(o.id)}</b></div><span class="status-pill ${escapeHtml(o.status)}">${escapeHtml(o.status.replace('_', ' '))}</span></div><div class="tracking-steps">${steps.map((s, i) => `<div class="tracking-step ${i <= current ? 'done' : ''}"><span>${i < current ? '✓' : i + 1}</span><b>${s}</b></div>`).join('')}</div><div class="tracking-bottom"><span>${o.paymentStatus === 'paid' ? 'Payment received' : o.paymentStatus === 'failed' ? 'Payment needs attention' : 'Payment processing'}</span>${o.trackingNumber ? `<span>${escapeHtml(o.carrier || 'Tracking')}: <b>${escapeHtml(o.trackingNumber)}</b></span>` : '<span>We’ll add a carrier reference once it ships.</span>'}</div><div class="tracking-items">${o.items.map(x => `<span>${escapeHtml(x.name)} × ${x.quantity}</span>`).join('')}<b>${format(o.total)}</b></div></div>`;
  } catch (err) { setMessage(msg, err.message, true); }
}
async function beginPayment(event) {
  event.preventDefault(); const checkoutForm = event.currentTarget; const submit = checkoutForm.querySelector('button[type="submit"]'); const msg = $('#checkout-message'); submit.disabled = true; setMessage(msg, 'Preparing your secure checkout…');
  try {
    const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries()); payload.items = state.cart.map(x => ({ id: x.id, quantity: x.quantity }));
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    if (!window.Razorpay) { await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = resolve; script.onerror = () => reject(new Error('Secure checkout could not load. Please try again.')); document.head.appendChild(script); }); }
    const checkout = new Razorpay({ key: data.keyId, amount: data.amount, currency: data.currency, name: data.name, description: data.description, order_id: data.razorpayOrderId, prefill: data.customer, theme: { color: '#9d452f' }, modal: { ondismiss: () => { submit.disabled = false; setMessage(msg, 'Checkout closed. Your basket is still here.'); } }, handler: async result => {
      try { const verified = await fetch('/api/payment/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: data.orderId, ...result }) }); const confirmation = await verified.json(); if (!verified.ok) throw new Error(confirmation.error); state.cart = []; persistCart(); closeCheckout(); checkoutForm.reset(); toast(confirmation.pending ? `Payment is being confirmed. Your order is ${confirmation.orderId}.` : `Payment received. Your order is ${confirmation.orderId}.`); location.hash = '#track'; $('#track-form [name="orderId"]').value = confirmation.orderId; $('#track-form [name="email"]').value = payload.email; $('#track-form').requestSubmit(); } catch (error) { setMessage(msg, error.message || 'Payment was received but confirmation is delayed. Use your order number to track it.', true); }
    } }); checkout.on('payment.failed', info => { submit.disabled = false; setMessage(msg, info.error?.description || 'Payment did not go through. Please try again.', true); }); checkout.open(); setMessage(msg, '');
  } catch (err) { setMessage(msg, err.message, true); submit.disabled = false; }
}

function initShop() {
  $('#year').textContent = new Date().getFullYear(); $('#bag-open').addEventListener('click', openBag); $('#bag-close').addEventListener('click', closeBag); $('#drawer-scrim').addEventListener('click', closeBag);
  $('#checkout-open').addEventListener('click', openCheckout); $('#checkout-close').addEventListener('click', closeCheckout); $('#checkout-scrim').addEventListener('click', e => { if (e.target.id === 'checkout-scrim') closeCheckout(); });
  $('#checkout-form').addEventListener('submit', beginPayment); $('#track-form').addEventListener('submit', trackOrder);
  $('#filters').querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => { state.filter = btn.dataset.filter; $('#filters').querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === btn)); renderProducts(); }));
  $('#menu-toggle').addEventListener('click', () => document.querySelector('.main-nav').classList.toggle('show'));
  document.querySelectorAll('.main-nav a').forEach(a => a.addEventListener('click', () => document.querySelector('.main-nav').classList.remove('show')));
  loadProducts().catch(() => { $('#product-grid').innerHTML = '<div class="empty-products">The studio shelf is taking a moment to load. Please refresh in a little while.</div>'; });
}

const studioState = { products: [], orders: [] };
function moneyInput(v) { return Math.max(0, Math.round(Number(v) || 0)); }
async function apiCall(url, options = {}) { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not complete that action.'); return data; }
function studioLogin() {
  const app = $('#studio-app'); app.innerHTML = `<div class="studio-login-shell"><a class="brand" href="/"><span class="brand-mark">मि</span><span class="brand-copy"><strong>Mitti <i>&</i> Mirror</strong><small>THE ART OF LIPPAN</small></span></a><div class="studio-login-card"><p class="eyebrow">THE BACK ROOM</p><h1>Welcome to<br><em>your studio.</em></h1><p>Sign in to add new pieces, update prices and follow every order.</p><form id="login-form"><label>STUDIO PASSWORD<input type="password" name="password" autocomplete="current-password" required></label><button class="button button-dark" type="submit">Enter the studio <span>↗</span></button><p id="login-message" class="form-message" aria-live="polite"></p></form><a class="studio-return" href="/">← Return to the shop</a></div></div>`;
  $('#login-form').addEventListener('submit', async e => { e.preventDefault(); const message = $('#login-message'); try { const data = await apiCall('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: new FormData(e.currentTarget).get('password') }) }); if (data.ok) renderStudio(); } catch (err) { setMessage(message, err.message, true); } });
}
function renderStudio() {
  const app = $('#studio-app');
  app.innerHTML = `<div class="studio-topbar"><a class="brand" href="/"><span class="brand-mark">मि</span><span class="brand-copy"><strong>Mitti <i>&</i> Mirror</strong><small>THE ART OF LIPPAN</small></span></a><div><a href="/">View shop ↗</a><button id="studio-logout">Sign out</button></div></div><main class="studio-main"><div class="studio-welcome"><div><p class="eyebrow">YOUR LITTLE CORNER OF KUTCH</p><h1>Good things are<br><em>taking shape.</em></h1><p>Keep your collection current and your customers in the loop.</p></div><div class="studio-seal">✳<small>MITTI<br>& MIRROR</small></div></div><div class="studio-tabs"><button class="studio-tab active" data-stab="pieces">The pieces <span id="studio-piece-count">0</span></button><button class="studio-tab" data-stab="orders">Orders <span id="studio-order-count">0</span></button><button class="studio-add-button" id="new-piece">+ Add a new piece</button></div><section id="studio-content"></section></main>`;
  $('#studio-logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); studioLogin(); });
  $('#new-piece').addEventListener('click', () => productEditor());
  document.querySelectorAll('[data-stab]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-stab]').forEach(x => x.classList.toggle('active', x === btn)); $('#new-piece').classList.toggle('hidden', btn.dataset.stab !== 'pieces'); btn.dataset.stab === 'pieces' ? renderStudioProducts() : renderStudioOrders(); }));
  refreshStudio();
}
async function refreshStudio() { try { const [p, o] = await Promise.all([apiCall('/api/admin/products'), apiCall('/api/admin/orders')]); studioState.products = p.products; studioState.orders = o.orders; $('#studio-piece-count').textContent = studioState.products.filter(x => x.active).length; $('#studio-order-count').textContent = studioState.orders.length; renderStudioProducts(); } catch (err) { $('#studio-content').innerHTML = `<p class="form-message error">${escapeHtml(err.message)}</p>`; } }
function renderStudioProducts() {
  const products = studioState.products.filter(x => x.active); const content = $('#studio-content'); if (!content) return;
  content.innerHTML = products.length ? `<div class="studio-product-list">${products.map(p => `<article class="studio-product"><img src="${escapeHtml(p.image)}" alt=""><div class="studio-product-copy"><span>${escapeHtml(p.category)} · ${escapeHtml(p.dimensions)}</span><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p></div><b>${format(p.price)}</b><button class="studio-edit" data-edit="${escapeHtml(p.id)}">Edit</button><button class="studio-remove" data-remove-product="${escapeHtml(p.id)}" aria-label="Archive ${escapeHtml(p.name)}">×</button></article>`).join('')}</div>` : `<div class="studio-empty"><span>✳</span><h2>Your shelf is ready for its first piece.</h2><p>Add a photograph, a name and your price to begin.</p><button class="button button-dark" id="first-piece">Add your first piece ↗</button></div>`;
  content.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => productEditor(studioState.products.find(x => x.id === b.dataset.edit))));
  content.querySelectorAll('[data-remove-product]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Remove this piece from the shop?')) return; try { await apiCall(`/api/admin/products/${b.dataset.removeProduct}`, { method: 'DELETE' }); toast('Piece removed from the shop.'); refreshStudio(); } catch (e) { toast(e.message); } }));
  $('#first-piece')?.addEventListener('click', () => productEditor());
}
function productEditor(product = null) {
  const content = $('#studio-content');
  content.innerHTML = `<form id="product-form" class="product-editor"><div class="editor-heading"><div><p class="eyebrow">${product ? 'A FEW THOUGHTFUL DETAILS' : 'A NEW PIECE FOR THE SHELF'}</p><h2>${product ? 'Give it a little polish.' : 'Add something lovely.'}</h2></div><button type="button" class="editor-cancel" id="editor-cancel">Cancel</button></div><div class="editor-grid"><div class="image-uploader" id="image-uploader"><img id="image-preview" src="${escapeHtml(product?.image || '')}" alt="Preview" class="${product?.image ? 'has-image' : ''}"><div class="upload-prompt"><span>✳</span><b>Add a photograph</b><small>PNG, JPG, WEBP or SVG · up to 2.5 MB</small></div><input id="product-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><input id="product-image" type="hidden" value="${escapeHtml(product?.image || '')}"></div><div class="editor-fields"><label>PIECE NAME<input name="name" value="${escapeHtml(product?.name || '')}" required maxlength="100" placeholder="e.g. Lotus Moon"></label><div class="form-pair"><label>PRICE (₹)<input name="price" inputmode="numeric" type="number" min="1" max="1000000" value="${product?.price || ''}" required></label><label>COLLECTION<select name="category"><option ${product?.category === 'Wall art' ? 'selected' : ''}>Wall art</option><option ${product?.category === 'Small treasures' ? 'selected' : ''}>Small treasures</option></select></label></div><label>SIZE / DIMENSIONS<input name="dimensions" value="${escapeHtml(product?.dimensions || '')}" placeholder="30 cm · round"></label><label>A FEW WORDS ABOUT IT<textarea name="description" rows="4" maxlength="600" required placeholder="What makes this piece special?">${escapeHtml(product?.description || '')}</textarea></label><button class="button button-dark" type="submit">${product ? 'Save changes' : 'Add to collection'} <span>↗</span></button><p id="editor-message" class="form-message"></p></div></div></form>`;
  $('#editor-cancel').addEventListener('click', renderStudioProducts);
  $('#product-image-file').addEventListener('change', e => { const file = e.target.files[0]; if (!file) return; if (file.size > 2_500_000) { setMessage($('#editor-message'), 'Please choose an image under 2.5 MB.', true); return; } const reader = new FileReader(); reader.onload = () => { $('#product-image').value = reader.result; $('#image-preview').src = reader.result; $('#image-preview').classList.add('has-image'); }; reader.readAsDataURL(file); });
  $('#product-form').addEventListener('submit', async e => { e.preventDefault(); const fields = new FormData(e.currentTarget); const payload = Object.fromEntries(fields.entries()); payload.price = moneyInput(payload.price); payload.image = $('#product-image').value; const message = $('#editor-message'); try { await apiCall(product ? `/api/admin/products/${product.id}` : '/api/admin/products', { method: product ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); await refreshStudio(); toast(product ? 'Your changes are on the shelf.' : 'Your new piece is in the collection.'); } catch (err) { setMessage(message, err.message, true); } });
}
function renderStudioOrders() {
  const content = $('#studio-content'); if (!content) return;
  if (!studioState.orders.length) { content.innerHTML = '<div class="studio-empty"><span>✳</span><h2>Your next good thing will find its way here.</h2><p>Orders will appear after a customer checks out.</p></div>'; return; }
  content.innerHTML = `<div class="studio-orders">${studioState.orders.map(o => `<form class="studio-order" data-order="${escapeHtml(o.id)}"><div class="order-main"><div><span class="order-eyebrow">${escapeHtml(new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))} · ${escapeHtml(o.id)}</span><h3>${escapeHtml(o.customer.name)}</h3><a href="mailto:${escapeHtml(o.customer.email)}">${escapeHtml(o.customer.email)}</a><p>${escapeHtml(o.items.map(x => `${x.name} × ${x.quantity}`).join(' · '))}</p><small>${escapeHtml([o.customer.address, o.customer.city, o.customer.state, o.customer.pincode].filter(Boolean).join(', '))}</small></div><div class="order-total"><b>${format(o.total)}</b><span class="status-pill ${escapeHtml(o.status)}">${escapeHtml(o.status.replace('_', ' '))}</span><small>${escapeHtml(o.paymentStatus)}</small></div></div><div class="order-controls"><label>FULFILMENT<select name="status"><option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Processing</option><option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option><option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option><option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option></select></label><label>CARRIER<input name="carrier" value="${escapeHtml(o.carrier)}" placeholder="e.g. India Post"></label><label>TRACKING REFERENCE<input name="trackingNumber" value="${escapeHtml(o.trackingNumber)}" placeholder="Add once shipped"></label><button class="button button-dark" type="submit">Save update ↗</button></div></form>`).join('')}</div>`;
  content.querySelectorAll('.studio-order').forEach(form => form.addEventListener('submit', async e => { e.preventDefault(); const values = new FormData(form); const btn = form.querySelector('button'); btn.disabled = true; try { await apiCall(`/api/admin/orders/${form.dataset.order}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(values.entries())) }); toast('Order update saved.'); refreshStudio(); } catch (err) { toast(err.message); btn.disabled = false; } }));
}
async function initStudio() {
  document.body.classList.add('studio-page'); const app = $('#studio-app');
  try { const session = await apiCall('/api/admin/session'); if (session.authenticated) renderStudio(); else { studioLogin(); if (!session.enabled) setMessage($('#login-message'), 'Add a studio password to .env before signing in.', true); } } catch { studioLogin(); }
}

if ($('#studio-app')) initStudio(); else initShop();
