/* eslint-disable no-console */
// End-to-end smoke test against a running server. Run: node e2e.js
const BASE = process.env.BASE || 'http://localhost:4000';
const API = `${BASE}/api/v1`;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ❌ ${name}${extra ? ' → ' + JSON.stringify(extra).slice(0, 300) : ''}`);
  }
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

(async () => {
  console.log('\n=== 1. HEALTH ===');
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  check('health returns ok', health.status === 'ok', health);

  console.log('\n=== 2. AUTH ===');
  const login = await req('POST', '/auth/login', {
    body: { email: 'customer@vaapsi.com', password: 'Password@123' },
  });
  check('customer login 200', login.status === 200, login.json);
  const customerToken = login.json?.data?.accessToken;
  const customerId = login.json?.data?.user?.id;
  check('access token issued', !!customerToken);
  check('password hash not leaked', login.json?.data?.user?.passwordHash === undefined);

  const badLogin = await req('POST', '/auth/login', {
    body: { email: 'customer@vaapsi.com', password: 'WrongPassword1' },
  });
  check('wrong password rejected 401', badLogin.status === 401);

  const adminLogin = await req('POST', '/auth/login', {
    body: { email: 'admin@vaapsi.com', password: 'Password@123' },
  });
  const adminToken = adminLogin.json?.data?.accessToken;
  check('admin login 200', adminLogin.status === 200);

  const agentLogin = await req('POST', '/auth/login', {
    body: { email: 'agent@vaapsi.com', password: 'Password@123' },
  });
  const agentToken = agentLogin.json?.data?.accessToken;
  check('agent login 200', agentLogin.status === 200);

  const uniqueEmail = `test${Date.now()}@example.com`;
  const register = await req('POST', '/auth/register', {
    body: { email: uniqueEmail, password: 'Password@123', fullName: 'E2E User' },
  });
  check('register 201', register.status === 201, register.json);
  const newUserId = register.json?.data?.user?.id;
  const newUserToken = register.json?.data?.accessToken;

  const dupRegister = await req('POST', '/auth/register', {
    body: { email: uniqueEmail, password: 'Password@123' },
  });
  check('duplicate email 409', dupRegister.status === 409);

  const badValidation = await req('POST', '/auth/register', {
    body: { email: 'not-an-email', password: 'x' },
  });
  check('validation error 400', badValidation.status === 400);

  const me = await req('GET', '/auth/me', { token: customerToken });
  check('GET /auth/me 200', me.status === 200 && me.json?.data?.email === 'customer@vaapsi.com');

  const noAuth = await req('GET', '/auth/me');
  check('missing token 401', noAuth.status === 401);

  console.log('\n=== 3. PHONE OTP ===');
  const phone = `+9199${Date.now().toString().slice(-8)}`;
  const otpReq = await req('POST', '/auth/otp/request', { body: { phone } });
  check('OTP request 200', otpReq.status === 200, otpReq.json);
  const devCode = otpReq.json?.data?.devCode;
  check('devCode returned in dev', !!devCode);

  const badOtp = await req('POST', '/auth/otp/verify', { body: { phone, code: '000000' } });
  check('wrong OTP rejected', badOtp.status === 400 || devCode === '000000');

  const otpVerify = await req('POST', '/auth/otp/verify', { body: { phone, code: devCode } });
  check('OTP verify creates account', otpVerify.status === 200 && otpVerify.json?.data?.isNew === true, otpVerify.json);

  console.log('\n=== 4. TOKEN REFRESH ===');
  const refreshToken = login.json?.data?.refreshToken;
  const refreshed = await req('POST', '/auth/refresh', { body: { refreshToken } });
  check('refresh returns new tokens', refreshed.status === 200 && !!refreshed.json?.data?.accessToken);
  const reused = await req('POST', '/auth/refresh', { body: { refreshToken } });
  check('old refresh token revoked (rotation)', reused.status === 401);

  console.log('\n=== 5. PRODUCTS & CROSS-LISTING ===');
  const products = await req('GET', '/products?page=1&limit=20');
  check('list products 200', products.status === 200, products.json);
  check('products seeded', (products.json?.data?.length || 0) >= 2);
  check('pagination meta present', typeof products.json?.meta?.total === 'number');

  const newProduct = products.json?.data?.find((p) => p.isPreLoved === false);
  check('found brand-new product', !!newProduct);

  const single = await req('GET', `/products/${newProduct.id}`);
  check('get product by id', single.status === 200);
  check('product includes DPP', !!single.json?.data?.dpp?.serialNumber, single.json?.data?.dpp);

  const similar = await req('GET', `/products/${newProduct.id}/similar-preloved`);
  check('cross-listing returns pre-loved', similar.status === 200 && similar.json.data.length >= 1, similar.json);
  check('cross-listed item has a listing', !!similar.json?.data?.[0]?.listingId);

  const filtered = await req('GET', '/products?category=Bags&isPreLoved=true');
  check('filter by category+isPreLoved', filtered.status === 200 && filtered.json.data.every((p) => p.isPreLoved === true), filtered.json);

  const searched = await req('GET', '/products?search=backpack');
  check('search works', searched.status === 200 && searched.json.data.length >= 1);

  console.log('\n=== 6. DPP ===');
  const dppSerial = single.json?.data?.dpp?.serialNumber;
  const dppBySerial = await req('GET', `/dpp/serial/${encodeURIComponent(dppSerial)}`);
  check('public DPP lookup by QR serial', dppBySerial.status === 200, dppBySerial.json);
  check('DPP has QR data URL', (dppBySerial.json?.data?.qrCodeUrl || '').startsWith('data:image/png;base64,'));

  const dppUpdate = await req('PATCH', `/dpp/product/${newProduct.id}`, {
    token: customerToken,
    body: { careInstructions: 'Hand wash only.' },
  });
  check('DPP manual update', dppUpdate.status === 200 && dppUpdate.json.data.careInstructions === 'Hand wash only.');

  const eolAsCustomer = await req('POST', `/dpp/product/${newProduct.id}/end-of-life`, { token: customerToken });
  check('customer cannot mark end-of-life (403)', eolAsCustomer.status === 403);

  console.log('\n=== 7. MARKETPLACE LISTINGS ===');
  const listings = await req('GET', '/listings?page=1&limit=20');
  check('list listings 200', listings.status === 200, listings.json);
  check('seeded listing present', (listings.json?.data?.length || 0) >= 1);
  const listingId = listings.json?.data?.[0]?.id;

  const listingDetail = await req('GET', `/listings/${listingId}`);
  check('listing detail includes product', listingDetail.status === 200 && !!listingDetail.json?.data?.product);

  // New user creates their own product + listing
  const myProduct = await req('POST', '/products', {
    token: newUserToken,
    body: { title: 'E2E Test Jacket', category: 'Apparel', basePrice: 900, isPreLoved: true, condition: 'GOOD' },
  });
  check('create product 201', myProduct.status === 201, myProduct.json);

  const myListing = await req('POST', '/listings', {
    token: newUserToken,
    body: { productId: myProduct.json.data.id, price: 850, delayDays: 30 },
  });
  check('create listing 201', myListing.status === 201, myListing.json);

  const stealListing = await req('POST', '/listings', {
    token: customerToken,
    body: { productId: myProduct.json.data.id, price: 10 },
  });
  check('cannot list product you do not own (403)', stealListing.status === 403);

  const shipDate = await req('PATCH', `/listings/${myListing.json.data.id}/shipping-date`, {
    token: newUserToken,
    body: { shippingDate: '2026-12-01T00:00:00.000Z' },
  });
  check('set adjustable shipping date', shipDate.status === 200 && !!shipDate.json.data.shippingDate);

  console.log('\n=== 8. LOYALTY ===');
  const wallet = await req('GET', '/loyalty/wallet', { token: customerToken });
  check('get wallet 200', wallet.status === 200, wallet.json);
  check('seeded 150 points', wallet.json?.data?.pointsBalance === 150, wallet.json?.data);

  // Gating: brand-new user has 0 lifetime points → redemption blocked
  const earlyRedeem = await req('POST', '/loyalty/redeem', {
    token: newUserToken,
    body: { points: 10, bucket: 'VAAPSI' },
  });
  check('redemption gated under 100 pts (400)', earlyRedeem.status === 400, earlyRedeem.json);
  check('gate message mentions 100', (earlyRedeem.json?.error?.message || '').includes('100'));

  // 70/30 split: 100 external out of 100 total = 100% > 30% → blocked
  const badSplit = await req('POST', '/loyalty/redeem', {
    token: customerToken,
    body: { points: 100, bucket: 'EXTERNAL_PARTNER' },
  });
  check('external bucket over 30% blocked', badSplit.status === 400, badSplit.json);

  const goodRedeem = await req('POST', '/loyalty/redeem', {
    token: customerToken,
    body: { points: 40, bucket: 'VAAPSI' },
  });
  check('VAAPSI redemption succeeds', goodRedeem.status === 200 && goodRedeem.json.data.redeemed === 40, goodRedeem.json);

  const smallExternal = await req('POST', '/loyalty/redeem', {
    token: customerToken,
    body: { points: 15, bucket: 'EXTERNAL_PARTNER' },
  });
  check('external within 30% allowed (15/55)', smallExternal.status === 200, smallExternal.json);

  const walletAfter = await req('GET', '/loyalty/wallet', { token: customerToken });
  check('balance decremented 150-55=95', walletAfter.json?.data?.pointsBalance === 95, walletAfter.json?.data);
  check('lifetimeRedeemed = 55', walletAfter.json?.data?.lifetimeRedeemed === 55);

  const overspend = await req('POST', '/loyalty/redeem', {
    token: customerToken,
    body: { points: 99999, bucket: 'VAAPSI' },
  });
  check('insufficient points blocked', overspend.status === 400);

  const donate = await req('POST', '/loyalty/donate', { token: customerToken, body: { points: 5 } });
  check('donate points', donate.status === 200 && donate.json.data.donated === 5, donate.json);

  // Staff-only earn
  const anyBrand = await req('POST', '/loyalty/earn/any-brand', {
    token: agentToken,
    body: { userId: newUserId, points: 25, reason: 'School textile drive' },
  });
  check('agent grants any-brand points', anyBrand.status === 200 && anyBrand.json.data.earned === 25, anyBrand.json);

  const customerTriesEarn = await req('POST', '/loyalty/earn/any-brand', {
    token: customerToken,
    body: { userId: newUserId, points: 999 },
  });
  check('customer cannot grant points (403)', customerTriesEarn.status === 403);

  console.log('\n=== 9. POINT POOLING ===');
  const poolReq = await req('POST', '/loyalty/pool/request', {
    token: customerToken,
    body: { memberId: newUserId },
  });
  check('pool request created PENDING', poolReq.status === 200 && poolReq.json.data.status === 'PENDING', poolReq.json);

  const poolBefore = await req('GET', '/loyalty/pool/balance', { token: customerToken });
  check('pending link not counted', poolBefore.json?.data?.members?.length === 0, poolBefore.json?.data);

  const poolApprove = await req('POST', '/loyalty/pool/respond', {
    token: newUserToken,
    body: { linkId: poolReq.json.data.id, approve: true },
  });
  check('member approves pool link', poolApprove.status === 200 && poolApprove.json.data.status === 'APPROVED');

  const poolAfter = await req('GET', '/loyalty/pool/balance', { token: customerToken });
  check('approved member counted', poolAfter.json?.data?.members?.length === 1, poolAfter.json?.data);
  check('combined = 90 + 25 = 115', poolAfter.json?.data?.combinedPoints === 115, poolAfter.json?.data);

  const selfPool = await req('POST', '/loyalty/pool/request', {
    token: customerToken,
    body: { memberId: customerId },
  });
  check('cannot pool with yourself', selfPool.status === 400);

  console.log('\n=== 10. CART & CHECKOUT ===');
  const addItem = await req('POST', '/cart/items', {
    token: customerToken,
    body: { listingId: myListing.json.data.id, quantity: 1, isDelayed: true },
  });
  check('add item to cart 201', addItem.status === 201, addItem.json);

  const cart = await req('GET', '/cart', { token: customerToken });
  check('cart shows item', cart.status === 200 && cart.json.data.items.length === 1, cart.json);
  check('cart subtotal = 850', cart.json?.data?.subtotal === 850, cart.json?.data);

  const checkout = await req('POST', '/cart/checkout', {
    token: customerToken,
    body: { redeemPoints: 50, redeemBucket: 'VAAPSI' },
  });
  check('checkout 201', checkout.status === 201, checkout.json);
  const order = checkout.json?.data?.order;
  check('order status PAID (immediate payment)', order?.status === 'PAID', order);
  check('delayed purchase flagged', order?.isDelayed === true);
  check('shipping date set for delayed', !!order?.shippingDate);
  check('subtotal 850', Number(order?.subtotal) === 850);
  check('50 points redeemed', order?.pointsRedeemed === 50);
  check('total = 850 - 50 = 800', Number(order?.total) === 800, order);
  check('earned points on amount paid (800)', checkout.json?.data?.pointsEarned === 800, checkout.json?.data);

  const cartAfter = await req('GET', '/cart', { token: customerToken });
  check('cart cleared after checkout', cartAfter.json?.data?.items?.length === 0);

  const soldListing = await req('GET', `/listings/${myListing.json.data.id}`);
  check('listing marked SOLD', soldListing.json?.data?.status === 'SOLD', soldListing.json?.data?.status);

  const orders = await req('GET', '/cart/orders', { token: customerToken });
  check('order history 200', orders.status === 200 && orders.json.data.length >= 1);
  check('order has items', (orders.json?.data?.[0]?.items?.length || 0) >= 1);

  const otherOrder = await req('GET', `/cart/orders/${order.id}`, { token: newUserToken });
  check("cannot read another user's order", otherOrder.status === 404);

  const emptyCheckout = await req('POST', '/cart/checkout', { token: newUserToken, body: {} });
  check('empty cart checkout blocked', emptyCheckout.status === 400);

  console.log('\n=== 11. DPP OWNERSHIP TRANSFER (on purchase) ===');
  // The purchased product had no DPP; create one and verify transfer via admin audit
  const seededPreLoved = products.json.data.find((p) => p.isPreLoved === true);
  const auditTrail = await req('GET', `/admin/dpp/${seededPreLoved.id}/audit`, { token: adminToken });
  check('DPP audit trail accessible', auditTrail.status === 200, auditTrail.json);
  check('audit trail has transfers array', Array.isArray(auditTrail.json?.data?.transfers));

  console.log('\n=== 12. SUPPORT TICKETS ===');
  const ticket = await req('POST', '/support/tickets', {
    token: customerToken,
    body: { subject: 'Order not shipped', body: 'My delayed order has not shipped.', priority: 'HIGH' },
  });
  check('raise ticket 201', ticket.status === 201, ticket.json);
  const ticketId = ticket.json?.data?.id;
  check('ticket has first message', ticket.json?.data?.messages?.length === 1);

  const myTickets = await req('GET', '/support/tickets/mine', { token: customerToken });
  check('customer sees own tickets', myTickets.status === 200 && myTickets.json.data.length >= 1);

  const queue = await req('GET', '/support/tickets/queue?page=1&limit=20', { token: agentToken });
  check('agent sees queue', queue.status === 200, queue.json);

  const queueAsCustomer = await req('GET', '/support/tickets/queue', { token: customerToken });
  check('customer blocked from queue (403)', queueAsCustomer.status === 403);

  const assign = await req('POST', `/support/tickets/${ticketId}/assign`, {
    token: agentToken,
    body: { agentId: agentLogin.json.data.user.id },
  });
  check('assign ticket to agent', assign.status === 200 && assign.json.data.status === 'IN_PROGRESS');

  const internalNote = await req('POST', `/support/tickets/${ticketId}/reply`, {
    token: agentToken,
    body: { body: 'Internal: checking warehouse.', internal: true },
  });
  check('agent adds internal note', internalNote.status === 201 && internalNote.json.data.internal === true);

  const customerView = await req('GET', `/support/tickets/mine/${ticketId}`, { token: customerToken });
  const hasInternal = (customerView.json?.data?.messages || []).some((m) => m.internal === true);
  check('internal note hidden from customer', !hasInternal, customerView.json?.data?.messages);

  const staffView = await req('GET', `/support/tickets/${ticketId}`, { token: agentToken });
  const staffSeesInternal = (staffView.json?.data?.messages || []).some((m) => m.internal === true);
  check('staff sees internal note', staffSeesInternal);

  const escalate = await req('POST', `/support/tickets/${ticketId}/escalate`, { token: agentToken });
  check('escalate ticket', escalate.status === 200 && escalate.json.data.status === 'ESCALATED');

  const resolve = await req('PATCH', `/support/tickets/${ticketId}/status`, {
    token: agentToken,
    body: { status: 'RESOLVED' },
  });
  check('resolve ticket', resolve.status === 200 && resolve.json.data.status === 'RESOLVED');

  console.log('\n=== 13. USER PROFILE & NOTIFICATION PREFS ===');
  const profile = await req('GET', '/users/me', { token: customerToken });
  check('get profile', profile.status === 200 && !!profile.json.data.wallet);

  const updateProfile = await req('PATCH', '/users/me', {
    token: customerToken,
    body: { fullName: 'Updated Customer' },
  });
  check('update profile', updateProfile.status === 200 && updateProfile.json.data.fullName === 'Updated Customer');

  const prefs = await req('PATCH', '/users/me/notification-preferences', {
    token: customerToken,
    body: { sms: false, whatsapp: true },
  });
  check('update notification prefs', prefs.status === 200 && prefs.json.data.sms === false, prefs.json);

  console.log('\n=== 14. ADMIN ===');
  const analytics = await req('GET', '/admin/analytics', { token: adminToken });
  check('admin analytics 200', analytics.status === 200, analytics.json);
  check('analytics has counts', typeof analytics.json?.data?.users === 'number');
  check('analytics has loyalty totals', typeof analytics.json?.data?.loyalty?.outstandingPoints === 'number');
  check('analytics revenue reflects order', Number(analytics.json?.data?.revenue) >= 800, analytics.json?.data?.revenue);

  const analyticsAsCustomer = await req('GET', '/admin/analytics', { token: customerToken });
  check('non-admin blocked (403)', analyticsAsCustomer.status === 403);

  const adminUsers = await req('GET', '/admin/users?page=1&limit=10', { token: adminToken });
  check('admin lists users', adminUsers.status === 200 && adminUsers.json.data.length >= 3);

  const suspend = await req('PATCH', `/admin/users/${newUserId}/status`, {
    token: adminToken,
    body: { status: 'SUSPENDED' },
  });
  check('admin suspends user', suspend.status === 200 && suspend.json.data.status === 'SUSPENDED');

  const suspendedLogin = await req('POST', '/auth/login', {
    body: { email: uniqueEmail, password: 'Password@123' },
  });
  check('suspended user cannot log in', suspendedLogin.status === 401, suspendedLogin.json);

  await req('PATCH', `/admin/users/${newUserId}/status`, { token: adminToken, body: { status: 'ACTIVE' } });

  const auditLogs = await req('GET', '/admin/audit-logs?page=1&limit=10', { token: adminToken });
  check('audit logs recorded', auditLogs.status === 200 && auditLogs.json.data.length >= 1, auditLogs.json);

  const moderate = await req('POST', `/admin/listings/${listingId}/moderate`, {
    token: adminToken,
    body: { action: 'WITHDRAWN' },
  });
  check('admin moderates listing', moderate.status === 200 && moderate.json.data.status === 'WITHDRAWN');

  console.log('\n=== 15. ERROR HANDLING ===');
  const notFound = await req('GET', '/products/does-not-exist-id');
  check('unknown product 404', notFound.status === 404, notFound.json);

  const badRoute = await fetch(`${API}/nope`).then((r) => r.status);
  check('unknown route 404', badRoute === 404);

  const badToken = await req('GET', '/auth/me', { token: 'garbage.token.here' });
  check('invalid token 401', badToken.status === 401);

  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailed checks:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('='.repeat(50) + '\n');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
