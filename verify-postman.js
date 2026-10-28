/* eslint-disable no-console */
// Verifies every endpoint in the Postman collection resolves on the running server.
// A 404 with code NOT_FOUND + message "Route not found" means the route is missing.
const c = require('./Vaapsi_Phase1.postman_collection.json');

const BASE = 'http://localhost:4000';
const API = `${BASE}/api/v1`;

const reqs = [];
(function walk(items) {
  for (const it of items) {
    if (it.item) walk(it.item);
    else if (it.request) {
      const raw = (it.request.url && it.request.url.raw) || '';
      reqs.push({ name: it.name, method: it.request.method, raw });
    }
  }
})(c.item);

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password@123' }),
  });
  const j = await r.json();
  return j.data;
}

(async () => {
  const admin = await login('admin@vaapsi.com');

  // Real ids so paths resolve rather than 404-ing on missing records.
  const products = await fetch(`${API}/products`).then((r) => r.json());
  const listings = await fetch(`${API}/listings`).then((r) => r.json());
  const productId = products.data[0].id;
  const listingId = listings.data.length ? listings.data[0].id : 'none';
  const prod = await fetch(`${API}/products/${productId}`).then((r) => r.json());
  const dppSerial = prod.data.dpp ? prod.data.dpp.serialNumber : 'none';

  const vars = {
    '{{baseUrl}}{{apiPrefix}}': API,
    '{{baseUrl}}': BASE,
    '{{productId}}': productId,
    '{{listingId}}': listingId,
    '{{dppSerial}}': dppSerial,
    '{{userId}}': admin.user.id,
    '{{orderId}}': 'someorder',
    '{{ticketId}}': 'someticket',
  };

  let missing = 0;
  let resolved = 0;

  for (const r of reqs) {
    let url = r.raw;
    for (const [k, v] of Object.entries(vars)) url = url.split(k).join(v);

    const res = await fetch(url, {
      method: r.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.accessToken}`,
      },
      // Send an empty body for writes; we only care about routing, not validation.
      ...(r.method === 'GET' || r.method === 'DELETE' ? {} : { body: '{}' }),
    });

    let j = null;
    try { j = await res.json(); } catch { /* ignore */ }
    const routeMissing = res.status === 404 && j && j.error && j.error.message === 'Route not found';

    if (routeMissing) {
      missing++;
      console.log(`  ❌ ROUTE MISSING: ${r.method} ${url.replace(API, '')}  (${r.name})`);
    } else {
      resolved++;
    }
  }

  console.log('\n' + '='.repeat(55));
  console.log(`Postman endpoints checked: ${reqs.length}`);
  console.log(`Resolved to a real route:  ${resolved}`);
  console.log(`Missing routes:            ${missing}`);
  console.log('='.repeat(55));
  process.exit(missing > 0 ? 1 : 0);
})();
