import { createClient } from '@supabase/supabase-js';
import './styles.css';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
const supabase = url && anonKey ? createClient(url, anonKey) : null;
const page = document.body.dataset.page || 'shop';
const CART_KEY = 'kitchenly-guest-cart';

const demoProducts = [
  { id: 'demo-spatula', name: 'The Everyday Spatula', category: 'Tools', description: 'A flexible, heat-safe little helper.', price: 14, emoji: '🥄', color: 'peach', badge: 'BESTSELLER', stock: 42 },
  { id: 'demo-knife', name: 'Sunday Chef Knife', category: 'Prep', description: 'Balanced, sharp, ready for anything.', price: 48, emoji: '🔪', color: 'sage', badge: 'STAFF PICK', stock: 18 },
  { id: 'demo-spoons', name: 'Olivewood Spoon Set', category: 'Tools', description: 'Two smooth spoons made for slow stirring.', price: 26, emoji: '🥢', color: 'butter', badge: '', stock: 31 },
  { id: 'demo-whisk', name: 'Cloud Nine Whisk', category: 'Tools', description: 'Whips cream and pancake batter with ease.', price: 18, emoji: '🥄', color: 'lilac', badge: 'NEW', stock: 24 },
  { id: 'demo-bowls', name: 'Sunday Prep Bowls', category: 'Prep', description: 'A nesting trio for chopping, mixing, serving.', price: 39, emoji: '🥣', color: 'blue', badge: '', stock: 16 },
  { id: 'demo-apron', name: 'The Market Apron', category: 'Textiles', description: 'Soft cotton, generous pockets, less mess.', price: 34, emoji: '🧑‍🍳', color: 'rose', badge: '', stock: 27 },
];

const state = { products: [...demoProducts], cart: {}, user: null, category: 'All', search: '', connected: false, successOrder: null, toastTimer: null };

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Kitchenly could not enable offline app support.', error);
    });
  });
}

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const count = () => Object.values(state.cart).reduce((sum, qty) => sum + qty, 0);
const subtotal = () => Object.entries(state.cart).reduce((sum, [id, qty]) => sum + (Number(state.products.find((p) => p.id === id)?.price || 0) * qty), 0);

function readCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || '{}'); } catch { return {}; } }
function writeCart() { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); }
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3000);
}

function renderHeader() {
  const firstName = (state.user?.user_metadata?.full_name || state.user?.email || 'Account').split(' ')[0];
  document.querySelector('#site-header').innerHTML = `
    <div class="announcement"><span>GOOD TOOLS. GOOD FOOD. GOOD DAYS.</span><span>Free shipping on every order</span></div>
    <div class="nav-wrap"><a class="brand" href="/" aria-label="Kitchenly home"><span class="brand-mark">k.</span><span>kitchenly</span></a>
      <nav class="main-nav"><a href="/#shop">Shop all</a><a href="/#story">Our story</a></nav>
      <div class="nav-actions"><button class="icon-button" data-action="focus-search" aria-label="Search products"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.5"></circle><path d="m16 16 4.2 4.2"></path></svg></button>
      ${state.user ? `<button class="account-button" data-action="sign-out" title="Sign out">${esc(firstName)} <span>↗</span></button>` : `<button class="account-button" data-action="sign-in">Sign in <span>↗</span></button>`}
      <button class="bag-button" data-action="open-cart">Bag <span class="bag-count">${count()}</span></button></div>
    </div>`;
}

function renderFooter() {
  document.querySelector('#site-footer').innerHTML = `<div class="footer-inner"><a class="brand footer-brand" href="/"><span class="brand-mark">k.</span><span>kitchenly</span></a><p>Little tools for the big joy of making.</p><div class="footer-bottom"><span>© 2026 Kitchenly Supply Co.</span><span>Made for your everyday table.</span></div></div>`;
}

function productCard(p) {
  return `<article class="product-card"><div class="product-art art-${esc(p.color || 'sage')}"><div class="art-topline"><span>${esc(p.category)}</span>${p.badge ? `<span class="product-badge">${esc(p.badge)}</span>` : ''}</div><span class="product-emoji" aria-hidden="true">${esc(p.emoji || '🍳')}</span><span class="art-star">✳</span><button class="quick-add" data-add="${esc(p.id)}" ${p.stock === 0 ? 'disabled' : ''}>${p.stock === 0 ? 'Sold out' : 'Add to bag'} <span>+</span></button></div><div class="product-info"><div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p></div><strong>${money(p.price)}</strong></div></article>`;
}

function renderShop() {
  const categories = ['All', ...new Set(state.products.map((p) => p.category))];
  const products = state.products.filter((p) => (state.category === 'All' || p.category === state.category) && (!state.search || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(state.search.toLowerCase())));
  document.querySelector('#app').innerHTML = `
    ${!state.connected ? `<div class="setup-note"><span class="setup-dot"></span>Preview mode — connect Supabase to save carts and orders online. <a href="./README.md">See the beginner setup guide</a></div>` : ''}
    <section class="hero"><div class="hero-copy"><p class="eyebrow">THE LITTLE THINGS MAKE THE MEAL</p><h1>Make room<br />for <em>good</em> food.</h1><p class="hero-description">Thoughtful kitchen tools that feel good in your hand and make the everyday a little more delicious.</p><div class="hero-cta"><a class="button button-dark" href="#shop">Shop the collection <span>↗</span></a><span class="hero-note"><span class="tiny-spark">✳</span>Made to be used, loved, and passed around.</span></div><div class="hero-stats"><div><strong>01</strong><span>Cook with joy</span></div><div><strong>02</strong><span>Keep it for years</span></div><div><strong>03</strong><span>Pass it on</span></div></div></div>
      <div class="hero-image"><div class="image-label"><span>YOUR KITCHEN,<br />A LITTLE HAPPIER.</span><span class="label-stamp">K<br />✳</span></div><img src="https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1400&q=88" alt="A sunlit, welcoming home kitchen" /><div class="hero-image-caption">A good meal starts with the little things.</div></div><span class="hero-decoration">✳</span></section>
    <section class="shop-section" id="shop"><div class="section-heading"><div><p class="eyebrow">THE KITCHENLY EDIT</p><h2>Useful things.<br /><em>Beautifully</em> made.</h2></div><p>Keep the tools you reach for every day.<br />We made the choosing part easy.</p></div>
      <div class="shop-toolbar"><div class="category-filters">${categories.map((c) => `<button class="filter-chip ${state.category === c ? 'active' : ''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</div><label class="search-field"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.5"></circle><path d="m16 16 4.2 4.2"></path></svg><input id="product-search" type="search" placeholder="Find your new favorite" value="${esc(state.search)}" aria-label="Search products" /></label></div>
      <div class="product-grid">${products.length ? products.map(productCard).join('') : `<div class="empty-search"><span>⌕</span><p>No tools found. Try another search.</p></div>`}</div></section>
    <section class="story-band" id="story"><div class="story-icon">✳</div><p class="eyebrow">LESS FUSS, MORE FLAVOR</p><h2>Good design belongs<br />in the <em>everyday.</em></h2><p>We pick honest materials, useful details, and shapes that earn their place on your counter. No special occasion required.</p><a href="#shop" class="text-link">Find your everyday favorite <span>↗</span></a><span class="story-squiggle">〰</span></section>
    <section class="promise-row"><div><span class="promise-icon">♧</span><strong>Made for daily use</strong><span>Tools that work hard and clean up easy.</span></div><div><span class="promise-icon">♡</span><strong>Thoughtful by design</strong><span>Useful details, nothing extra.</span></div><div><span class="promise-icon">✳</span><strong>Here to help</strong><span>A real person when you need one.</span></div></section>`;
}

function renderDrawer() {
  const rows = Object.entries(state.cart).map(([id, qty]) => {
    const p = state.products.find((item) => item.id === id);
    if (!p) return '';
    return `<div class="drawer-item"><span class="drawer-emoji">${esc(p.emoji || '🍳')}</span><div class="drawer-product"><strong>${esc(p.name)}</strong><span>${money(p.price)}</span><div class="quantity-control"><button data-quantity="${esc(id)}" data-delta="-1" aria-label="Remove one">−</button><span>${qty}</span><button data-quantity="${esc(id)}" data-delta="1" aria-label="Add one">+</button></div></div><strong>${money(Number(p.price) * qty)}</strong></div>`;
  }).join('');
  document.querySelector('#cart-drawer').innerHTML = `<div class="drawer-scrim" data-action="close-cart"></div><div class="drawer-panel"><div class="drawer-head"><div><p class="eyebrow">YOUR KITCHENLY EDIT</p><h2>Your bag <span>(${count()})</span></h2></div><button class="close-button" data-action="close-cart" aria-label="Close bag">×</button></div>${count() ? `<div class="drawer-items">${rows}</div><div class="drawer-summary"><div><span>Subtotal</span><strong>${money(subtotal())}</strong></div><p>Shipping is on us for every order.</p><a class="button button-dark full-button" href="/checkout.html">Go to checkout <span>↗</span></a></div>` : `<div class="drawer-empty"><span>🥄</span><h3>Your bag is taking a little break.</h3><p>Let's find it something useful.</p><button class="button button-dark" data-action="close-cart">Keep browsing</button></div>`}</div>`;
}

function renderCheckout() {
  const items = Object.entries(state.cart).map(([id, qty]) => ({ p: state.products.find((product) => product.id === id), qty })).filter((row) => row.p);
  const orderRows = items.map(({ p, qty }) => `<div class="checkout-item"><span class="checkout-item-art">${esc(p.emoji || '🍳')}<small>${qty}</small></span><span class="checkout-item-name">${esc(p.name)}<small>${qty} × ${money(p.price)}</small></span><strong>${money(Number(p.price) * qty)}</strong></div>`).join('');
  const login = state.user ? '' : `<div class="login-callout"><div class="google-mark">G</div><div><strong>Sign in to continue</strong><p>Google sign-in keeps your basket and order connected to you.</p></div><button class="button button-outline" data-action="sign-in">Continue with Google <span>↗</span></button></div>`;
  document.querySelector('#app').innerHTML = `
    ${!state.connected ? `<div class="setup-note"><span class="setup-dot"></span>Preview mode — add your Supabase settings to enable sign-in and order saving. <a href="./README.md">Open setup guide</a></div>` : ''}
    <section class="checkout-page"><div class="checkout-top"><a href="/" class="back-link">← Continue shopping</a><p class="eyebrow">A FEW DETAILS, THEN DINNER.</p><h1>Checkout<span>.</span></h1><div class="checkout-steps"><span class="step-active"><b>1</b> Your details</span><i></i><span><b>2</b> Order placed</span></div></div>
      ${state.successOrder ? `<div class="success-card"><span class="success-icon">✓</span><p class="eyebrow">THAT'S A WRAP</p><h2>Your order is in.</h2><p>Order <strong>${esc(state.successOrder)}</strong> has been saved. Thanks for making room for good food.</p><a class="button button-dark" href="/">Back to the shop <span>↗</span></a></div>` : `<div class="checkout-layout"><div class="checkout-form-column">${login}${!state.user && state.connected ? `<div class="form-locked">↗ Sign in with Google to enter your delivery details and place your order.</div>` : ''}
      <form id="checkout-form" class="checkout-form ${state.user ? '' : 'form-disabled'}"><div class="form-heading"><span class="number-bubble">01</span><div><h2>Delivery details</h2><p>Where should we send your new favorites?</p></div></div>
      <div class="form-grid"><label class="field full"><span>Full name</span><input name="customer_name" autocomplete="name" placeholder="Your name" required ${state.user ? '' : 'disabled'} /></label><label class="field"><span>Email address</span><input type="email" value="${esc(state.user?.email || '')}" readonly disabled="true" /></label><label class="field"><span>Phone number</span><input name="phone" type="tel" autocomplete="tel" placeholder="Your phone number" required ${state.user ? '' : 'disabled'} /></label><label class="field full"><span>Street address</span><input name="address" autocomplete="street-address" placeholder="House number and street" required ${state.user ? '' : 'disabled'} /></label><label class="field full"><span>City</span><input name="city" autocomplete="address-level2" placeholder="Your city" required ${state.user ? '' : 'disabled'} /></label><label class="field full"><span>Delivery note <small>optional</small></span><textarea name="note" rows="3" placeholder="Gate code, directions, or a kind hello" ${state.user ? '' : 'disabled'}></textarea></label></div>
      <div class="payment-choice"><span class="number-bubble">02</span><div><h2>Payment</h2><p>Pay when your order arrives.</p><label class="radio-card"><input type="radio" name="payment_method" value="cash_on_delivery" checked ${state.user ? '' : 'disabled'} /><span class="radio-dot"></span><span><strong>Cash on delivery</strong><small>Payment is collected at delivery.</small></span><span class="payment-icon">▣</span></label></div></div>
      <button class="button button-dark place-order-button" type="submit" ${state.user && items.length && state.connected ? '' : 'disabled'}>Place my order <span>↗</span></button><p class="secure-note">By placing your order, you agree to our friendly shop terms.</p></form></div>
      <aside class="order-summary"><div class="summary-title"><h2>Your order</h2><a href="/" class="edit-bag">Edit bag</a></div>${items.length ? `<div class="checkout-items">${orderRows}</div><div class="summary-totals"><div><span>Subtotal</span><strong>${money(subtotal())}</strong></div><div><span>Shipping</span><strong class="free-shipping">FREE</strong></div><div class="summary-total"><span>Total</span><strong>${money(subtotal())}</strong></div></div><p class="summary-footnote">Shipping is on us for every order.</p>` : `<div class="empty-checkout"><span>🥣</span><h3>Your bag is empty.</h3><p>Pick out something useful for your kitchen first.</p><a class="button button-outline" href="/">Browse the shop</a></div>`}<div class="summary-reassurance"><span>✳</span><p><strong>Good tools, good choice.</strong><br />Need a hand? We're here to help.</p></div></aside></div>`}
    </section>`;
}

function render() { renderHeader(); renderFooter(); page === 'checkout' ? renderCheckout() : renderShop(); renderDrawer(); }

async function loadProducts() {
  if (!supabase) return;
  const { data, error } = await supabase.from('products').select('id,name,category,description,price,emoji,color,badge,stock').eq('is_active', true).order('sort_order');
  if (error) { console.error('Product load error:', error.message); toast('Could not load the product database. Check the setup guide.'); return; }
  state.products = data || [];
  state.connected = true;
}

async function saveCart() {
  if (!supabase) { writeCart(); return; }
  if (!state.user) return;
  const rows = Object.entries(state.cart).map(([product_id, quantity]) => ({ user_id: state.user.id, product_id, quantity }));
  if (rows.length) {
    const { error } = await supabase.from('cart_items').upsert(rows, { onConflict: 'user_id,product_id' });
    if (error) { console.error('Cart save error:', error.message); toast('Your bag could not be saved online.'); return; }
  }
  const keep = new Set(rows.map((row) => row.product_id));
  const { data: existing, error: readError } = await supabase.from('cart_items').select('product_id').eq('user_id', state.user.id);
  if (readError) { console.error('Cart cleanup error:', readError.message); return; }
  const staleIds = (existing || []).map((row) => row.product_id).filter((id) => !keep.has(id));
  for (const id of staleIds) {
    const { error } = await supabase.from('cart_items').delete().eq('user_id', state.user.id).eq('product_id', id);
    if (error) { console.error('Cart cleanup error:', error.message); break; }
  }
}

async function loadCart() {
  if (!supabase) { state.cart = readCart(); return; }
  state.cart = {};
  if (!state.user) return;
  const { data, error } = await supabase.from('cart_items').select('product_id,quantity').eq('user_id', state.user.id);
  if (error) { console.error('Cart load error:', error.message); return; }
  const saved = Object.fromEntries((data || []).map((row) => [row.product_id, row.quantity]));
  state.cart = Object.fromEntries(Object.entries(saved).flatMap(([id, qty]) => {
    const product = state.products.find((p) => p.id === id);
    const safeQty = Math.min(Number(qty) || 0, Number(product?.stock) || 0);
    return product && safeQty > 0 ? [[id, safeQty]] : [];
  }));
  await saveCart();
}

async function setQuantity(id, amount) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  const stock = Number(product.stock);
  const qty = Math.min(Math.max(amount, 0), Number.isFinite(stock) ? stock : 99);
  if (qty) state.cart[id] = qty; else delete state.cart[id];
  await saveCart();
  render();
}

async function signIn() {
  if (!supabase) { toast('Add your Supabase settings first. The setup guide walks you through it.'); return; }
  const redirectTo = `${window.location.origin}${page === 'checkout' ? '/checkout.html' : '/'}`;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) toast(`Google sign-in could not start: ${error.message}`);
}

async function placeOrder(event) {
  event.preventDefault();
  if (!supabase || !state.user) { toast('Connect Supabase and sign in before placing an order.'); return; }
  if (!count()) { toast('Your bag is empty. Add something before checking out.'); return; }
  const form = new FormData(event.currentTarget);
  const { data, error } = await supabase.rpc('place_order', {
    p_customer_name: form.get('customer_name'), p_phone: form.get('phone'), p_address: form.get('address'),
    p_city: form.get('city'), p_note: form.get('note') || '', p_payment_method: form.get('payment_method') || 'cash_on_delivery',
  });
  if (error) { console.error('Order error:', error.message); toast(error.message.includes('Not enough stock') ? 'An item just sold out. Please update your bag.' : 'We could not place your order. Please check your details and try again.'); return; }
  state.successOrder = data;
  state.cart = {};
  localStorage.removeItem(CART_KEY);
  await loadProducts();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const add = event.target.closest('[data-add]')?.dataset.add;
  const qty = event.target.closest('[data-quantity]');
  const category = event.target.closest('[data-category]')?.dataset.category;
  if (action === 'sign-in') await signIn();
  if (action === 'sign-out' && supabase) { await supabase.auth.signOut(); }
  if (action === 'open-cart') { document.querySelector('#cart-drawer').classList.add('open'); document.querySelector('#cart-drawer').setAttribute('aria-hidden', 'false'); }
  if (action === 'close-cart') { document.querySelector('#cart-drawer').classList.remove('open'); document.querySelector('#cart-drawer').setAttribute('aria-hidden', 'true'); }
  if (action === 'focus-search') { if (page !== 'shop') window.location.href = '/#shop'; else document.querySelector('#product-search')?.focus(); }
  if (add) {
    if (supabase && !state.user) { toast('Sign in with Google to save a bag in your account.'); await signIn(); return; }
    const p = state.products.find((item) => item.id === add);
    if (p) { await setQuantity(p.id, (state.cart[p.id] || 0) + 1); toast(`${p.name} added to your bag.`); }
  }
  if (qty) await setQuantity(qty.dataset.quantity, (state.cart[qty.dataset.quantity] || 0) + Number(qty.dataset.delta));
  if (category) { state.category = category; renderShop(); }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'product-search') { state.search = event.target.value; renderShop(); const input = document.querySelector('#product-search'); input?.focus(); input?.setSelectionRange(state.search.length, state.search.length); }
});
document.addEventListener('submit', (event) => { if (event.target.id === 'checkout-form') placeOrder(event); });

async function start() {
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    state.user = session?.user || null;
    await loadProducts();
    await loadCart();
    supabase.auth.onAuthStateChange((_event, sessionNow) => {
      state.user = sessionNow?.user || null;
      loadCart().then(render);
    });
  } else state.cart = readCart();
  render();
}
start();
