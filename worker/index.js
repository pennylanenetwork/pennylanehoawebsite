const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
}
const SESSION_COOKIE = 'plhoa_session'
const SESSION_SECONDS = 60 * 60 * 24 * 7
const PASSWORD_ITERATIONS = 600000
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

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS)
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iterations: PASSWORD_ITERATIONS,
  }
}

async function verifyPassword(password, encodedHash, encodedSalt, iterations) {
  const actual = await derivePassword(password, base64ToBytes(encodedSalt), iterations)
  const expected = base64ToBytes(encodedHash)
  if (actual.length !== expected.length) return false
  let mismatch = 0
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual[index] ^ expected[index]
  return mismatch === 0
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
  const firstName = String(body.firstName || '').trim()
  const lastName = String(body.lastName || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = String(body.phone || '').trim() || null
  const password = String(body.password || '')
  const address = String(body.address || '').trim()

  if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) throw new ResponseError('Enter your first and last name.', 400)
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new ResponseError('Enter a valid email address.', 400)
  if (phone && phone.length > 30) throw new ResponseError('Enter a valid phone number.', 400)
  if (password.length < 12 || password.length > 128) throw new ResponseError('Password must be between 12 and 128 characters.', 400)
  if (!address || address.length > 160) throw new ResponseError('Enter a valid Penny Lane Estates address.', 400)

  const property = await findActiveProperty(env, address)
  if (!property) throw new ResponseError('That address was not found in Penny Lane Estates.', 400)

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first()
  if (existing) throw new ResponseError('An account request already exists for this email address.', 409)

  const id = crypto.randomUUID()
  const passwordRecord = await hashPassword(password)
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (id, property_id, email, first_name, last_name, phone, password_hash, password_salt, password_iterations)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `).bind(id, property.id, email, firstName, lastName, phone, passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations),
    env.DB.prepare(`
      INSERT INTO audit_log (action, target_type, target_id, details_json)
      VALUES ('account.registered', 'user', ?1, ?2)
    `).bind(id, JSON.stringify({ propertyId: property.id })),
  ])
  return json({ status: 'pending' }, { status: 201 })
}

async function login(request, env) {
  const body = await readJson(request)
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const user = await env.DB.prepare(`
    SELECT id, password_hash AS passwordHash, password_salt AS passwordSalt,
      password_iterations AS passwordIterations, status
    FROM users WHERE email = ?1
  `).bind(email).first()
  const valid = user && await verifyPassword(password, user.passwordHash, user.passwordSalt, user.passwordIterations)
  if (!valid) throw new ResponseError('Email or password is incorrect.', 401)
  if (user.status === 'pending') throw new ResponseError('Your registration is awaiting HOA approval.', 403)
  if (user.status !== 'active') throw new ResponseError('This account is not currently active.', 403)

  const token = randomToken()
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(tokenHash, user.id, expiresAt),
    env.DB.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1').bind(user.id),
  ])
  const authenticatedUser = await currentUser(new Request(request.url, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  }), env)
  return json({ user: authenticatedUser }, { headers: { 'set-cookie': sessionCookie(token) } })
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
  if (request.method === 'POST' && url.pathname === '/api/auth/register') return register(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/login') return login(request, env)
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
