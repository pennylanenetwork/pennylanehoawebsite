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
const MAX_GALLERY_BYTES = 10 * 1024 * 1024
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
])
const GALLERY_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

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

async function sendTransactionalEmail(env, recipients, subject, htmlContent, tag, replyTo = null, recordCommunication = true) {
  if (!env.BREVO_API_KEY || recipients.length === 0) return
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Penny Lane HOA', email: 'notifications@pennylanehoa.net' },
      replyTo: replyTo || { name: 'Penny Lane HOA Board', email: 'board@pennylanehoa.net' },
      to: recipients.map((recipient) => ({ email: recipient.email, name: recipient.name })),
      subject,
      htmlContent,
      tags: [tag],
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    console.error(JSON.stringify({ message: 'Brevo rejected transactional email', status: response.status, detail: detail.slice(0, 500), tag }))
    throw new Error('Transactional email could not be sent')
  }
  if (recordCommunication) await logOutboundCommunications(env, recipients, subject, htmlContent, tag, 'sent')
}

function emailSummary(htmlContent) {
  return String(htmlContent || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
}

async function logOutboundCommunications(env, recipients, subject, htmlContent, relatedType, deliveryStatus) {
  if (recipients.length === 0) return
  const statements = []
  for (const recipient of recipients) {
    const user = await env.DB.prepare('SELECT id, property_id AS propertyId FROM users WHERE email = ?1 COLLATE NOCASE').bind(recipient.email).first()
    if (!user) continue
    statements.push(env.DB.prepare(`INSERT INTO communication_log (id, property_id, user_id, direction, channel,
      recipient_or_sender, subject, summary, delivery_status, related_type) VALUES (?1, ?2, ?3, 'outbound',
      'email', ?4, ?5, ?6, ?7, ?8)`).bind(crypto.randomUUID(), user.propertyId, user.id, recipient.email,
      subject, emailSummary(htmlContent), deliveryStatus, relatedType))
  }
  if (statements.length) await env.DB.batch(statements)
}

async function sendResidentBroadcast(env, recipients, subject, htmlContent, tag) {
  if (!env.BREVO_API_KEY || recipients.length === 0) return
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Penny Lane HOA', email: 'notifications@pennylanehoa.net' },
      replyTo: { name: 'Penny Lane HOA Board', email: 'board@pennylanehoa.net' },
      subject,
      htmlContent,
      messageVersions: recipients.map((recipient) => ({ to: [{ email: recipient.email, name: recipient.name }] })),
      tags: [tag],
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    console.error(JSON.stringify({ message: 'Brevo rejected resident broadcast', status: response.status, detail: detail.slice(0, 500), tag }))
    throw new Error('Resident notification could not be sent')
  }
  await logOutboundCommunications(env, recipients, subject, htmlContent, tag, 'sent')
}

async function activeResidentRecipients(env, preferenceColumn) {
  const result = await env.DB.prepare(`SELECT email, first_name AS firstName, last_name AS lastName FROM users
    WHERE status = 'active' AND ${preferenceColumn} = 1 ORDER BY id`).all()
  return result.results.map((resident) => ({ email: resident.email, name: `${resident.firstName} ${resident.lastName}`.trim() }))
}

async function activeAdminRecipients(env) {
  const result = await env.DB.prepare(`SELECT email, first_name AS firstName, last_name AS lastName FROM users
    WHERE status = 'active' AND role IN ('admin', 'super_admin') ORDER BY id`).all()
  return result.results.map((admin) => ({ email: admin.email, name: `${admin.firstName} ${admin.lastName}`.trim() }))
}

async function messageRecipients(env, category) {
  let condition = "role IN ('admin', 'super_admin')"
  if (['general', 'maintenance', 'board'].includes(category)) condition = "is_board_member = 1 OR role = 'super_admin'"
  if (category === 'architectural') condition = "is_acc_member = 1 OR role = 'super_admin'"
  if (category === 'treasurer') condition = "is_treasurer = 1 OR role = 'super_admin'"
  if (category === 'amenities') condition = "is_amenities_coordinator = 1 OR role = 'super_admin'"
  const result = await env.DB.prepare(`SELECT email, first_name AS firstName, last_name AS lastName FROM users
    WHERE status = 'active' AND (${condition}) ORDER BY id`).all()
  return result.results.map((user) => ({ email: user.email, name: `${user.firstName} ${user.lastName}`.trim() }))
}

async function notifyReservationAdmins(env, user, reservation) {
  const recipients = await activeAdminRecipients(env)
  const residentName = `${user.firstName} ${user.lastName}`.trim()
  await sendTransactionalEmail(env, recipients, `Clubhouse request from ${residentName}`,
    `<p>A new clubhouse reservation request is awaiting review.</p><p><strong>${escapeHtml(reservation.eventName)}</strong><br>${escapeHtml(reservation.startsAt)} through ${escapeHtml(reservation.endsAt)}<br>${reservation.attendeeCount} expected attendees</p><p>Submitted by ${escapeHtml(residentName)}. Sign in to the HOA administration dashboard to approve or deny it.</p>`,
    'reservation-request', null, false)
}

async function notifyReservationDecision(env, reservation, approved) {
  const subject = approved ? 'Your clubhouse reservation was approved' : 'Your clubhouse reservation was denied'
  const decision = approved
    ? '<p>Your request has been approved and added to the members calendar.</p>'
    : `<p>Your request was denied.</p><p><strong>Reason:</strong> ${escapeHtml(reservation.decisionReason)}</p>`
  await sendTransactionalEmail(env, [{ email: reservation.email, name: reservation.residentName }], subject,
    `<p>Hello ${escapeHtml(reservation.firstName)},</p>${decision}<p><strong>${escapeHtml(reservation.eventName)}</strong><br>${escapeHtml(reservation.startsAt)} through ${escapeHtml(reservation.endsAt)}</p><p>You can review your reservation history in the resident portal.</p>`,
    approved ? 'reservation-approved' : 'reservation-denied')
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
      users.last_name AS lastName, users.phone, users.role, users.status, users.resident_type AS residentType,
      users.is_board_member AS isBoardMember, users.is_acc_member AS isAccMember,
      users.is_treasurer AS isTreasurer, users.is_amenities_coordinator AS isAmenitiesCoordinator,
      users.is_president AS isPresident, users.is_vice_president AS isVicePresident, users.is_secretary AS isSecretary,
      users.notify_announcements AS notifyAnnouncements, users.notify_events AS notifyEvents,
      users.property_id AS propertyId,
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

async function requireSuperAdmin(request, env) {
  const user = await requireUser(request, env)
  if (user.role !== 'super_admin') throw new ResponseError('Super administrator access required.', 403)
  return user
}

function canAccessMessage(user, category) {
  return user.role === 'super_admin' || ['general', 'maintenance', 'board'].includes(category) && Boolean(user.isBoardMember)
    || category === 'architectural' && Boolean(user.isAccMember)
    || category === 'treasurer' && Boolean(user.isTreasurer)
    || category === 'amenities' && Boolean(user.isAmenitiesCoordinator)
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

async function clubhouseSettings(env) {
  return env.DB.prepare(`SELECT opens_at AS opensAt, closes_at AS closesAt,
    cleanup_buffer_minutes AS cleanupBufferMinutes, advance_days AS advanceDays,
    max_active_per_household AS maxActivePerHousehold FROM clubhouse_settings WHERE id = 1`).first()
}

function lindaleDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function timeMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number)
  return hours * 60 + minutes
}

async function clubhouseAvailability(env, startsAt, endsAt, excludeReservationId = '') {
  const settings = await clubhouseSettings(env)
  const start = lindaleDateParts(startsAt)
  const end = lindaleDateParts(endsAt)
  const startDay = `${start.year}-${start.month}-${start.day}`
  const endDay = `${end.year}-${end.month}-${end.day}`
  const startMinutes = Number(start.hour) * 60 + Number(start.minute)
  const endMinutes = Number(end.hour) * 60 + Number(end.minute)
  if (startDay !== endDay || startMinutes < timeMinutes(settings.opensAt) || endMinutes > timeMinutes(settings.closesAt)) {
    return { available: false, reason: `Reservations must be within clubhouse hours (${settings.opensAt} to ${settings.closesAt}) on one calendar day.` }
  }
  const blackout = await env.DB.prepare(`SELECT title FROM clubhouse_blackouts
    WHERE starts_at < ?2 AND ends_at > ?1 LIMIT 1`).bind(startsAt, endsAt).first()
  if (blackout) return { available: false, reason: `The clubhouse is unavailable during: ${blackout.title}.` }
  const bufferMilliseconds = settings.cleanupBufferMinutes * 60000
  const bufferedStart = new Date(new Date(startsAt).getTime() - bufferMilliseconds).toISOString()
  const bufferedEnd = new Date(new Date(endsAt).getTime() + bufferMilliseconds).toISOString()
  const conflict = await env.DB.prepare(`SELECT event_name AS eventName FROM clubhouse_reservations
    WHERE status = 'approved' AND id != ?3 AND starts_at < ?2 AND ends_at > ?1 LIMIT 1`)
    .bind(bufferedStart, bufferedEnd, excludeReservationId).first()
  if (conflict) return { available: false, reason: `The requested time conflicts with an approved reservation or its ${settings.cleanupBufferMinutes}-minute cleanup buffer.` }
  return { available: true, settings }
}

async function portalDashboard(request, env) {
  const user = await requireUser(request, env)
  const [announcements, events, documents, reservations, messages, messageReplies, guests, household, poolCards, poolAgreements, boardMembers] = await env.DB.batch([
    env.DB.prepare(`SELECT id, title, body, audience, published_at AS publishedAt FROM announcements
      WHERE published_at <= CURRENT_TIMESTAMP ORDER BY published_at DESC LIMIT 20`),
    env.DB.prepare(`SELECT id, title, description, starts_at AS startsAt, ends_at AS endsAt,
      audience, event_type AS eventType FROM events WHERE status = 'scheduled' AND ends_at >= CURRENT_TIMESTAMP ORDER BY starts_at LIMIT 50`),
    env.DB.prepare(`SELECT id, title, description, document_url AS url, category, audience
      FROM documents ORDER BY category, title`),
    env.DB.prepare(`SELECT id, event_name AS eventName, event_type AS eventType, starts_at AS startsAt, ends_at AS endsAt,
      attendee_count AS attendeeCount, cleaning_method AS cleaningMethod, notes, status,
      decision_reason AS decisionReason, reviewed_at AS reviewedAt, deposit_status AS depositStatus
      FROM clubhouse_reservations WHERE user_id = ?1 ORDER BY starts_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT id, COALESCE(routing_group, category) AS category, message, status, created_at AS createdAt
      FROM contact_messages WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(user.id),
    env.DB.prepare(`SELECT contact_message_replies.id, contact_message_replies.contact_message_id AS messageId,
      contact_message_replies.author_role AS authorRole, contact_message_replies.body,
      contact_message_replies.created_at AS createdAt
      FROM contact_message_replies INNER JOIN contact_messages
        ON contact_messages.id = contact_message_replies.contact_message_id
      WHERE contact_messages.user_id = ?1 ORDER BY contact_message_replies.created_at`).bind(user.id),
    env.DB.prepare(`SELECT id, guest_name AS guestName, starts_on AS startsOn, ends_on AS endsOn,
      pool_responsibility_acknowledged AS poolResponsibilityAcknowledged,
      CASE WHEN status = 'active' AND ends_on < date('now') THEN 'expired' ELSE status END AS status,
      created_at AS createdAt
      FROM guest_registrations WHERE registered_by = ?1 ORDER BY created_at DESC LIMIT 100`).bind(user.id),
    env.DB.prepare(`SELECT id, first_name AS firstName, last_name AS lastName, email, phone, status,
      created_at AS createdAt FROM users WHERE property_id = ?1 AND resident_type = 'household_member'
      ORDER BY created_at DESC`).bind(user.propertyId),
    env.DB.prepare(`SELECT pool_access_cards.id, pool_access_cards.card_number AS cardNumber,
      pool_access_cards.status, pool_access_cards.notes, pool_access_cards.issued_at AS issuedAt,
      assigned.first_name || ' ' || assigned.last_name AS assignedName
      FROM pool_access_cards LEFT JOIN users AS assigned ON assigned.id = pool_access_cards.assigned_user_id
      WHERE pool_access_cards.property_id = ?1 ORDER BY pool_access_cards.issued_at DESC`).bind(user.propertyId),
    env.DB.prepare(`SELECT pool_rules_agreements.id, pool_rules_agreements.rules_version AS rulesVersion,
      pool_rules_agreements.acknowledged_at AS acknowledgedAt,
      users.first_name || ' ' || users.last_name AS signedByName
      FROM pool_rules_agreements INNER JOIN users ON users.id = pool_rules_agreements.user_id
      WHERE pool_rules_agreements.property_id = ?1 ORDER BY pool_rules_agreements.acknowledged_at DESC`).bind(user.propertyId),
    env.DB.prepare(`SELECT id, first_name AS firstName, last_name AS lastName,
      CASE WHEN is_president = 1 THEN 'President'
        WHEN is_vice_president = 1 THEN 'Vice President'
        WHEN is_secretary = 1 THEN 'Secretary'
        WHEN is_treasurer = 1 THEN 'Treasurer'
        ELSE 'Board Member' END AS boardRole
      FROM users WHERE status = 'active' AND is_board_member = 1
      ORDER BY CASE WHEN is_president = 1 THEN 1 WHEN is_vice_president = 1 THEN 2
        WHEN is_secretary = 1 THEN 3 WHEN is_treasurer = 1 THEN 4 ELSE 5 END, last_name, first_name`),
  ])
  const repliesByMessage = messageReplies.results.reduce((result, reply) => {
    if (!result[reply.messageId]) result[reply.messageId] = []
    result[reply.messageId].push(reply)
    return result
  }, {})
  return json({
    announcements: announcements.results,
    events: events.results,
    documents: documents.results,
    reservations: reservations.results,
    messages: messages.results.map((message) => ({ ...message, replies: repliesByMessage[message.id] || [] })),
    guests: guests.results,
    household: user.residentType === 'owner' ? household.results : [],
    poolCards: poolCards.results,
    poolAgreements: poolAgreements.results,
    boardMembers: boardMembers.results,
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
  const admin = await requireAdmin(request, env)
  const [properties, phases, announcements, events, documents, reservations, messages, messageReplies, photos, guests, poolCards,
    clubhouse, blackouts] = await env.DB.batch([
    env.DB.prepare(`SELECT properties.id, properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address,
      properties.status, hoa_phases.name AS phase,
      GROUP_CONCAT(users.first_name || ' ' || users.last_name, ' | ') AS residentNames
      FROM properties INNER JOIN hoa_phases ON hoa_phases.id = properties.phase_id
      LEFT JOIN users ON users.property_id = properties.id
      GROUP BY properties.id, properties.street_number, properties.street_name, properties.street_suffix,
        properties.status, hoa_phases.name
      ORDER BY properties.street_name, properties.street_number`),
    env.DB.prepare('SELECT id, name, status FROM hoa_phases ORDER BY id'),
    env.DB.prepare('SELECT id, title, body, audience, published_at AS publishedAt FROM announcements ORDER BY published_at DESC'),
    env.DB.prepare(`SELECT id, title, description, starts_at AS startsAt, ends_at AS endsAt, audience, event_type AS eventType, status
      FROM events ORDER BY starts_at DESC LIMIT 100`),
    env.DB.prepare(`SELECT id, title, description, category, audience, document_url AS url,
      storage_key AS storageKey, original_name AS originalName, file_size AS fileSize FROM documents ORDER BY category, title`),
    env.DB.prepare(`SELECT clubhouse_reservations.id, clubhouse_reservations.event_name AS eventName,
      clubhouse_reservations.starts_at AS startsAt, clubhouse_reservations.ends_at AS endsAt,
      clubhouse_reservations.attendee_count AS attendeeCount, clubhouse_reservations.event_type AS eventType,
      clubhouse_reservations.cleaning_method AS cleaningMethod, clubhouse_reservations.notes,
      clubhouse_reservations.status, clubhouse_reservations.decision_reason AS decisionReason,
      clubhouse_reservations.override_reason AS overrideReason,
      clubhouse_reservations.created_at AS requestedAt, clubhouse_reservations.reviewed_at AS reviewedAt,
      users.first_name || ' ' || users.last_name AS residentName, users.email,
      properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
      FROM clubhouse_reservations INNER JOIN users ON users.id = clubhouse_reservations.user_id
      INNER JOIN properties ON properties.id = users.property_id
      ORDER BY clubhouse_reservations.starts_at DESC LIMIT 100`),
    env.DB.prepare(`SELECT contact_messages.id, contact_messages.name, contact_messages.email, contact_messages.phone,
      COALESCE(contact_messages.routing_group, contact_messages.category) AS category, contact_messages.message, contact_messages.status,
      contact_messages.admin_notes AS adminNotes, contact_messages.created_at AS createdAt,
      CASE WHEN contact_messages.user_id IS NULL THEN 'Public website' ELSE 'Resident portal' END AS source,
      properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
      FROM contact_messages LEFT JOIN properties ON properties.id = contact_messages.property_id
      WHERE (?1 = 1 OR (?2 = 1 AND contact_messages.category IN ('general', 'maintenance', 'board') AND contact_messages.routing_group IS NULL)
        OR (?3 = 1 AND contact_messages.category = 'architectural')
        OR (?4 = 1 AND contact_messages.routing_group = 'treasurer')
        OR (?5 = 1 AND contact_messages.routing_group = 'amenities'))
      ORDER BY contact_messages.created_at DESC LIMIT 200`).bind(admin.role === 'super_admin' ? 1 : 0,
      admin.isBoardMember ? 1 : 0, admin.isAccMember ? 1 : 0, admin.isTreasurer ? 1 : 0,
      admin.isAmenitiesCoordinator ? 1 : 0),
    env.DB.prepare(`SELECT id, contact_message_id AS messageId, author_role AS authorRole, body,
      created_at AS createdAt FROM contact_message_replies ORDER BY created_at`),
    env.DB.prepare(`SELECT id, original_name AS originalName, mime_type AS mimeType, file_size AS fileSize,
      width, height, alt_text AS altText, caption, sort_order AS sortOrder, status, created_at AS createdAt
      FROM gallery_photos ORDER BY sort_order, created_at`),
    env.DB.prepare(`SELECT guest_registrations.id, guest_registrations.guest_name AS guestName,
      guest_registrations.starts_on AS startsOn, guest_registrations.ends_on AS endsOn,
      guest_registrations.pool_responsibility_acknowledged AS poolResponsibilityAcknowledged,
      CASE WHEN guest_registrations.status = 'active' AND guest_registrations.ends_on < date('now')
        THEN 'expired' ELSE guest_registrations.status END AS status,
      guest_registrations.created_at AS createdAt, users.first_name || ' ' || users.last_name AS registeredByName,
      properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
      FROM guest_registrations INNER JOIN users ON users.id = guest_registrations.registered_by
      INNER JOIN properties ON properties.id = guest_registrations.property_id
      ORDER BY guest_registrations.ends_on DESC, guest_registrations.created_at DESC`),
    env.DB.prepare(`SELECT pool_access_cards.id, pool_access_cards.card_number AS cardNumber,
      pool_access_cards.status, pool_access_cards.notes, pool_access_cards.issued_at AS issuedAt,
      pool_access_cards.updated_at AS updatedAt, assigned.first_name || ' ' || assigned.last_name AS assignedName,
      properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
      FROM pool_access_cards INNER JOIN properties ON properties.id = pool_access_cards.property_id
      LEFT JOIN users AS assigned ON assigned.id = pool_access_cards.assigned_user_id
      ORDER BY CASE pool_access_cards.status WHEN 'lost' THEN 0 WHEN 'stolen' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
      properties.street_name, properties.street_number`),
    env.DB.prepare(`SELECT opens_at AS opensAt, closes_at AS closesAt,
      cleanup_buffer_minutes AS cleanupBufferMinutes, advance_days AS advanceDays,
      max_active_per_household AS maxActivePerHousehold FROM clubhouse_settings WHERE id = 1`),
    env.DB.prepare(`SELECT id, title, starts_at AS startsAt, ends_at AS endsAt, notes,
      created_at AS createdAt FROM clubhouse_blackouts ORDER BY starts_at DESC LIMIT 200`),
  ])
  const repliesByMessage = messageReplies.results.reduce((result, reply) => {
    if (!result[reply.messageId]) result[reply.messageId] = []
    result[reply.messageId].push(reply)
    return result
  }, {})
  return json({ properties: properties.results, phases: phases.results, announcements: announcements.results,
    events: events.results, documents: documents.results, reservations: reservations.results,
    messages: messages.results.map((message) => ({ ...message, replies: repliesByMessage[message.id] || [] })),
    photos: photos.results, guests: guests.results, poolCards: poolCards.results,
    clubhouse: clubhouse.results[0], blackouts: blackouts.results })
}

async function publicGallery(env) {
  const result = await env.DB.prepare(`SELECT id, alt_text AS altText, caption, width, height
    FROM gallery_photos WHERE status = 'active' ORDER BY sort_order, created_at`).all()
  return json({ photos: result.results }, { headers: { 'cache-control': 'public, max-age=60' } })
}

async function galleryImage(env, id) {
  const photo = await env.DB.prepare(`SELECT storage_key AS storageKey, mime_type AS mimeType
    FROM gallery_photos WHERE id = ?1 AND status = 'active'`).bind(id).first()
  if (!photo) throw new ResponseError('Photo not found.', 404)
  const object = await env.DOCUMENTS.get(photo.storageKey)
  if (!object) throw new ResponseError('Photo file not found.', 404)
  return new Response(object.body, { headers: {
    'cache-control': 'public, max-age=86400',
    'content-length': String(object.size),
    'content-type': photo.mimeType,
    'x-content-type-options': 'nosniff',
  } })
}

async function adminGalleryImage(request, env, id) {
  await requireAdmin(request, env)
  const photo = await env.DB.prepare('SELECT storage_key AS storageKey, mime_type AS mimeType FROM gallery_photos WHERE id = ?1').bind(id).first()
  if (!photo) throw new ResponseError('Photo not found.', 404)
  const object = await env.DOCUMENTS.get(photo.storageKey)
  if (!object) throw new ResponseError('Photo file not found.', 404)
  return new Response(object.body, { headers: { 'cache-control': 'private, no-store', 'content-type': photo.mimeType, 'x-content-type-options': 'nosniff' } })
}

async function uploadGalleryPhoto(request, env) {
  const admin = await requireAdmin(request, env)
  const photoCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM gallery_photos').first('count')
  if (photoCount >= 15) throw new ResponseError('The gallery is limited to 15 photos. Delete a photo before uploading another.', 409)
  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_GALLERY_BYTES + 65536) {
    throw new ResponseError('Photos must be 10 MB or smaller.', 413)
  }
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size <= 0) throw new ResponseError('Choose a photo to upload.', 400)
  if (file.size > MAX_GALLERY_BYTES) throw new ResponseError('Photos must be 10 MB or smaller.', 413)
  if (!GALLERY_TYPES.has(file.type)) throw new ResponseError('Upload a JPEG, PNG, or WebP image.', 400)
  const altText = cleanText(form.get('altText'), 300, true)
  const caption = cleanText(form.get('caption'), 500)
  const width = Number(form.get('width'))
  const height = Number(form.get('height'))
  const id = crypto.randomUUID()
  const name = safeFileName(file.name)
  const extension = file.type === 'image/webp' ? '.webp' : file.type === 'image/png' ? '.png' : '.jpg'
  const storageKey = `gallery/${id}/${crypto.randomUUID()}${extension}`
  const maximumOrder = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM gallery_photos').first('nextOrder')
  await env.DOCUMENTS.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: admin.id, photoId: id } })
  try {
    await env.DB.prepare(`INSERT INTO gallery_photos (id, storage_key, original_name, mime_type, file_size,
      width, height, alt_text, caption, sort_order, uploaded_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
      .bind(id, storageKey, name, file.type, file.size, Number.isInteger(width) && width > 0 ? width : null,
        Number.isInteger(height) && height > 0 ? height : null, altText, caption, maximumOrder, admin.id).run()
  } catch (error) {
    await env.DOCUMENTS.delete(storageKey)
    throw error
  }
  return json({ id }, { status: 201 })
}

async function updateGalleryPhoto(request, env, id) {
  await requireAdmin(request, env)
  const body = await readJson(request)
  const status = ['active', 'hidden'].includes(body.status) ? body.status : null
  const sortOrder = Number(body.sortOrder)
  if (!status || !Number.isInteger(sortOrder)) throw new ResponseError('Enter valid photo settings.', 400)
  const result = await env.DB.prepare(`UPDATE gallery_photos SET alt_text = ?1, caption = ?2, status = ?3,
    sort_order = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5`).bind(cleanText(body.altText, 300, true),
    cleanText(body.caption, 500), status, sortOrder, id).run()
  if (!result.meta.changes) throw new ResponseError('Photo not found.', 404)
  return json({ status: 'updated' })
}

async function deleteGalleryPhoto(request, env, id) {
  await requireAdmin(request, env)
  const photo = await env.DB.prepare('SELECT storage_key AS storageKey FROM gallery_photos WHERE id = ?1').bind(id).first()
  if (!photo) throw new ResponseError('Photo not found.', 404)
  await env.DB.prepare('DELETE FROM gallery_photos WHERE id = ?1').bind(id).run()
  await env.DOCUMENTS.delete(photo.storageKey)
  return json({ status: 'deleted' })
}

function icsText(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function icsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

async function downloadEventCalendar(request, env, id) {
  const event = await env.DB.prepare(`SELECT id, title, description, starts_at AS startsAt, ends_at AS endsAt,
    audience, status FROM events WHERE id = ?1`).bind(id).first()
  if (!event || event.status !== 'scheduled') throw new ResponseError('Event not found.', 404)
  if (event.audience !== 'public') await requireUser(request, env)
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Penny Lane HOA//Events//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${event.id}@pennylanehoa.net`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.startsAt)}`, `DTEND:${icsDate(event.endsAt)}`, `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n')
  return new Response(body, { headers: {
    'cache-control': event.audience === 'public' ? 'public, max-age=300' : 'private, no-store',
    'content-disposition': `attachment; filename="penny-lane-event-${event.id}.ics"`,
    'content-type': 'text/calendar; charset=utf-8',
    'x-content-type-options': 'nosniff',
  } })
}

async function createContactMessage(request, env) {
  const body = await readJson(request)
  await verifyTurnstile(body, env)
  const name = cleanText(body.name, 160, true)
  const email = cleanText(body.email, 254, true).toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ResponseError('Enter a valid email address.', 400)
  const phone = cleanText(body.phone, 30)
  const category = ['general', 'maintenance', 'architectural', 'board'].includes(body.category) ? body.category : 'general'
  const message = cleanText(body.message, 5000, true)
  const recent = await env.DB.prepare(`SELECT id FROM contact_messages WHERE email = ?1
    AND created_at >= datetime('now', '-1 minute') LIMIT 1`).bind(email).first()
  if (recent) throw new ResponseError('Please wait before sending another message.', 429)
  const id = crypto.randomUUID()
  const ip = request.headers.get('cf-connecting-ip') || ''
  const ipHash = ip ? await sha256(ip) : null
  const linkedUser = await env.DB.prepare('SELECT id, property_id AS propertyId FROM users WHERE email = ?1 COLLATE NOCASE').bind(email).first()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contact_messages (id, name, email, phone, category, message, submitted_ip_hash, user_id, property_id)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(id, name, email, phone, category, message,
      ipHash, linkedUser?.id || null, linkedUser?.propertyId || null),
    env.DB.prepare(`INSERT INTO communication_log (id, property_id, user_id, direction, channel, recipient_or_sender,
      subject, summary, delivery_status, related_type, related_id) VALUES (?1, ?2, ?3, 'inbound', 'website',
      ?4, ?5, ?6, 'recorded', 'contact', ?7)`).bind(crypto.randomUUID(), linkedUser?.propertyId || null,
      linkedUser?.id || null, email, `Website contact: ${category}`, message.slice(0, 500), id),
  ])
  try {
    await sendTransactionalEmail(env, await messageRecipients(env, category),
      `Website contact: ${category} - ${name}`,
      `<p>A new website message was submitted.</p><p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})${phone ? `<br><strong>Phone:</strong> ${escapeHtml(phone)}` : ''}<br><strong>Category:</strong> ${escapeHtml(category)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p>The message is also stored in the administration dashboard.</p>`,
      'website-contact', { name, email })
  } catch (error) {
    console.error(JSON.stringify({ message: 'Contact notification failed', contactId: id, detail: String(error) }))
  }
  return json({ id, status: 'received' }, { status: 201 })
}

async function createResidentMessage(request, env) {
  const user = await requireUser(request, env)
  const body = await readJson(request)
  const category = ['general', 'maintenance', 'architectural', 'board', 'treasurer', 'amenities'].includes(body.category) ? body.category : 'general'
  const storedCategory = ['treasurer', 'amenities'].includes(category) ? 'general' : category
  const routingGroup = ['treasurer', 'amenities'].includes(category) ? category : null
  const message = cleanText(body.message, 5000, true)
  const recent = await env.DB.prepare(`SELECT id FROM contact_messages WHERE user_id = ?1
    AND created_at >= datetime('now', '-1 minute') LIMIT 1`).bind(user.id).first()
  if (recent) throw new ResponseError('Please wait before sending another message.', 429)
  const id = crypto.randomUUID()
  const name = `${user.firstName} ${user.lastName}`
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contact_messages (id, name, email, phone, category, message, user_id, property_id, routing_group)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(id, name, user.email, user.phone, storedCategory, message,
      user.id, user.propertyId, routingGroup),
    env.DB.prepare(`INSERT INTO communication_log (id, property_id, user_id, direction, channel, recipient_or_sender,
      subject, summary, delivery_status, related_type, related_id) VALUES (?1, ?2, ?3, 'inbound', 'website',
      ?4, ?5, ?6, 'recorded', 'contact', ?7)`).bind(crypto.randomUUID(), user.propertyId, user.id, user.email,
      `Resident portal message: ${category}`, message.slice(0, 500), id),
  ])
  try {
    await sendTransactionalEmail(env, await messageRecipients(env, category),
      `Resident message: ${category} - ${name}`,
      `<p>A resident sent a message through the portal.</p><p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(user.email)})${user.phone ? `<br><strong>Phone:</strong> ${escapeHtml(user.phone)}` : ''}<br><strong>Property:</strong> ${escapeHtml(user.address)}<br><strong>Category:</strong> ${escapeHtml(category)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p>The message is also stored in the administration dashboard.</p>`,
      'resident-message', { name, email: user.email })
  } catch (error) {
    console.error(JSON.stringify({ message: 'Resident message notification failed', contactId: id, detail: String(error) }))
  }
  return json({ id, status: 'received' }, { status: 201 })
}

function registrationDate(value) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T12:00:00Z`).getTime())) {
    throw new ResponseError('Enter valid guest stay dates.', 400)
  }
  return text
}

async function createGuestRegistration(request, env) {
  const user = await requireUser(request, env)
  const body = await readJson(request)
  const guestName = cleanText(body.guestName, 160, true)
  const startsOn = registrationDate(body.startsOn)
  const endsOn = registrationDate(body.endsOn)
  if (endsOn < startsOn) throw new ResponseError('The guest departure date cannot be before the arrival date.', 400)
  if (endsOn < new Date().toISOString().slice(0, 10)) throw new ResponseError('The guest stay must not already be over.', 400)
  if (body.poolResponsibilityAcknowledged !== true) {
    throw new ResponseError('You must acknowledge responsibility for your guest at the pool.', 400)
  }
  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO guest_registrations (id, property_id, registered_by, guest_name, starts_on,
      ends_on, pool_responsibility_acknowledged) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)`)
      .bind(id, user.propertyId, user.id, guestName, startsOn, endsOn),
    env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'guest.registered', 'property', ?2, ?3)`).bind(user.id, String(user.propertyId),
      JSON.stringify({ guestRegistrationId: id, guestName, startsOn, endsOn, poolResponsibilityAcknowledged: true })),
  ])
  try {
    await sendTransactionalEmail(env, await activeAdminRecipients(env), `Guest registered: ${guestName}`,
      `<p>A resident registered a guest.</p><p><strong>Guest:</strong> ${escapeHtml(guestName)}<br><strong>Stay:</strong> ${escapeHtml(startsOn)} through ${escapeHtml(endsOn)}<br><strong>Property:</strong> ${escapeHtml(user.address)}<br><strong>Registered by:</strong> ${escapeHtml(`${user.firstName} ${user.lastName}`)}</p><p>The resident accepted responsibility for the guest's unsupervised pool access during the registered stay.</p>`,
      'guest-registered', null, false)
  } catch (error) {
    console.error(JSON.stringify({ message: 'Guest registration notification failed', guestRegistrationId: id, detail: String(error) }))
  }
  return json({ id, status: 'active' }, { status: 201 })
}

async function revokeGuestRegistration(request, env, id) {
  const user = await requireUser(request, env)
  const guest = await env.DB.prepare(`SELECT id, property_id AS propertyId, guest_name AS guestName
    FROM guest_registrations WHERE id = ?1 AND registered_by = ?2`).bind(id, user.id).first()
  if (!guest) throw new ResponseError('Guest registration not found.', 404)
  await env.DB.batch([
    env.DB.prepare(`UPDATE guest_registrations SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?1`).bind(id),
    env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'guest.revoked', 'property', ?2, ?3)`).bind(user.id, String(guest.propertyId),
      JSON.stringify({ guestRegistrationId: id, guestName: guest.guestName })),
  ])
  try {
    await sendTransactionalEmail(env, await activeAdminRecipients(env), `Guest registration revoked: ${guest.guestName}`,
      `<p>A resident revoked a guest registration.</p><p><strong>Guest:</strong> ${escapeHtml(guest.guestName)}<br><strong>Property:</strong> ${escapeHtml(user.address)}<br><strong>Revoked by:</strong> ${escapeHtml(`${user.firstName} ${user.lastName}`)}</p>`,
      'guest-revoked', null, false)
  } catch (error) {
    console.error(JSON.stringify({ message: 'Guest revocation notification failed', guestRegistrationId: id, detail: String(error) }))
  }
  return json({ status: 'revoked' })
}

async function updateContactMessage(request, env, id) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const status = ['new', 'read', 'closed'].includes(body.status) ? body.status : null
  if (!status) throw new ResponseError('Select a valid message status.', 400)
  const notes = cleanText(body.adminNotes, 3000)
  const message = await env.DB.prepare('SELECT COALESCE(routing_group, category) AS category FROM contact_messages WHERE id = ?1').bind(id).first()
  if (!message) throw new ResponseError('Message not found.', 404)
  if (!canAccessMessage(admin, message.category)) throw new ResponseError('Not permitted.', 403)
  const result = await env.DB.prepare(`UPDATE contact_messages SET status = ?1, admin_notes = ?2,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?3`).bind(status, notes, id).run()
  if (!result.meta.changes) throw new ResponseError('Message not found.', 404)
  return json({ status })
}

async function replyToContactMessage(request, env, id) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const reply = cleanText(body.reply, 5000, true)
  const message = await env.DB.prepare(`SELECT id, name, email, category, message, user_id AS userId,
    property_id AS propertyId FROM contact_messages WHERE id = ?1`).bind(id).first()
  if (!message) throw new ResponseError('Message not found.', 404)
  if (!canAccessMessage(admin, message.category)) throw new ResponseError('Not permitted.', 403)
  let emailStatus = 'sent'
  try {
    await sendTransactionalEmail(env, [{ email: message.email, name: message.name }],
      `Re: Your Penny Lane HOA ${message.category} message`,
      `<p>Hello ${escapeHtml(message.name)},</p><p>${escapeHtml(reply).replace(/\n/g, '<br>')}</p><hr><p><strong>Your original message:</strong></p><p>${escapeHtml(message.message).replace(/\n/g, '<br>')}</p>`,
      'message-reply', null, false)
  } catch (error) {
    emailStatus = 'failed'
    console.error(JSON.stringify({ message: 'Portal reply email failed', contactId: id, detail: String(error) }))
  }
  const replyId = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(`UPDATE contact_messages SET status = 'read', updated_at = CURRENT_TIMESTAMP WHERE id = ?1`).bind(id),
    env.DB.prepare(`INSERT INTO contact_message_replies (id, contact_message_id, author_user_id, author_role, body, email_status)
      VALUES (?1, ?2, ?3, 'admin', ?4, ?5)`).bind(replyId, id, admin.id, reply, emailStatus),
    env.DB.prepare(`INSERT INTO communication_log (id, property_id, user_id, direction, channel,
      recipient_or_sender, subject, summary, delivery_status, related_type, related_id)
      VALUES (?1, ?2, ?3, 'outbound', 'email', ?4, ?5, ?6, ?7, 'contact_reply', ?8)`)
      .bind(crypto.randomUUID(), message.propertyId, message.userId, message.email,
        `Re: Your Penny Lane HOA ${message.category} message`, reply.slice(0, 500), emailStatus, id),
    env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'message.replied', 'contact_message', ?2, ?3)`).bind(admin.id, id,
      JSON.stringify({ email: message.email, propertyId: message.propertyId, reply: reply.slice(0, 500) })),
  ])
  return json({ id: replyId, status: emailStatus === 'sent' ? 'sent' : 'recorded' })
}

async function replyToResidentMessage(request, env, id) {
  const user = await requireUser(request, env)
  const body = await readJson(request)
  const reply = cleanText(body.reply, 5000, true)
  const message = await env.DB.prepare(`SELECT id, COALESCE(routing_group, category) AS category FROM contact_messages
    WHERE id = ?1 AND user_id = ?2`).bind(id, user.id).first()
  if (!message) throw new ResponseError('Message not found.', 404)
  const recent = await env.DB.prepare(`SELECT id FROM contact_message_replies WHERE contact_message_id = ?1
    AND author_role = 'resident' AND created_at >= datetime('now', '-1 minute') LIMIT 1`).bind(id).first()
  if (recent) throw new ResponseError('Please wait before sending another reply.', 429)
  let emailStatus = 'sent'
  try {
    await sendTransactionalEmail(env, await messageRecipients(env, message.category),
      `Resident reply: ${message.category} - ${user.firstName} ${user.lastName}`,
      `<p>A resident replied to a message in the portal.</p><p><strong>From:</strong> ${escapeHtml(`${user.firstName} ${user.lastName}`)} (${escapeHtml(user.email)})<br><strong>Property:</strong> ${escapeHtml(user.address)}<br><strong>Category:</strong> ${escapeHtml(message.category)}</p><p>${escapeHtml(reply).replace(/\n/g, '<br>')}</p><p>The full conversation is stored in the administration dashboard.</p>`,
      'resident-message-reply', null, false)
  } catch (error) {
    emailStatus = 'failed'
    console.error(JSON.stringify({ message: 'Resident reply notification failed', contactId: id, detail: String(error) }))
  }
  const replyId = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contact_message_replies (id, contact_message_id, author_user_id, author_role, body, email_status)
      VALUES (?1, ?2, ?3, 'resident', ?4, ?5)`).bind(replyId, id, user.id, reply, emailStatus),
    env.DB.prepare(`UPDATE contact_messages SET status = 'new', updated_at = CURRENT_TIMESTAMP WHERE id = ?1`).bind(id),
    env.DB.prepare(`INSERT INTO communication_log (id, property_id, user_id, direction, channel,
      recipient_or_sender, subject, summary, delivery_status, related_type, related_id)
      VALUES (?1, ?2, ?3, 'inbound', 'website', ?4, ?5, ?6, 'recorded', 'contact_reply', ?7)`)
      .bind(crypto.randomUUID(), user.propertyId, user.id, user.email,
        `Resident reply: ${message.category}`, reply.slice(0, 500), id),
  ])
  return json({ id: replyId, status: 'received' }, { status: 201 })
}

async function deleteContactMessage(request, env, id, superAdminOnly = false) {
  const user = await requireUser(request, env)
  if (superAdminOnly && user.role !== 'super_admin') throw new ResponseError('Super administrator access required.', 403)
  const message = await env.DB.prepare('SELECT id, user_id AS userId FROM contact_messages WHERE id = ?1').bind(id).first()
  if (!message) throw new ResponseError('Message not found.', 404)
  if (user.role !== 'super_admin' && message.userId !== user.id) throw new ResponseError('Not permitted.', 403)
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM communication_log WHERE related_id = ?1
      AND related_type IN ('contact', 'contact_reply')`).bind(id),
    env.DB.prepare(`DELETE FROM audit_log WHERE target_id = ?1
      AND target_type = 'contact_message'`).bind(id),
    env.DB.prepare('DELETE FROM contact_messages WHERE id = ?1').bind(id),
  ])
  return json({ status: 'deleted' })
}

async function deleteEventPermanently(request, env, id) {
  await requireSuperAdmin(request, env)
  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?1').bind(id).first()
  if (!event) throw new ResponseError('Event not found.', 404)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM clubhouse_reservations WHERE event_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM events WHERE id = ?1').bind(id),
  ])
  return json({ status: 'deleted' })
}

async function deleteReservationPermanently(request, env, id) {
  await requireSuperAdmin(request, env)
  const reservation = await env.DB.prepare('SELECT event_id AS eventId FROM clubhouse_reservations WHERE id = ?1').bind(id).first()
  if (!reservation) throw new ResponseError('Reservation not found.', 404)
  const statements = [
    env.DB.prepare('DELETE FROM audit_log WHERE target_id = ?1 AND target_type = ?2').bind(id, 'reservation'),
    env.DB.prepare('DELETE FROM clubhouse_reservations WHERE id = ?1').bind(id),
  ]
  if (reservation.eventId) statements.push(env.DB.prepare('DELETE FROM events WHERE id = ?1').bind(reservation.eventId))
  await env.DB.batch(statements)
  return json({ status: 'deleted' })
}

async function deleteHistoryRecord(request, env, kind, id) {
  await requireSuperAdmin(request, env)
  const table = kind === 'communications' ? 'communication_log' : kind === 'audit' ? 'audit_log' : null
  if (!table) throw new ResponseError('History record not found.', 404)
  const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(id).run()
  if (!result.meta.changes) throw new ResponseError('History record not found.', 404)
  return json({ status: 'deleted' })
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
  const title = cleanText(body.title, 140, true)
  const announcementBody = cleanText(body.body, 5000, true)
  await env.DB.prepare(`INSERT INTO announcements (id, title, body, audience, created_by) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(id, title, announcementBody, audience, admin.id).run()
  if (body.notifyResidents === true) {
    try {
      await sendResidentBroadcast(env, await activeResidentRecipients(env, 'notify_announcements'), `HOA announcement: ${title}`,
        `<p>A new Penny Lane HOA announcement has been posted.</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(announcementBody).replace(/\n/g, '<br>')}</p><p>Sign in to the resident portal for community information and documents.</p>`, 'hoa-announcement')
    } catch (error) { console.error(JSON.stringify({ message: 'Announcement broadcast failed', announcementId: id, detail: String(error) })) }
  }
  return json({ id }, { status: 201 })
}

async function createEvent(request, env) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const range = validDateRange(body.startsAt, body.endsAt)
  const audience = ['public', 'members'].includes(body.audience) ? body.audience : 'members'
  const eventType = ['community', 'meeting'].includes(body.eventType) ? body.eventType : 'community'
  const id = crypto.randomUUID()
  const title = cleanText(body.title, 140, true)
  const description = cleanText(body.description, 3000)
  await env.DB.prepare(`INSERT INTO events (id, title, description, starts_at, ends_at, audience, event_type, created_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(id, title, description,
    range.startsAt, range.endsAt, audience, eventType, admin.id).run()
  if (body.notifyResidents === true) {
    try {
      await sendResidentBroadcast(env, await activeResidentRecipients(env, 'notify_events'), `HOA event: ${title}`,
        `<p>A new Penny Lane HOA event has been posted.</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(range.startsAt)} through ${escapeHtml(range.endsAt)}</p>${description ? `<p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>` : ''}<p>Sign in to the resident portal to view the calendar.</p>`, 'hoa-event')
    } catch (error) { console.error(JSON.stringify({ message: 'Event broadcast failed', eventId: id, detail: String(error) })) }
  }
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

async function propertyDetails(request, env, propertyId) {
  await requireAdmin(request, env)
  const property = await env.DB.prepare(`SELECT properties.id,
    properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address,
    properties.city, properties.state, properties.postal_code AS postalCode, properties.status,
    hoa_phases.name AS phase, properties.created_at AS createdAt
    FROM properties INNER JOIN hoa_phases ON hoa_phases.id = properties.phase_id WHERE properties.id = ?1`)
    .bind(propertyId).first()
  if (!property) throw new ResponseError('Property not found.', 404)
  const [residents, reservations, contacts, communications, poolCards, guests, poolAgreements, audit] = await env.DB.batch([
    env.DB.prepare(`SELECT id, first_name AS firstName, last_name AS lastName, email, phone, resident_type AS residentType,
      role, status, created_at AS createdAt, last_login_at AS lastLoginAt FROM users WHERE property_id = ?1
      ORDER BY CASE resident_type WHEN 'owner' THEN 0 WHEN 'tenant' THEN 1 ELSE 2 END, last_name, first_name`).bind(propertyId),
    env.DB.prepare(`SELECT clubhouse_reservations.id, clubhouse_reservations.event_name AS eventName,
      clubhouse_reservations.starts_at AS startsAt, clubhouse_reservations.ends_at AS endsAt,
      clubhouse_reservations.status, users.first_name || ' ' || users.last_name AS residentName
      FROM clubhouse_reservations INNER JOIN users ON users.id = clubhouse_reservations.user_id
      WHERE users.property_id = ?1 ORDER BY clubhouse_reservations.starts_at DESC LIMIT 100`).bind(propertyId),
    env.DB.prepare(`SELECT id, name, email, COALESCE(routing_group, category) AS category, message, status, created_at AS createdAt
      FROM contact_messages WHERE property_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(propertyId),
    env.DB.prepare(`SELECT id, user_id AS userId, direction, channel, recipient_or_sender AS correspondent,
      subject, summary, delivery_status AS deliveryStatus, related_type AS relatedType, created_at AS createdAt
      FROM communication_log WHERE property_id = ?1 ORDER BY created_at DESC LIMIT 200`).bind(propertyId),
    env.DB.prepare(`SELECT pool_access_cards.id, pool_access_cards.card_number AS cardNumber,
      pool_access_cards.assigned_user_id AS assignedUserId, pool_access_cards.status, pool_access_cards.notes,
      pool_access_cards.issued_at AS issuedAt, pool_access_cards.updated_at AS updatedAt,
      assigned.first_name || ' ' || assigned.last_name AS assignedName
      FROM pool_access_cards LEFT JOIN users AS assigned ON assigned.id = pool_access_cards.assigned_user_id
      WHERE pool_access_cards.property_id = ?1 ORDER BY pool_access_cards.issued_at DESC`).bind(propertyId),
    env.DB.prepare(`SELECT guest_registrations.id, guest_registrations.guest_name AS guestName,
      guest_registrations.starts_on AS startsOn, guest_registrations.ends_on AS endsOn,
      guest_registrations.pool_responsibility_acknowledged AS poolResponsibilityAcknowledged,
      CASE WHEN guest_registrations.status = 'active' AND guest_registrations.ends_on < date('now')
        THEN 'expired' ELSE guest_registrations.status END AS status, guest_registrations.created_at AS createdAt,
      users.first_name || ' ' || users.last_name AS registeredByName
      FROM guest_registrations INNER JOIN users ON users.id = guest_registrations.registered_by
      WHERE guest_registrations.property_id = ?1 ORDER BY guest_registrations.created_at DESC LIMIT 200`).bind(propertyId),
    env.DB.prepare(`SELECT pool_rules_agreements.id, pool_rules_agreements.user_id AS userId,
      pool_rules_agreements.rules_version AS rulesVersion, pool_rules_agreements.acknowledgement_text AS acknowledgementText,
      pool_rules_agreements.acknowledged_at AS acknowledgedAt, users.first_name || ' ' || users.last_name AS signedByName,
      users.email, users.resident_type AS residentType FROM pool_rules_agreements
      INNER JOIN users ON users.id = pool_rules_agreements.user_id
      WHERE pool_rules_agreements.property_id = ?1 ORDER BY pool_rules_agreements.acknowledged_at DESC`).bind(propertyId),
    env.DB.prepare(`SELECT audit_log.id, audit_log.action, audit_log.target_type AS targetType,
      audit_log.target_id AS targetId, audit_log.details_json AS detailsJson, audit_log.created_at AS createdAt,
      actor.first_name || ' ' || actor.last_name AS actorName FROM audit_log
      LEFT JOIN users AS actor ON actor.id = audit_log.actor_user_id
      WHERE (audit_log.target_type = 'property' AND audit_log.target_id = CAST(?1 AS TEXT))
        OR (audit_log.target_type = 'user' AND audit_log.target_id IN (SELECT id FROM users WHERE property_id = ?1))
      ORDER BY audit_log.created_at DESC LIMIT 100`).bind(propertyId),
  ])
  return json({ property, residents: residents.results, reservations: reservations.results,
    contacts: contacts.results, communications: communications.results, poolCards: poolCards.results,
    guests: guests.results, poolAgreements: poolAgreements.results, audit: audit.results })
}

async function createPoolCard(request, env, propertyId) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const cardNumber = cleanText(body.cardNumber, 100, true).toUpperCase()
  const notes = cleanText(body.notes, 1000)
  const assignedUserId = cleanText(body.assignedUserId, 100)
  const property = await env.DB.prepare('SELECT id FROM properties WHERE id = ?1').bind(propertyId).first()
  if (!property) throw new ResponseError('Property not found.', 404)
  if (assignedUserId) {
    const resident = await env.DB.prepare('SELECT id FROM users WHERE id = ?1 AND property_id = ?2').bind(assignedUserId, propertyId).first()
    if (!resident) throw new ResponseError('Select a resident registered to this property.', 400)
  }
  const id = crypto.randomUUID()
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pool_access_cards (id, card_number, property_id, assigned_user_id, notes, updated_by)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(id, cardNumber, propertyId, assignedUserId, notes, admin.id),
      env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
        VALUES (?1, 'pool_card.issued', 'property', ?2, ?3)`).bind(admin.id, String(propertyId),
        JSON.stringify({ poolCardId: id, cardNumber, assignedUserId })),
    ])
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ResponseError('That pool card ID is already recorded.', 409)
    throw error
  }
  return json({ id, status: 'active' }, { status: 201 })
}

async function updatePoolCard(request, env, id) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const status = ['active', 'lost', 'stolen', 'returned', 'deactivated'].includes(body.status) ? body.status : null
  if (!status) throw new ResponseError('Select a valid pool card status.', 400)
  const existing = await env.DB.prepare(`SELECT pool_access_cards.property_id AS propertyId,
    pool_access_cards.card_number AS cardNumber, pool_access_cards.status,
    properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
    FROM pool_access_cards INNER JOIN properties ON properties.id = pool_access_cards.property_id
    WHERE pool_access_cards.id = ?1`).bind(id).first()
  if (!existing) throw new ResponseError('Pool card not found.', 404)
  const assignedUserId = cleanText(body.assignedUserId, 100)
  if (assignedUserId) {
    const resident = await env.DB.prepare('SELECT id FROM users WHERE id = ?1 AND property_id = ?2').bind(assignedUserId, existing.propertyId).first()
    if (!resident) throw new ResponseError('Select a resident registered to this property.', 400)
  }
  const notes = cleanText(body.notes, 1000)
  await env.DB.batch([
    env.DB.prepare(`UPDATE pool_access_cards SET assigned_user_id = ?1, status = ?2, notes = ?3,
      updated_at = CURRENT_TIMESTAMP, updated_by = ?4 WHERE id = ?5`).bind(assignedUserId, status, notes, admin.id, id),
    env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'pool_card.updated', 'property', ?2, ?3)`).bind(admin.id, String(existing.propertyId),
      JSON.stringify({ poolCardId: id, cardNumber: existing.cardNumber, status, assignedUserId })),
  ])
  if (['lost', 'stolen'].includes(status) && status !== existing.status) {
    try {
      await sendTransactionalEmail(env, await activeAdminRecipients(env), `Pool card reported ${status}: ${existing.cardNumber}`,
        `<p>A pool access card was marked <strong>${status}</strong>.</p><p><strong>Card ID:</strong> ${escapeHtml(existing.cardNumber)}<br><strong>Property:</strong> ${escapeHtml(existing.address)}<br><strong>Updated by:</strong> ${escapeHtml(`${admin.firstName} ${admin.lastName}`)}</p>${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}`,
        `pool-card-${status}`, null, false)
    } catch (error) {
      console.error(JSON.stringify({ message: 'Pool card status notification failed', poolCardId: id, detail: String(error) }))
    }
  }
  return json({ status })
}

async function updateClubhouseSettings(request, env) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const opensAt = String(body.opensAt || '')
  const closesAt = String(body.closesAt || '')
  const cleanupBufferMinutes = Number(body.cleanupBufferMinutes)
  const advanceDays = Number(body.advanceDays)
  const maxActivePerHousehold = Number(body.maxActivePerHousehold)
  if (!/^\d{2}:\d{2}$/.test(opensAt) || !/^\d{2}:\d{2}$/.test(closesAt)
    || timeMinutes(opensAt) >= timeMinutes(closesAt)) throw new ResponseError('Enter valid clubhouse operating hours.', 400)
  if (!Number.isInteger(cleanupBufferMinutes) || cleanupBufferMinutes < 0 || cleanupBufferMinutes > 240
    || !Number.isInteger(advanceDays) || advanceDays < 1 || advanceDays > 365
    || !Number.isInteger(maxActivePerHousehold) || maxActivePerHousehold < 1 || maxActivePerHousehold > 10) {
    throw new ResponseError('Enter valid clubhouse reservation limits.', 400)
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE clubhouse_settings SET opens_at = ?1, closes_at = ?2,
      cleanup_buffer_minutes = ?3, advance_days = ?4, max_active_per_household = ?5,
      updated_at = CURRENT_TIMESTAMP, updated_by = ?6 WHERE id = 1`).bind(opensAt, closesAt,
      cleanupBufferMinutes, advanceDays, maxActivePerHousehold, admin.id),
    env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'clubhouse.settings_updated', 'clubhouse', 'settings', ?2)`).bind(admin.id,
      JSON.stringify({ opensAt, closesAt, cleanupBufferMinutes, advanceDays, maxActivePerHousehold })),
  ])
  return json({ status: 'updated' })
}

async function createClubhouseBlackout(request, env) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const range = validDateRange(body.startsAt, body.endsAt)
  const id = crypto.randomUUID()
  const title = cleanText(body.title, 140, true)
  const notes = cleanText(body.notes, 1000)
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO clubhouse_blackouts (id, title, starts_at, ends_at, notes, created_by)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(id, title, range.startsAt, range.endsAt, notes, admin.id),
    env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'clubhouse.blackout_created', 'clubhouse_blackout', ?2, ?3)`).bind(admin.id, id,
      JSON.stringify({ title, startsAt: range.startsAt, endsAt: range.endsAt })),
  ])
  return json({ id }, { status: 201 })
}

async function deleteClubhouseBlackout(request, env, id) {
  const admin = await requireAdmin(request, env)
  const blackout = await env.DB.prepare('SELECT title FROM clubhouse_blackouts WHERE id = ?1').bind(id).first()
  if (!blackout) throw new ResponseError('Blackout period not found.', 404)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM clubhouse_blackouts WHERE id = ?1').bind(id),
    env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
      VALUES (?1, 'clubhouse.blackout_deleted', 'clubhouse_blackout', ?2, ?3)`).bind(admin.id, id,
      JSON.stringify({ title: blackout.title })),
  ])
  return json({ status: 'deleted' })
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
  const settings = await clubhouseSettings(env)
  if (new Date(range.startsAt).getTime() > Date.now() + settings.advanceDays * 24 * 60 * 60 * 1000) {
    throw new ResponseError(`Reservations may be requested up to ${settings.advanceDays} days in advance.`, 400)
  }
  const attendeeCount = Number(body.attendeeCount)
  if (!Number.isInteger(attendeeCount) || attendeeCount < 1 || attendeeCount > 65) throw new ResponseError('Enter an attendee count from 1 to 65.', 400)
  const activeCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM clubhouse_reservations
    WHERE user_id = ?1 AND status IN ('pending', 'approved') AND ends_at >= CURRENT_TIMESTAMP`).bind(user.id).first('count')
  if (activeCount >= settings.maxActivePerHousehold) {
    throw new ResponseError(`A household may have no more than ${settings.maxActivePerHousehold} active clubhouse requests.`, 409)
  }
  const availability = await clubhouseAvailability(env, range.startsAt, range.endsAt)
  if (!availability.available) throw new ResponseError(availability.reason, 409)
  const reservationId = crypto.randomUUID()
  const eventName = cleanText(body.eventName, 140, true)
  const eventType = cleanText(body.eventType, 100, true)
  const cleaningMethod = ['self', 'professional'].includes(body.cleaningMethod) ? body.cleaningMethod : null
  if (!cleaningMethod) throw new ResponseError('Select how the clubhouse will be cleaned.', 400)
  const notes = cleanText(body.notes, 1500)
  await env.DB.prepare(`INSERT INTO clubhouse_reservations (id, user_id, event_name, event_type, starts_at, ends_at,
    attendee_count, cleaning_method, notes, rules_acknowledged_at, status)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP, 'pending')`)
    .bind(reservationId, user.id, eventName, eventType, range.startsAt, range.endsAt, attendeeCount, cleaningMethod, notes).run()
  try {
    await notifyReservationAdmins(env, user, { eventName, startsAt: range.startsAt, endsAt: range.endsAt, attendeeCount })
  } catch (error) {
    console.error(JSON.stringify({ message: 'Reservation administrator notification failed', reservationId, detail: String(error) }))
  }
  return json({ id: reservationId, status: 'pending' }, { status: 201 })
}

async function decideReservation(request, env, reservationId) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const decision = body.decision
  if (!['approve', 'deny'].includes(decision)) throw new ResponseError('Select approve or deny.', 400)
  const overrideConflicts = body.overrideConflicts === true
  const overrideReason = cleanText(body.overrideReason, 1000)
  const reservation = await env.DB.prepare(`SELECT clubhouse_reservations.*, users.email,
    users.first_name AS firstName, users.first_name || ' ' || users.last_name AS residentName
    FROM clubhouse_reservations INNER JOIN users ON users.id = clubhouse_reservations.user_id
    WHERE clubhouse_reservations.id = ?1`).bind(reservationId).first()
  if (!reservation) throw new ResponseError('Reservation not found.', 404)
  if (reservation.status !== 'pending') throw new ResponseError('Only pending requests can be reviewed.', 409)
  const reason = cleanText(body.reason, 1000)
  if (decision === 'deny' && !reason) throw new ResponseError('Enter a reason for denying the request.', 400)
  if (decision === 'approve') {
    const availability = await clubhouseAvailability(env, reservation.starts_at, reservation.ends_at, reservationId)
    if (!availability.available && !overrideConflicts) throw new ResponseError(availability.reason, 409)
    if (!availability.available && !overrideReason) throw new ResponseError('Document why this availability rule is being overridden.', 400)
    const eventId = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO events (id, title, description, starts_at, ends_at, audience, event_type, created_by)
        VALUES (?1, ?2, ?3, ?4, ?5, 'members', 'clubhouse', ?6)`).bind(eventId,
        `Clubhouse reserved: ${reservation.event_name}`, reservation.event_type, reservation.starts_at, reservation.ends_at, reservation.user_id),
      env.DB.prepare(`UPDATE clubhouse_reservations SET event_id = ?1, status = 'approved', decision_reason = NULL,
        override_reason = ?2, override_by = CASE WHEN ?2 IS NULL THEN NULL ELSE ?3 END,
        reviewed_by = ?3, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?4`)
        .bind(eventId, !availability.available ? overrideReason : null, admin.id, reservationId),
      env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
        VALUES (?1, ?2, 'reservation', ?3, ?4)`).bind(admin.id,
        !availability.available ? 'reservation.approved_with_override' : 'reservation.approved', reservationId,
        JSON.stringify({ overrideReason: !availability.available ? overrideReason : null })),
    ])
    reservation.decisionReason = null
  } else {
    await env.DB.prepare(`UPDATE clubhouse_reservations SET status = 'denied', decision_reason = ?1,
      reviewed_by = ?2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?3`)
      .bind(reason, admin.id, reservationId).run()
    reservation.decisionReason = reason
  }
  reservation.eventName = reservation.event_name
  reservation.startsAt = reservation.starts_at
  reservation.endsAt = reservation.ends_at
  try {
    await notifyReservationDecision(env, reservation, decision === 'approve')
  } catch (error) {
    console.error(JSON.stringify({ message: 'Reservation decision notification failed', reservationId, detail: String(error) }))
  }
  return json({ status: decision === 'approve' ? 'approved' : 'denied' })
}

async function cancelReservation(request, env, reservationId) {
  const user = await requireUser(request, env)
  const reservation = await env.DB.prepare('SELECT id, event_id AS eventId, user_id AS userId, status FROM clubhouse_reservations WHERE id = ?1').bind(reservationId).first()
  if (!reservation) throw new ResponseError('Reservation not found.', 404)
  if (reservation.userId !== user.id && !['admin', 'super_admin'].includes(user.role)) throw new ResponseError('Not permitted.', 403)
  if (reservation.status === 'cancelled') return json({ status: 'cancelled' })
  if (!['pending', 'approved'].includes(reservation.status)) throw new ResponseError('This reservation can no longer be cancelled.', 409)
  const statements = [env.DB.prepare("UPDATE clubhouse_reservations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(reservationId)]
  if (reservation.eventId) statements.push(env.DB.prepare("UPDATE events SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(reservation.eventId))
  await env.DB.batch(statements)
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
  const residentType = ['owner', 'tenant'].includes(body.residentType) ? body.residentType : 'owner'
  const poolRulesAcknowledged = body.poolRulesAcknowledged === true

  if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) throw new ResponseError('Enter your first and last name.', 400)
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new ResponseError('Enter a valid email address.', 400)
  if (phone && phone.length > 30) throw new ResponseError('Enter a valid phone number.', 400)
  if (!address || address.length > 160) throw new ResponseError('Enter a valid Penny Lane Estates address.', 400)
  if (residentType === 'owner' && !poolRulesAcknowledged) throw new ResponseError('Property owners must accept the pool rules and access-card guidelines.', 400)

  const property = await findActiveProperty(env, address)
  if (!property) throw new ResponseError('That address was not found in Penny Lane Estates.', 400)

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first()
  if (existing) throw new ResponseError('An account request already exists for this email address.', 409)

  const id = crypto.randomUUID()
  const statements = [
    env.DB.prepare(`
      INSERT INTO users (id, property_id, email, first_name, last_name, phone, resident_type,
        password_hash, password_salt, password_iterations)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    `).bind(id, property.id, email, firstName, lastName, phone, residentType, '', '', 0),
    env.DB.prepare(`
      INSERT INTO audit_log (action, target_type, target_id, details_json)
      VALUES ('account.registered', 'user', ?1, ?2)
    `).bind(id, JSON.stringify({ propertyId: property.id, residentType })),
  ]
  if (residentType === 'owner') {
    statements.push(env.DB.prepare(`INSERT INTO pool_rules_agreements
      (id, property_id, user_id, rules_version, acknowledgement_text) VALUES (?1, ?2, ?3, '2026-08-27', ?4)`)
      .bind(crypto.randomUUID(), property.id, id, 'I have read and agree to the Penny Lane Estates pool rules and access-card guidelines. I accept responsibility for my household and guests, understand that violations may result in suspended pool privileges, and accept the $20 fee for a lost or replacement access card.'))
  }
  await env.DB.batch(statements)
  try {
    const admins = await env.DB.prepare(`SELECT email, first_name AS firstName, last_name AS lastName FROM users
      WHERE status = 'active' AND role IN ('admin', 'super_admin')`).all()
    await sendTransactionalEmail(env, admins.results.map((item) => ({ email: item.email, name: `${item.firstName} ${item.lastName}`.trim() })),
      `Resident access request from ${firstName} ${lastName}`,
      `<p>A new resident access request is awaiting review.</p><p><strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong><br>${escapeHtml(email)}<br>${escapeHtml(address)}, Lindale, TX 75771<br><strong>Property relationship:</strong> ${residentType === 'tenant' ? 'Renter' : 'Property owner'}</p><p>Sign in to the administration dashboard to approve or reject the request.</p>`, 'resident-registration')
  } catch (error) { console.error(JSON.stringify({ message: 'Registration notification failed', userId: id, detail: String(error) })) }
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
    SELECT users.id, users.email, users.first_name AS firstName, users.last_name AS lastName, users.phone,
      users.role, users.status, users.resident_type AS residentType, users.property_id AS propertyId,
      users.is_board_member AS isBoardMember, users.is_acc_member AS isAccMember,
      users.is_treasurer AS isTreasurer, users.is_amenities_coordinator AS isAmenitiesCoordinator,
      users.is_president AS isPresident, users.is_vice_president AS isVicePresident, users.is_secretary AS isSecretary,
      users.notify_announcements AS notifyAnnouncements, users.notify_events AS notifyEvents, users.created_at AS createdAt,
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
  const target = await env.DB.prepare('SELECT id, email, first_name AS firstName, last_name AS lastName, role FROM users WHERE id = ?1').bind(targetId).first()
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
  if (['active', 'rejected'].includes(status)) {
    const approved = status === 'active'
    try {
      await sendTransactionalEmail(env, [{ email: target.email, name: `${target.firstName} ${target.lastName}`.trim() }],
        approved ? 'Your Penny Lane HOA resident access was approved' : 'Your Penny Lane HOA resident access request was not approved',
        approved
          ? `<p>Hello ${escapeHtml(target.firstName)},</p><p>Your resident access request has been approved. You can now sign in with Google or request an email code.</p>`
          : `<p>Hello ${escapeHtml(target.firstName)},</p><p>Your resident access request was not approved. Reply to this message if you believe this was in error.</p>`,
        approved ? 'resident-approved' : 'resident-rejected')
    } catch (error) { console.error(JSON.stringify({ message: 'Account decision notification failed', targetId, detail: String(error) })) }
  }
  return json({ status })
}

async function updateUserProfile(request, env, targetId) {
  const admin = await requireAdmin(request, env)
  const body = await readJson(request)
  const target = await env.DB.prepare(`SELECT id, role, is_board_member AS isBoardMember,
    is_acc_member AS isAccMember, is_treasurer AS isTreasurer,
    is_amenities_coordinator AS isAmenitiesCoordinator, is_president AS isPresident,
    is_vice_president AS isVicePresident, is_secretary AS isSecretary FROM users WHERE id = ?1`).bind(targetId).first()
  if (!target) throw new ResponseError('Account not found.', 404)
  if (target.role === 'super_admin' && admin.role !== 'super_admin') throw new ResponseError('Super administrator access required.', 403)
  const email = cleanText(body.email, 254, true).toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ResponseError('Enter a valid email address.', 400)
  const role = ['resident', 'admin', 'super_admin'].includes(body.role) ? body.role : 'resident'
  if (role !== target.role && admin.role !== 'super_admin') throw new ResponseError('Super administrator access required to change account roles.', 403)
  const isPresident = body.isPresident === true
  const isVicePresident = body.isVicePresident === true
  const isSecretary = body.isSecretary === true
  const isTreasurer = body.isTreasurer === true
  if ([isPresident, isVicePresident, isSecretary, isTreasurer].filter(Boolean).length > 1) {
    throw new ResponseError('Select only one board officer role for an account.', 400)
  }
  const isBoardMember = body.isBoardMember === true || isPresident || isVicePresident || isSecretary || isTreasurer
  const isAccMember = body.isAccMember === true
  const isAmenitiesCoordinator = body.isAmenitiesCoordinator === true
  if ((isBoardMember !== Boolean(target.isBoardMember) || isAccMember !== Boolean(target.isAccMember)
    || isTreasurer !== Boolean(target.isTreasurer) || isAmenitiesCoordinator !== Boolean(target.isAmenitiesCoordinator)
    || isPresident !== Boolean(target.isPresident) || isVicePresident !== Boolean(target.isVicePresident)
    || isSecretary !== Boolean(target.isSecretary))
    && admin.role !== 'super_admin') throw new ResponseError('Super administrator access required to change committee memberships.', 403)
  if (targetId === admin.id && role !== admin.role) throw new ResponseError('You cannot change your own role.', 400)
  const residentType = ['owner', 'tenant', 'household_member'].includes(body.residentType) ? body.residentType : 'owner'
  const propertyId = Number(body.propertyId)
  if (!Number.isInteger(propertyId)) throw new ResponseError('Select a valid property.', 400)
  const property = await env.DB.prepare('SELECT id FROM properties WHERE id = ?1').bind(propertyId).first()
  if (!property) throw new ResponseError('Property not found.', 404)
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET first_name = ?1, last_name = ?2, email = ?3, phone = ?4,
        property_id = ?5, resident_type = ?6, role = ?7, is_board_member = ?8, is_acc_member = ?9,
        is_treasurer = ?10, is_amenities_coordinator = ?11, is_president = ?12,
        is_vice_president = ?13, is_secretary = ?14, updated_at = CURRENT_TIMESTAMP WHERE id = ?15`)
        .bind(cleanText(body.firstName, 80, true), cleanText(body.lastName, 80, true), email,
          cleanText(body.phone, 30), propertyId, residentType, role, isBoardMember ? 1 : 0, isAccMember ? 1 : 0,
          isTreasurer ? 1 : 0, isAmenitiesCoordinator ? 1 : 0, isPresident ? 1 : 0,
          isVicePresident ? 1 : 0, isSecretary ? 1 : 0, targetId),
      env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
        VALUES (?1, 'account.profile_changed', 'user', ?2, ?3)`).bind(admin.id, targetId,
        JSON.stringify({ email, propertyId, residentType, role, isBoardMember, isAccMember, isTreasurer,
          isAmenitiesCoordinator, isPresident, isVicePresident, isSecretary })),
    ])
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ResponseError('That email address is already registered.', 409)
    throw error
  }
  return json({ status: 'updated' })
}

async function updateNotificationPreferences(request, env) {
  const user = await requireUser(request, env)
  const body = await readJson(request)
  const announcements = body.notifyAnnouncements === true ? 1 : 0
  const events = body.notifyEvents === true ? 1 : 0
  await env.DB.prepare(`UPDATE users SET notify_announcements = ?1, notify_events = ?2,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?3`).bind(announcements, events, user.id).run()
  return json({ notifyAnnouncements: announcements, notifyEvents: events })
}

async function requestHouseholdMember(request, env) {
  const owner = await requireUser(request, env)
  if (owner.residentType !== 'owner') throw new ResponseError('Only a verified property owner can request household access.', 403)
  const body = await readJson(request)
  const firstName = cleanText(body.firstName, 80, true)
  const lastName = cleanText(body.lastName, 80, true)
  const email = cleanText(body.email, 254, true).toLowerCase()
  const phone = cleanText(body.phone, 30)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ResponseError('Enter a valid email address.', 400)
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1 COLLATE NOCASE').bind(email).first()
  if (existing) throw new ResponseError('An account already exists for that email address.', 409)
  const householdCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE property_id = ?1
    AND resident_type = 'household_member' AND status IN ('pending', 'active')`).bind(owner.propertyId).first('count')
  if (householdCount >= 10) throw new ResponseError('This property already has the maximum number of household accounts.', 409)
  const id = crypto.randomUUID()
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, property_id, email, first_name, last_name, phone, resident_type,
        password_hash, password_salt, password_iterations) VALUES (?1, ?2, ?3, ?4, ?5, ?6,
        'household_member', '', '', 0)`).bind(id, owner.propertyId, email, firstName, lastName, phone),
      env.DB.prepare(`INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details_json)
        VALUES (?1, 'household.access_requested', 'user', ?2, ?3)`).bind(owner.id, id,
        JSON.stringify({ propertyId: owner.propertyId, requestedBy: owner.id })),
    ])
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ResponseError('An account already exists for that email address.', 409)
    throw error
  }
  try {
    await sendTransactionalEmail(env, await activeAdminRecipients(env), `Household access request for ${firstName} ${lastName}`,
      `<p>A property owner requested a household-member account.</p><p><strong>Household member:</strong> ${escapeHtml(`${firstName} ${lastName}`)}<br><strong>Email:</strong> ${escapeHtml(email)}<br><strong>Property:</strong> ${escapeHtml(owner.address)}<br><strong>Requested by:</strong> ${escapeHtml(`${owner.firstName} ${owner.lastName}`)}</p><p>Review the pending account in the administration dashboard.</p>`,
      'household-access-request', null, false)
  } catch (error) {
    console.error(JSON.stringify({ message: 'Household access notification failed', userId: id, detail: String(error) }))
  }
  return json({ id, status: 'pending' }, { status: 201 })
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

async function exportResidentsCsv(request, env) {
  await requireAdmin(request, env)
  const result = await env.DB.prepare(`SELECT users.first_name AS firstName, users.last_name AS lastName, users.email,
    users.phone, users.resident_type AS residentType, users.role, users.status,
    properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
    FROM users INNER JOIN properties ON properties.id = users.property_id ORDER BY properties.street_name,
    properties.street_number, users.last_name, users.first_name`).all()
  const rows = [['First name', 'Last name', 'Email', 'Phone', 'Resident type', 'Role', 'Status', 'Property'],
    ...result.results.map((item) => [item.firstName, item.lastName, item.email, item.phone, item.residentType, item.role, item.status, item.address])]
  return new Response(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), { headers: {
    'cache-control': 'private, no-store',
    'content-disposition': 'attachment; filename="penny-lane-residents.csv"',
    'content-type': 'text/csv; charset=utf-8',
    'x-content-type-options': 'nosniff',
  } })
}

function csvResponse(rows, filename) {
  return new Response(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), { headers: {
    'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-type': 'text/csv; charset=utf-8',
    'x-content-type-options': 'nosniff',
  } })
}

async function exportGuestsCsv(request, env) {
  await requireAdmin(request, env)
  const result = await env.DB.prepare(`SELECT guest_registrations.guest_name AS guestName,
    guest_registrations.starts_on AS startsOn, guest_registrations.ends_on AS endsOn,
    guest_registrations.pool_responsibility_acknowledged AS poolResponsibilityAcknowledged,
    CASE WHEN guest_registrations.status = 'active' AND guest_registrations.ends_on < date('now')
      THEN 'expired' ELSE guest_registrations.status END AS status,
    guest_registrations.created_at AS createdAt, users.first_name || ' ' || users.last_name AS registeredBy,
    properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
    FROM guest_registrations INNER JOIN users ON users.id = guest_registrations.registered_by
    INNER JOIN properties ON properties.id = guest_registrations.property_id
    ORDER BY guest_registrations.ends_on DESC`).all()
  return csvResponse([['Guest', 'Property', 'Registered by', 'Arrival', 'Departure', 'Status', 'Pool responsibility acknowledged', 'Registered'],
    ...result.results.map((item) => [item.guestName, item.address, item.registeredBy, item.startsOn,
      item.endsOn, item.status, item.poolResponsibilityAcknowledged ? 'Yes' : 'No', item.createdAt])], 'penny-lane-guests.csv')
}

async function exportPoolCardsCsv(request, env) {
  await requireAdmin(request, env)
  const result = await env.DB.prepare(`SELECT pool_access_cards.card_number AS cardNumber,
    pool_access_cards.status, pool_access_cards.notes, pool_access_cards.issued_at AS issuedAt,
    pool_access_cards.updated_at AS updatedAt, assigned.first_name || ' ' || assigned.last_name AS assignedName,
    properties.street_number || ' ' || properties.street_name || ' ' || properties.street_suffix AS address
    FROM pool_access_cards INNER JOIN properties ON properties.id = pool_access_cards.property_id
    LEFT JOIN users AS assigned ON assigned.id = pool_access_cards.assigned_user_id
    ORDER BY properties.street_name, properties.street_number`).all()
  return csvResponse([['Card ID', 'Property', 'Assigned resident', 'Status', 'Notes', 'Issued', 'Last updated'],
    ...result.results.map((item) => [item.cardNumber, item.address, item.assignedName, item.status,
      item.notes, item.issuedAt, item.updatedAt])], 'penny-lane-pool-cards.csv')
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
  if (request.method === 'GET' && url.pathname === '/api/public/gallery') return publicGallery(env)
  const galleryImageMatch = url.pathname.match(/^\/api\/gallery\/([^/]+)$/)
  if (galleryImageMatch && request.method === 'GET') return galleryImage(env, galleryImageMatch[1])
  const calendarDownloadMatch = url.pathname.match(/^\/api\/events\/([^/]+)\.ics$/)
  if (calendarDownloadMatch && request.method === 'GET') return downloadEventCalendar(request, env, calendarDownloadMatch[1])
  if (request.method === 'POST' && url.pathname === '/api/contact') return createContactMessage(request, env)
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
  if (request.method === 'POST' && url.pathname === '/api/portal/messages') return createResidentMessage(request, env)
  const portalMessageMatch = url.pathname.match(/^\/api\/portal\/messages\/([^/]+)$/)
  if (portalMessageMatch && request.method === 'DELETE') return deleteContactMessage(request, env, portalMessageMatch[1])
  const portalMessageReplyMatch = url.pathname.match(/^\/api\/portal\/messages\/([^/]+)\/replies$/)
  if (portalMessageReplyMatch && request.method === 'POST') return replyToResidentMessage(request, env, portalMessageReplyMatch[1])
  if (request.method === 'POST' && url.pathname === '/api/portal/guests') return createGuestRegistration(request, env)
  const guestMatch = url.pathname.match(/^\/api\/portal\/guests\/([^/]+)$/)
  if (guestMatch && request.method === 'DELETE') return revokeGuestRegistration(request, env, guestMatch[1])
  if (request.method === 'PATCH' && url.pathname === '/api/portal/preferences') return updateNotificationPreferences(request, env)
  if (request.method === 'POST' && url.pathname === '/api/portal/household') return requestHouseholdMember(request, env)
  if (request.method === 'POST' && url.pathname === '/api/portal/reservations') return createReservation(request, env)
  const reservationMatch = url.pathname.match(/^\/api\/portal\/reservations\/([^/]+)$/)
  if (request.method === 'DELETE' && reservationMatch) return cancelReservation(request, env, reservationMatch[1])
  if (request.method === 'GET' && url.pathname === '/api/admin/users') return listUsers(request, env)
  if (request.method === 'GET' && url.pathname === '/api/admin/users.csv') return exportResidentsCsv(request, env)
  if (request.method === 'GET' && url.pathname === '/api/admin/guests.csv') return exportGuestsCsv(request, env)
  if (request.method === 'GET' && url.pathname === '/api/admin/pool-cards.csv') return exportPoolCardsCsv(request, env)
  if (request.method === 'GET' && url.pathname === '/api/admin/dashboard') return adminDashboard(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/properties') return createProperty(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/announcements') return createAnnouncement(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/events') return createEvent(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/documents') return createDocument(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/documents/upload') return uploadDocument(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/gallery') return uploadGalleryPhoto(request, env)
  if (request.method === 'PATCH' && url.pathname === '/api/admin/clubhouse/settings') return updateClubhouseSettings(request, env)
  if (request.method === 'POST' && url.pathname === '/api/admin/clubhouse/blackouts') return createClubhouseBlackout(request, env)
  const blackoutMatch = url.pathname.match(/^\/api\/admin\/clubhouse\/blackouts\/([^/]+)$/)
  if (blackoutMatch && request.method === 'DELETE') return deleteClubhouseBlackout(request, env, blackoutMatch[1])
  const propertyPoolCardsMatch = url.pathname.match(/^\/api\/admin\/properties\/([^/]+)\/pool-cards$/)
  if (propertyPoolCardsMatch && request.method === 'POST') return createPoolCard(request, env, propertyPoolCardsMatch[1])
  const poolCardMatch = url.pathname.match(/^\/api\/admin\/pool-cards\/([^/]+)$/)
  if (poolCardMatch && request.method === 'PATCH') return updatePoolCard(request, env, poolCardMatch[1])
  const adminGalleryImageMatch = url.pathname.match(/^\/api\/admin\/gallery\/([^/]+)\/image$/)
  if (adminGalleryImageMatch && request.method === 'GET') return adminGalleryImage(request, env, adminGalleryImageMatch[1])
  const propertyMatch = url.pathname.match(/^\/api\/admin\/properties\/([^/]+)$/)
  if (propertyMatch && request.method === 'GET') return propertyDetails(request, env, propertyMatch[1])
  if (propertyMatch && request.method === 'PATCH') return updateProperty(request, env, propertyMatch[1])
  const announcementMatch = url.pathname.match(/^\/api\/admin\/announcements\/([^/]+)$/)
  if (announcementMatch && request.method === 'PATCH') return updateAnnouncement(request, env, announcementMatch[1])
  if (announcementMatch && request.method === 'DELETE') return deleteAnnouncement(request, env, announcementMatch[1])
  const eventMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)$/)
  if (eventMatch && request.method === 'PATCH') return updateEvent(request, env, eventMatch[1])
  if (eventMatch && request.method === 'DELETE') return cancelEvent(request, env, eventMatch[1])
  const permanentEventMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/permanent$/)
  if (permanentEventMatch && request.method === 'DELETE') return deleteEventPermanently(request, env, permanentEventMatch[1])
  const documentMatch = url.pathname.match(/^\/api\/admin\/documents\/([^/]+)$/)
  if (documentMatch && request.method === 'PATCH') return updateDocument(request, env, documentMatch[1])
  if (documentMatch && request.method === 'DELETE') return deleteDocument(request, env, documentMatch[1])
  const documentUploadMatch = url.pathname.match(/^\/api\/admin\/documents\/([^/]+)\/upload$/)
  if (documentUploadMatch && request.method === 'PUT') return replaceDocument(request, env, documentUploadMatch[1])
  const adminReservationMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)$/)
  if (adminReservationMatch && request.method === 'PATCH') return decideReservation(request, env, adminReservationMatch[1])
  if (adminReservationMatch && request.method === 'DELETE') return cancelReservation(request, env, adminReservationMatch[1])
  const permanentReservationMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)\/permanent$/)
  if (permanentReservationMatch && request.method === 'DELETE') return deleteReservationPermanently(request, env, permanentReservationMatch[1])
  const contactMessageMatch = url.pathname.match(/^\/api\/admin\/messages\/([^/]+)$/)
  if (contactMessageMatch && request.method === 'PATCH') return updateContactMessage(request, env, contactMessageMatch[1])
  if (contactMessageMatch && request.method === 'DELETE') return deleteContactMessage(request, env, contactMessageMatch[1], true)
  const contactMessageReplyMatch = url.pathname.match(/^\/api\/admin\/messages\/([^/]+)\/reply$/)
  if (contactMessageReplyMatch && request.method === 'POST') return replyToContactMessage(request, env, contactMessageReplyMatch[1])
  const galleryMatch = url.pathname.match(/^\/api\/admin\/gallery\/([^/]+)$/)
  if (galleryMatch && request.method === 'PATCH') return updateGalleryPhoto(request, env, galleryMatch[1])
  if (galleryMatch && request.method === 'DELETE') return deleteGalleryPhoto(request, env, galleryMatch[1])
  const statusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/)
  if (request.method === 'PATCH' && statusMatch) return updateUserStatus(request, env, statusMatch[1])
  const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
  if (request.method === 'PATCH' && userMatch) return updateUserProfile(request, env, userMatch[1])
  const historyMatch = url.pathname.match(/^\/api\/admin\/history\/(communications|audit)\/([^/]+)$/)
  if (historyMatch && request.method === 'DELETE') return deleteHistoryRecord(request, env, historyMatch[1], historyMatch[2])
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
