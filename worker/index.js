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
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
])

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

async function requireUser(request, env) {
  const user = await currentUser(request, env)
  if (!user) throw new ResponseError('Authentication required.', 401)
  return user
}

function cleanText(value, maximum, required = false) {
  const result = String(value || '').trim()
  if ((required && !result) || result.length > maximum) throw new ResponseError('Check the information you entered.', 400)
  return result || null
}

function validDateRange(startsAtValue, endsAtValue, requireFuture = false) {
  const starts = new Date(startsAtValue)
  const ends = new Date(endsAtValue)
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
    throw new ResponseError('Enter a valid start and end time.', 400)
  }
  if (requireFuture && starts <= new Date()) throw new ResponseError('Reservations must begin in the future.', 400)
  if (ends.getTime() - starts.getTime() > 12 * 60 * 60 * 1000) throw new ResponseError('An event cannot exceed 12 hours.', 400)
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString() }
}

async function portalDashboard(request, env) {
  const user = await requireUser(request, env)
  const [announcements, events, documents, reservations] = await env.DB.batch([
    env.DB.prepare(`SELECT id, title, body, audience, published_at AS publishedAt FROM announcements
      WHERE published_at <= CURRENT_TIMESTAMP ORDER BY published_at DESC LIMIT 20`),
    env.DB.prepare(`SELECT id, title, description, starts_at AS startsAt, ends_at AS endsAt,
      audience, event_type AS eventType FROM events WHERE status = 'scheduled' AND ends_at >= CURRENT_TIMESTAMP ORDER BY starts_at LIMIT 50`),
    env.DB.prepare(`SELECT id, title, description, document_url AS url, category, audience
      FROM documents ORDER BY category, title`),
    env.DB.prepare(`SELECT id, event_name AS eventName, starts_at AS startsAt, ends_at AS endsAt,
      attendee_count AS attendeeCount, status, deposit_status AS depositStatus
      FROM clubhouse_reservations WHERE user_id = ?1 ORDER BY starts_at DESC`).bind(user.id),
  ])
  return json({
    announcements: announcements.results,
    events: events.results,
    documents: documents.results,
    reservations: reservations.results,
  })
}

async function publicContent(env) {
  const [announcements, events, documents] = await env.DB.batch([
    env.DB.prepare(`SELECT id, title, body, published_at AS publishedAt FROM announcements
      WHERE audience = 'public' AND published_at <= CURRENT_TIMESTAMP ORDER BY published_at DESC LIMIT 10`),
    env.DB.prepare(`SELECT id, title, description, starts_at AS startsAt, ends_at AS endsAt, event_type AS eventType
      FROM events WHERE audience = 'public' AND status = 'scheduled' AND ends_at >= CURRENT_TIMESTAMP ORDER BY starts_at LIMIT 20`),
    env.DB.prepare(`SELECT id, title, description, document_url AS url, category FROM documents
      WHERE audience = 'public' ORDER BY category, title`),
  ])
  return json({ announcements: announcements.results, events: events.results, documents: documents.results })
}

async function adminDashboard(request, env) {
  await requireAdmin(request, env)
  const [properties, phases, announcements, events, documents, reservations] = await env.DB.batch([
    env.DB.prepare(`SELECT properties.id, properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address,
      properties.status, hoa_phases.name AS phase FROM properties INNER JOIN hoa_phases ON hoa_phases.id = properties.phase_id
      ORDER BY properties.street_name, properties.street_number`),
    env.DB.prepare('SELECT id, name, status FROM hoa_phases ORDER BY id'),
    env.DB.prepare('SELECT id, title, body, audience, published_at AS publishedAt FROM announcements ORDER BY published_at DESC'),
    env.DB.prepare(`SELECT id, title, description, starts_at AS startsAt, ends_at AS endsAt, audience, event_type AS eventType, status
      FROM events ORDER BY starts_at DESC LIMIT 100`),
    env.DB.prepare(`SELECT id, title, description, category, audience, document_url AS url,
      storage_key AS storageKey, original_name AS originalName, file_size AS fileSize FROM documents ORDER BY category, title`),
    env.DB.prepare(`SELECT clubhouse_reservations.id, clubhouse_reservations.event_name AS eventName,
      clubhouse_reservations.starts_at AS startsAt, clubhouse_reservations.ends_at AS endsAt,
      clubhouse_reservations.attendee_count AS attendeeCount, clubhouse_reservations.status,
      users.first_name || ' ' || users.last_name AS residentName
      FROM clubhouse_reservations INNER JOIN users ON users.id = clubhouse_reservations.user_id
      ORDER BY clubhouse_reservations.starts_at DESC LIMIT 100`),
  ])
  return json({ properties: properties.results, phases: phases.results, announcements: announcements.results,
    events: events.results, documents: documents.results, reservations: reservations.results })
}

async function createProperty(request, env) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const normalized = normalizeAddress(cleanText(body.address, 160, true))
  const match = normalized.match(/^(\d{1,6}) ([A-Z0-9 ]+) (RD|DR)$/)
  if (!match) throw new ResponseError('Enter an address such as 800 Abbey Rd.', 400)
  const phaseName = cleanText(body.phaseName || 'New Development', 80, true)
  let phase = await env.DB.prepare('SELECT id FROM hoa_phases WHERE name = ?1 COLLATE NOCASE').bind(phaseName).first()
  if (!phase) {
    const slug = `${phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`
    const result = await env.DB.prepare("INSERT INTO hoa_phases (name, slug, status) VALUES (?1, ?2, 'active')").bind(phaseName, slug).run()
    phase = { id: result.meta.last_row_id }
  }
  try {
    const result = await env.DB.prepare(`INSERT INTO properties (phase_id, street_number, street_name, street_suffix)
      VALUES (?1, ?2, ?3, ?4)`).bind(phase.id, Number(match[1]), match[2].split(' ').map((part) => part[0] + part.slice(1).toLowerCase()).join(' '), match[3] === 'RD' ? 'Rd' : 'Dr').run()
    await env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id)
      VALUES (?1, 'property.created', 'property', ?2)`).bind(admin.id, String(result.meta.last_row_id)).run()
    return json({ status: 'created' }, { status: 201 })
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ResponseError('That property already exists.', 409)
    throw error
  }
}

async function createAnnouncement(request, env) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const audience = ['public', 'members'].includes(body.audience) ? body.audience : 'members'
  const id = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO announcements (id, title, body, audience, created_by) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(id, cleanText(body.title, 140, true), cleanText(body.body, 5000, true), audience, admin.id).run()
  return json({ id }, { status: 201 })
}

async function createEvent(request, env) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const range = validDateRange(body.startsAt, body.endsAt)
  const audience = ['public', 'members'].includes(body.audience) ? body.audience : 'members'
  const eventType = ['community', 'meeting'].includes(body.eventType) ? body.eventType : 'community'
  const id = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO events (id, title, description, starts_at, ends_at, audience, event_type, created_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(id, cleanText(body.title, 140, true), cleanText(body.description, 3000),
    range.startsAt, range.endsAt, audience, eventType, admin.id).run()
  return json({ id }, { status: 201 })
}

async function createDocument(request, env) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const audience = ['public', 'members'].includes(body.audience) ? body.audience : 'members'
  const url = cleanText(body.url, 1000, true)
  if (!/^https:\/\//i.test(url)) throw new ResponseError('Document links must use HTTPS.', 400)
  const id = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO documents (id, title, description, document_url, category, audience, created_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(id, cleanText(body.title, 140, true), cleanText(body.description, 1000),
    url, cleanText(body.category || 'General', 80, true), audience, admin.id).run()
  return json({ id }, { status: 201 })
}

function safeFileName(value) {
  const name = String(value || 'document').replace(/[\r\n"\\/]/g, '_').slice(0, 180)
  return name || 'document'
}

async function readDocumentForm(request) {
  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_DOCUMENT_BYTES + 65536) {
    throw new ResponseError('Files must be 15 MB or smaller.', 413)
  }
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size <= 0) throw new ResponseError('Choose a document to upload.', 400)
  if (file.size > MAX_DOCUMENT_BYTES) throw new ResponseError('Files must be 15 MB or smaller.', 413)
  if (!DOCUMENT_TYPES.has(file.type)) throw new ResponseError('Upload a PDF, Word, Excel, JPEG, or PNG file.', 400)
  const audience = ['public', 'members'].includes(form.get('audience')) ? form.get('audience') : 'members'
  return {
    file,
    title: cleanText(form.get('title'), 140, true),
    description: cleanText(form.get('description'), 1000),
    category: cleanText(form.get('category') || 'General', 80, true),
    audience,
  }
}

async function uploadDocument(request, env) {
  const admin = await requireAdmin(request, env)
  const input = await readDocumentForm(request)
  const id = crypto.randomUUID()
  const originalName = safeFileName(input.file.name)
  const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
  const storageKey = `documents/${id}/${crypto.randomUUID()}${extension}`
  await env.DOCUMENTS.put(storageKey, input.file.stream(), {
    httpMetadata: { contentType: input.file.type, contentDisposition: `attachment; filename="${originalName}"` },
    customMetadata: { uploadedBy: admin.id, documentId: id },
  })
  try {
    await env.DB.prepare(`INSERT INTO documents (id, title, description, document_url, category, audience, created_by,
      storage_key, original_name, mime_type, file_size) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
      .bind(id, input.title, input.description, `/api/documents/${id}/download`, input.category, input.audience,
        admin.id, storageKey, originalName, input.file.type, input.file.size).run()
  } catch (error) {
    await env.DOCUMENTS.delete(storageKey)
    throw error
  }
  return json({ id }, { status: 201 })
}

async function replaceDocument(request, env, id) {
  const admin = await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT storage_key AS storageKey FROM documents WHERE id = ?1').bind(id).first()
  if (!existing) throw new ResponseError('Document not found.', 404)
  const input = await readDocumentForm(request)
  const originalName = safeFileName(input.file.name)
  const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
  const storageKey = `documents/${id}/${crypto.randomUUID()}${extension}`
  await env.DOCUMENTS.put(storageKey, input.file.stream(), {
    httpMetadata: { contentType: input.file.type, contentDisposition: `attachment; filename="${originalName}"` },
    customMetadata: { uploadedBy: admin.id, documentId: id },
  })
  try {
    await env.DB.prepare(`UPDATE documents SET title = ?1, description = ?2, document_url = ?3, category = ?4,
      audience = ?5, storage_key = ?6, original_name = ?7, mime_type = ?8, file_size = ?9,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?10`).bind(input.title, input.description, `/api/documents/${id}/download`,
      input.category, input.audience, storageKey, originalName, input.file.type, input.file.size, id).run()
  } catch (error) {
    await env.DOCUMENTS.delete(storageKey)
    throw error
  }
  if (existing.storageKey) await env.DOCUMENTS.delete(existing.storageKey)
  return json({ status: 'updated' })
}

async function downloadDocument(request, env, id) {
  const document = await env.DB.prepare(`SELECT audience, storage_key AS storageKey, original_name AS originalName,
    mime_type AS mimeType FROM documents WHERE id = ?1`).bind(id).first()
  if (!document || !document.storageKey) throw new ResponseError('Document not found.', 404)
  if (document.audience !== 'public') await requireUser(request, env)
  const object = await env.DOCUMENTS.get(document.storageKey)
  if (!object) throw new ResponseError('Document file not found.', 404)
  return new Response(object.body, {
    headers: {
      'cache-control': document.audience === 'public' ? 'public, max-age=300' : 'private, no-store',
      'content-disposition': `attachment; filename="${safeFileName(document.originalName)}"`,
      'content-length': String(object.size),
      'content-type': document.mimeType || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    },
  })
}

async function updateProperty(request, env, propertyId) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const status = ['active', 'planned', 'inactive'].includes(body.status) ? body.status : null
  if (!status) throw new ResponseError('Select a valid property status.', 400)
  const result = await env.DB.prepare('UPDATE properties SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2')
    .bind(status, propertyId).run()
  if (!result.meta.changes) throw new ResponseError('Property not found.', 404)
  await env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
    VALUES (?1, 'property.status_changed', 'property', ?2, ?3)`).bind(admin.id, propertyId, JSON.stringify({ status })).run()
  return json({ status })
}

async function updateAnnouncement(request, env, id) {
  await requireAdmin(request, env)
  const body = await readJson(request)
  const audience = ['public', 'members'].includes(body.audience) ? body.audience : 'members'
  const result = await env.DB.prepare(`UPDATE announcements SET title = ?1, body = ?2, audience = ?3,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?4`).bind(cleanText(body.title, 140, true),
    cleanText(body.body, 5000, true), audience, id).run()
  if (!result.meta.changes) throw new ResponseError('Announcement not found.', 404)
  return json({ status: 'updated' })
}

async function deleteAnnouncement(request, env, id) {
  await requireAdmin(request, env)
  const result = await env.DB.prepare('DELETE FROM announcements WHERE id = ?1').bind(id).run()
  if (!result.meta.changes) throw new ResponseError('Announcement not found.', 404)
  return json({ status: 'deleted' })
}

async function updateEvent(request, env, id) {
  await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT event_type AS eventType FROM events WHERE id = ?1').bind(id).first()
  if (!existing) throw new ResponseError('Event not found.', 404)
  if (existing.eventType === 'clubhouse') throw new ResponseError('Manage clubhouse events from Reservations.', 409)
  const body = await readJson(request)
  const range = validDateRange(body.startsAt, body.endsAt)
  const audience = ['public', 'members'].includes(body.audience) ? body.audience : 'members'
  const eventType = ['community', 'meeting'].includes(body.eventType) ? body.eventType : 'community'
  await env.DB.prepare(`UPDATE events SET title = ?1, description = ?2, starts_at = ?3, ends_at = ?4,
    audience = ?5, event_type = ?6, status = 'scheduled', updated_at = CURRENT_TIMESTAMP WHERE id = ?7`)
    .bind(cleanText(body.title, 140, true), cleanText(body.description, 3000), range.startsAt,
      range.endsAt, audience, eventType, id).run()
  return json({ status: 'updated' })
}

async function cancelEvent(request, env, id) {
  await requireAdmin(request, env)
  const event = await env.DB.prepare('SELECT event_type AS eventType FROM events WHERE id = ?1').bind(id).first()
  if (!event) throw new ResponseError('Event not found.', 404)
  if (event.eventType === 'clubhouse') throw new ResponseError('Cancel clubhouse events from Reservations.', 409)
  await env.DB.prepare("UPDATE events SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(id).run()
  return json({ status: 'cancelled' })
}

async function updateDocument(request, env, id) {
  await requireAdmin(request, env)
  const body = await readJson(request)
  const audience = ['public', 'members'].includes(body.audience) ? body.audience : 'members'
  const url = cleanText(body.url, 1000, true)
  if (!/^https:\/\//i.test(url)) throw new ResponseError('Document links must use HTTPS.', 400)
  const result = await env.DB.prepare(`UPDATE documents SET title = ?1, description = ?2, document_url = ?3,
    category = ?4, audience = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6`)
    .bind(cleanText(body.title, 140, true), cleanText(body.description, 1000), url,
      cleanText(body.category || 'General', 80, true), audience, id).run()
  if (!result.meta.changes) throw new ResponseError('Document not found.', 404)
  return json({ status: 'updated' })
}

async function deleteDocument(request, env, id) {
  await requireAdmin(request, env)
  const document = await env.DB.prepare('SELECT storage_key AS storageKey FROM documents WHERE id = ?1').bind(id).first()
  if (!document) throw new ResponseError('Document not found.', 404)
  const result = await env.DB.prepare('DELETE FROM documents WHERE id = ?1').bind(id).run()
  if (!result.meta.changes) throw new ResponseError('Document not found.', 404)
  if (document.storageKey) await env.DOCUMENTS.delete(document.storageKey)
  return json({ status: 'deleted' })
}

async function createReservation(request, env) {
  const user = await requireUser(request, env)
  const body = await readJson(request)
  if (body.rulesAcknowledged !== true) throw new ResponseError('You must acknowledge the clubhouse rules.', 400)
  const range = validDateRange(body.startsAt, body.endsAt, true)
  const attendeeCount = Number(body.attendeeCount)
  if (!Number.isInteger(attendeeCount) || attendeeCount < 1 || attendeeCount > 100) throw new ResponseError('Enter an attendee count from 1 to 100.', 400)
  const conflict = await env.DB.prepare(`SELECT id FROM clubhouse_reservations WHERE status = 'confirmed'
    AND starts_at < ?2 AND ends_at > ?1 LIMIT 1`).bind(range.startsAt, range.endsAt).first()
  if (conflict) throw new ResponseError('The clubhouse is already reserved during that time.', 409)
  const reservationId = crypto.randomUUID()
  const eventId = crypto.randomUUID()
  const eventName = cleanText(body.eventName, 140, true)
  const notes = cleanText(body.notes, 1500)
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO events (id, title, description, starts_at, ends_at, audience, event_type, created_by)
      VALUES (?1, ?2, ?3, ?4, ?5, 'members', 'clubhouse', ?6)`).bind(eventId, `Clubhouse reserved: ${eventName}`, 'Clubhouse reservation', range.startsAt, range.endsAt, user.id),
    env.DB.prepare(`INSERT INTO clubhouse_reservations (id, user_id, event_id, event_name, starts_at, ends_at,
      attendee_count, notes, rules_acknowledged_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)`)
      .bind(reservationId, user.id, eventId, eventName, range.startsAt, range.endsAt, attendeeCount, notes),
  ])
  return json({ id: reservationId, status: 'confirmed' }, { status: 201 })
}

async function cancelReservation(request, env, reservationId) {
  const user = await requireUser(request, env)
  const reservation = await env.DB.prepare('SELECT id, event_id AS eventId, user_id AS userId, status FROM clubhouse_reservations WHERE id = ?1').bind(reservationId).first()
  if (!reservation) throw new ResponseError('Reservation not found.', 404)
  if (reservation.userId !== user.id && !['admin', 'super_admin'].includes(user.role)) throw new ResponseError('Not permitted.', 403)
  if (reservation.status === 'cancelled') return json({ status: 'cancelled' })
  await env.DB.batch([
    env.DB.prepare("UPDATE clubhouse_reservations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(reservationId),
    env.DB.prepare("UPDATE events SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(reservation.eventId),
  ])
  return json({ status: 'cancelled' })
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
  if (request.method === 'GET' && url.pathname === '/api/public/content') return publicContent(env)
  const downloadMatch = url.pathname.match(/^\/api\/documents\/([^/]+)\/download$/)
  if (downloadMatch && request.method === 'GET') return downloadDocument(request, env, downloadMatch[1])
  if (request.method === 'GET' && url.pathname === '/api/auth/session') return json({ user: await currentUser(request, env) })
  if (request.method === 'GET' && url.pathname === '/api/auth/google/start') return startGoogleAuth(request, env)
  if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') return finishGoogleAuth(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/register') return register(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/code/request') return requestLoginCode(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/code/verify') return verifyLoginCode(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') return logout(request, env)
  if (request.method === 'GET' && url.pathname === '/api/portal/dashboard') return portalDashboard(request, env)
  if (request.method === 'POST' && url.pathname === '/api/portal/reservations') return createReservation(request, env)
  const reservationMatch = url.pathname.match(/^\/api\/portal\/reservations\/([^/]+)$/)
  if (request.method === 'DELETE' && reservationMatch) return cancelReservation(request, env, reservationMatch[1])
  if (request.method === 'GET' && url.pathname === '/api/admin/users') return listUsers(request, env)
  if (request.method === 'GET' && url.pathname === '/api/admin/dashboard') return adminDashboard(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/properties') return createProperty(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/announcements') return createAnnouncement(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/events') return createEvent(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/documents') return createDocument(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/documents/upload') return uploadDocument(request, env)
  const propertyMatch = url.pathname.match(/^\/api\/admin\/properties\/([^/]+)$/)
  if (propertyMatch && request.method === 'PATCH') return updateProperty(request, env, propertyMatch[1])
  const announcementMatch = url.pathname.match(/^\/api\/admin\/announcements\/([^/]+)$/)
  if (announcementMatch && request.method === 'PATCH') return updateAnnouncement(request, env, announcementMatch[1])
  if (announcementMatch && request.method === 'DELETE') return deleteAnnouncement(request, env, announcementMatch[1])
  const eventMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)$/)
  if (eventMatch && request.method === 'PATCH') return updateEvent(request, env, eventMatch[1])
  if (eventMatch && request.method === 'DELETE') return cancelEvent(request, env, eventMatch[1])
  const documentMatch = url.pathname.match(/^\/api\/admin\/documents\/([^/]+)$/)
  if (documentMatch && request.method === 'PATCH') return updateDocument(request, env, documentMatch[1])
  if (documentMatch && request.method === 'DELETE') return deleteDocument(request, env, documentMatch[1])
  const documentUploadMatch = url.pathname.match(/^\/api\/admin\/documents\/([^/]+)\/upload$/)
  if (documentUploadMatch && request.method === 'PUT') return replaceDocument(request, env, documentUploadMatch[1])
  const adminReservationMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)$/)
  if (adminReservationMatch && request.method === 'DELETE') return cancelReservation(request, env, adminReservationMatch[1])
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
