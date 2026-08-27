const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
}
const SESSION_COOKIE = 'plhoa_session'
const OAUTH_STATE_COOKIE = 'plhoa_oauth_state'
const SESSION_SECONDS = 60 * 60 * 24 * 7
const LOGIN_CODE_SECONDS = 60 * 10
const LOGIN_CODE_MAX_ATTEMPTS = 5
const LOGIN_CODE_RATE_SECONDS = 60
const MAX_BODY_BYTES = 16384

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...init.headers },
  })
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToBase64(new Uint8Array(digest))
}

function constantTimeEqual(actualValue, expectedValue) {
  const actual = base64ToBytes(actualValue)
  const expected = base64ToBytes(expectedValue)
  if (actual.length !== expected.length) return false
  let mismatch = 0
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual[index] ^ expected[index]
  return mismatch === 0
}

function randomLoginCode() {
  const maximum = 1000000
  const cutoff = Math.floor(0x100000000 / maximum) * maximum
  const values = new Uint32Array(1)
  do crypto.getRandomValues(values)
  while (values[0] >= cutoff)
  return String(values[0] % maximum).padStart(6, '0')
}

function getCookie(request, name) {
  const cookies = request.headers.get('cookie') || ''
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return null
}

function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

function oauthStateCookie(token, maxAge = 600) {
  return `${OAUTH_STATE_COOKIE}=${token}; Path=/api/auth/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

function requireSameOrigin(request) {
  const origin = request.headers.get('origin')
  return origin && origin === new URL(request.url).origin
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_BODY_BYTES) {
    throw new ResponseError('Invalid request body.', 400)
  }
  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BODY_BYTES) throw new ResponseError('Request body is too large.', 413)
  try {
    return JSON.parse(new TextDecoder().decode(body))
  } catch {
    throw new ResponseError('Invalid JSON.', 400)
  }
}

class ResponseError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function verifyTurnstile(body, env) {
  const token = String(body.turnstileToken || '')
  if (!token) throw new ResponseError('Complete the Cloudflare verification first.', 400)
  const response = await env.TURNSTILE.fetch('https://turnstile.internal/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.success !== true || result.action !== 'turnstile-spin-v1') {
    throw new ResponseError('Cloudflare could not verify this request. Please try again.', 403)
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

async function sendLoginCode(env, user, code, requestId) {
  if (!env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not configured')
  const firstName = escapeHtml(user.firstName)
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Penny Lane HOA', email: 'signin@pennylanehoa.net' },
      to: [{ email: user.email, name: `${user.firstName} ${user.lastName}`.trim() }],
      subject: `${code} is your Penny Lane HOA sign-in code`,
      htmlContent: `<p>Hello ${firstName},</p><p>Your Penny Lane HOA sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes and can only be used once.</p><p>If you did not request this code, you can ignore this email.</p>`,
      headers: { 'X-Login-Request': requestId },
      tags: ['resident-login'],
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    console.error(JSON.stringify({ message: 'Brevo rejected login email', status: response.status, detail: detail.slice(0, 500) }))
    throw new Error('Login email could not be sent')
  }
}

async function createSessionResponse(request, env, userId, redirectTo = null) {
  const token = randomToken()
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(tokenHash, userId, expiresAt),
    env.DB.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1').bind(userId),
  ])
  if (redirectTo) return new Response(null, { status: 302, headers: { location: redirectTo, 'set-cookie': sessionCookie(token) } })
  const authenticatedUser = await currentUser(new Request(request.url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }), env)
  return json({ user: authenticatedUser }, { headers: { 'set-cookie': sessionCookie(token) } })
}

function portalRedirect(request, status) {
  const url = new URL('/portal', request.url)
  if (status) url.searchParams.set('auth', status)
  return url.toString()
}

async function startGoogleAuth(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new ResponseError('Google sign-in is not configured yet.', 503)
  const state = randomToken(24)
  const redirectUri = new URL('/api/auth/google/callback', request.url).toString()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString()
  return new Response(null, { status: 302, headers: { location: url.toString(), 'set-cookie': oauthStateCookie(state) } })
}

async function finishGoogleAuth(request, env) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') || ''
  const expectedState = getCookie(request, OAUTH_STATE_COOKIE) || ''
  const failureHeaders = { location: portalRedirect(request, 'google_failed'), 'set-cookie': oauthStateCookie('', 0) }
  if (!state || !expectedState || state !== expectedState || url.searchParams.get('error')) return new Response(null, { status: 302, headers: failureHeaders })

  const redirectUri = new URL('/api/auth/google/callback', request.url).toString()
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenResponse.ok) return new Response(null, { status: 302, headers: failureHeaders })
  const tokens = await tokenResponse.json()
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  })
  if (!profileResponse.ok) return new Response(null, { status: 302, headers: failureHeaders })
  const profile = await profileResponse.json()
  const email = String(profile.email || '').trim().toLowerCase()
  if (!profile.sub || !profile.email_verified || !email) return new Response(null, { status: 302, headers: failureHeaders })

  let user = await env.DB.prepare(`
    SELECT users.id, users.status FROM auth_identities
    INNER JOIN users ON users.id = auth_identities.user_id
    WHERE auth_identities.provider = 'google' AND auth_identities.subject = ?1
  `).bind(String(profile.sub)).first()
  if (!user) {
    user = await env.DB.prepare('SELECT id, status FROM users WHERE email = ?1').bind(email).first()
    if (!user) return new Response(null, { status: 302, headers: { location: portalRedirect(request, 'not_registered'), 'set-cookie': oauthStateCookie('', 0) } })
    await env.DB.prepare(`
      INSERT INTO auth_identities (provider, subject, user_id, email_at_link)
      VALUES ('google', ?1, ?2, ?3)
      ON CONFLICT(provider, user_id) DO NOTHING
    `).bind(String(profile.sub), user.id, email).run()
  }
  if (user.status !== 'active') return new Response(null, { status: 302, headers: { location: portalRedirect(request, user.status), 'set-cookie': oauthStateCookie('', 0) } })
  const response = await createSessionResponse(request, env, user.id, portalRedirect(request, null))
  response.headers.append('set-cookie', oauthStateCookie('', 0))
  return response
}

function normalizeAddress(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bLINDALE\b(?:\s+TX)?(?:\s+75771)?$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function findActiveProperty(env, address) {
  const normalized = normalizeAddress(address)
  if (!/^\d{1,6} [A-Z0-9 ]+ (RD|DR)$/.test(normalized)) return null
  const result = await env.DB.prepare(`
    SELECT properties.id, properties.street_number AS streetNumber,
      properties.street_name AS streetName, properties.street_suffix AS streetSuffix
    FROM properties
    INNER JOIN hoa_phases ON hoa_phases.id = properties.phase_id
    WHERE properties.status = 'active' AND hoa_phases.status = 'active'
  `).all()
  return result.results.find((property) => normalizeAddress(
    `${property.streetNumber} ${property.streetName} ${property.streetSuffix}`,
  ) === normalized) || null
}

async function currentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE)
  if (!token) return null
  const tokenHash = await sha256(token)
  const user = await env.DB.prepare(`
    SELECT users.id, users.email, users.first_name AS firstName,
      users.last_name AS lastName, users.role, users.status,
      properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    INNER JOIN properties ON properties.id = users.property_id
    WHERE sessions.token_hash = ?1 AND sessions.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first()
  return user?.status === 'active' ? user : null
}

async function requireAdmin(request, env) {
  const user = await currentUser(request, env)
  if (!user) throw new ResponseError('Authentication required.', 401)
  if (!['admin', 'super_admin'].includes(user.role)) throw new ResponseError('Administrator access required.', 403)
  return user
}

async function register(request, env) {
  const body = await readJson(request)
  await verifyTurnstile(body, env)
  const firstName = String(body.firstName || '').trim()
  const lastName = String(body.lastName || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = String(body.phone || '').trim() || null
  const address = String(body.address || '').trim()

  if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) throw new ResponseError('Enter your first and last name.', 400)
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new ResponseError('Enter a valid email address.', 400)
  if (phone && phone.length > 30) throw new ResponseError('Enter a valid phone number.', 400)
  if (!address || address.length > 160) throw new ResponseError('Enter a valid Penny Lane Estates address.', 400)

  const property = await findActiveProperty(env, address)
  if (!property) throw new ResponseError('That address was not found in Penny Lane Estates.', 400)

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first()
  if (existing) throw new ResponseError('An account request already exists for this email address.', 409)

  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (id, property_id, email, first_name, last_name, phone, password_hash, password_salt, password_iterations)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `).bind(id, property.id, email, firstName, lastName, phone, '', '', 0),
    env.DB.prepare(`
      INSERT INTO audit_log (action, target_type, target_id, details_json)
      VALUES ('account.registered', 'user', ?1, ?2)
    `).bind(id, JSON.stringify({ propertyId: property.id })),
  ])
  return json({ status: 'pending' }, { status: 201 })
}

async function requestLoginCode(request, env) {
  const body = await readJson(request)
  await verifyTurnstile(body, env)
  const email = String(body.email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new ResponseError('Enter a valid email address.', 400)
  const user = await env.DB.prepare(`
    SELECT id, email, first_name AS firstName, last_name AS lastName, status
    FROM users WHERE email = ?1
  `).bind(email).first()
  const generic = json({ status: 'ok' })
  if (!user || user.status !== 'active') return generic

  const recent = await env.DB.prepare(`
    SELECT id FROM login_codes
    WHERE user_id = ?1 AND created_at > datetime('now', ?2)
    ORDER BY created_at DESC LIMIT 1
  `).bind(user.id, `-${LOGIN_CODE_RATE_SECONDS} seconds`).first()
  if (recent) return generic

  if (!env.LOGIN_CODE_SECRET) throw new Error('LOGIN_CODE_SECRET is not configured')
  const id = crypto.randomUUID()
  const code = randomLoginCode()
  const codeHash = await sha256(`${env.LOGIN_CODE_SECRET}:${id}:${code}`)
  const expiresAt = new Date(Date.now() + LOGIN_CODE_SECONDS * 1000).toISOString()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_codes WHERE expires_at <= CURRENT_TIMESTAMP OR consumed_at IS NOT NULL'),
    env.DB.prepare('INSERT INTO login_codes (id, user_id, code_hash, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(id, user.id, codeHash, expiresAt),
  ])
  try {
    await sendLoginCode(env, user, code, id)
  } catch (error) {
    await env.DB.prepare('DELETE FROM login_codes WHERE id = ?1').bind(id).run()
    throw error
  }
  return generic
}

async function verifyLoginCode(request, env) {
  const body = await readJson(request)
  const email = String(body.email || '').trim().toLowerCase()
  const code = String(body.code || '').replace(/\s+/g, '')
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) throw new ResponseError('The sign-in code is invalid or expired.', 401)
  if (!env.LOGIN_CODE_SECRET) throw new Error('LOGIN_CODE_SECRET is not configured')
  const record = await env.DB.prepare(`
    SELECT login_codes.id, login_codes.code_hash AS codeHash, login_codes.attempts,
      users.id AS userId, users.status
    FROM login_codes INNER JOIN users ON users.id = login_codes.user_id
    WHERE users.email = ?1 AND login_codes.consumed_at IS NULL
      AND login_codes.expires_at > CURRENT_TIMESTAMP
    ORDER BY login_codes.created_at DESC LIMIT 1
  `).bind(email).first()
  if (!record || record.status !== 'active' || record.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    throw new ResponseError('The sign-in code is invalid or expired.', 401)
  }

  await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?1').bind(record.id).run()
  const actualHash = await sha256(`${env.LOGIN_CODE_SECRET}:${record.id}:${code}`)
  if (!constantTimeEqual(actualHash, record.codeHash)) throw new ResponseError('The sign-in code is invalid or expired.', 401)

  await env.DB.batch([
    env.DB.prepare('UPDATE login_codes SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ?1 AND consumed_at IS NULL').bind(record.userId),
  ])
  return createSessionResponse(request, env, record.userId)
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run()
  return json({ status: 'ok' }, { headers: { 'set-cookie': sessionCookie('', 0) } })
}

async function listUsers(request, env) {
  await requireAdmin(request, env)
  const result = await env.DB.prepare(`
    SELECT users.id, users.email, users.first_name AS firstName, users.last_name AS lastName,
      users.role, users.status, users.created_at AS createdAt,
      properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
    FROM users INNER JOIN properties ON properties.id = users.property_id
    ORDER BY CASE users.status WHEN 'pending' THEN 0 ELSE 1 END, users.created_at DESC
  `).all()
  return json({ users: result.results })
}

async function updateUserStatus(request, env, targetId) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const status = String(body.status || '')
  if (!['pending', 'active', 'rejected', 'suspended'].includes(status)) throw new ResponseError('Invalid account status.', 400)
  if (targetId === admin.id) throw new ResponseError('You cannot change your own account status.', 400)
  const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?1').bind(targetId).first()
  if (!target) throw new ResponseError('Account not found.', 404)
  if (target.role === 'super_admin' && admin.role !== 'super_admin') throw new ResponseError('Super administrator access required.', 403)

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users SET status = ?1,
        approved_at = CASE WHEN ?1 = 'active' THEN CURRENT_TIMESTAMP ELSE approved_at END,
        approved_by = CASE WHEN ?1 = 'active' THEN ?2 ELSE approved_by END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?3
    `).bind(status, admin.id, targetId),
    env.DB.prepare(`
      INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'account.status_changed', 'user', ?2, ?3)
    `).bind(admin.id, targetId, JSON.stringify({ status })),
  ])
  return json({ status })
}

async function handleApi(request, env) {
  const url = new URL(request.url)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !requireSameOrigin(request)) {
    return json({ error: 'Invalid request origin.' }, { status: 403 })
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const propertyCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM properties WHERE status = 'active'").first('count')
    return json({ status: 'ok', activeProperties: propertyCount })
  }
  if (request.method === 'GET' && url.pathname === '/api/auth/session') return json({ user: await currentUser(request, env) })
  if (request.method === 'GET' && url.pathname === '/api/auth/google/start') return startGoogleAuth(request, env)
  if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') return finishGoogleAuth(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/register') return register(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/code/request') return requestLoginCode(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/code/verify') return verifyLoginCode(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') return logout(request, env)
  if (request.method === 'GET' && url.pathname === '/api/admin/users') return listUsers(request, env)
  const statusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/)
  if (request.method === 'PATCH' && statusMatch) return updateUserStatus(request, env, statusMatch[1])
  return json({ error: 'Not found' }, { status: 404 })
}

export default {
  async fetch(request, env) {
    try {
      return await handleApi(request, env)
    } catch (error) {
      if (error instanceof ResponseError) return json({ error: error.message }, { status: error.status })
      console.error(JSON.stringify({
        message: 'Unhandled API error',
        error: error instanceof Error ? error.message : 'Unknown error',
        path: new URL(request.url).pathname,
      }))
      return json({ error: 'Internal server error' }, { status: 500 })
    }
  },
}
