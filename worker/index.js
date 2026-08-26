const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...init.headers },
  })
}

async function listActiveProperties(env) {
  const query = `
    SELECT
      properties.id,
      properties.street_number AS streetNumber,
      properties.street_name AS streetName,
      properties.street_suffix AS streetSuffix,
      properties.city,
      properties.state,
      properties.postal_code AS postalCode,
      hoa_phases.name AS phase
    FROM properties
    INNER JOIN hoa_phases ON hoa_phases.id = properties.phase_id
    WHERE properties.status = 'active'
      AND hoa_phases.status = 'active'
    ORDER BY properties.street_name, properties.street_number
  `

  const result = await env.DB.prepare(query).all()
  return result.results.map((property) => ({
    ...property,
    address: `${property.streetNumber} ${property.streetName} ${property.streetSuffix}`,
  }))
}

async function handleApi(request, env) {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/api/health') {
    const propertyCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM properties WHERE status = 'active'",
    ).first('count')

    return json({ status: 'ok', activeProperties: propertyCount })
  }

  if (url.pathname === '/api/properties') {
    if (request.method !== 'GET') {
      return json(
        { error: 'Method not allowed' },
        { status: 405, headers: { allow: 'GET' } },
      )
    }

    return json({ properties: await listActiveProperties(env) })
  }

  return json({ error: 'Not found' }, { status: 404 })
}

export default {
  async fetch(request, env) {
    try {
      return await handleApi(request, env)
    } catch (error) {
      console.error(JSON.stringify({
        message: 'Unhandled API error',
        error: error instanceof Error ? error.message : 'Unknown error',
        path: new URL(request.url).pathname,
      }))

      return json({ error: 'Internal server error' }, { status: 500 })
    }
  },
}
