interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

interface Env {
  ASSETS: AssetsBinding
}

async function withAbsoluteSocialImages(response: Response, request: Request) {
  if (!response.headers.get('content-type')?.includes('text/html')) return response

  const origin = new URL(request.url).origin
  const html = (await response.text()).replaceAll('content="/og.png"', `content="${origin}/og.png"`)
  const headers = new Headers(response.headers)
  headers.delete('content-length')

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || request.method !== 'GET') {
      return request.method === 'GET' ? withAbsoluteSocialImages(response, request) : response
    }

    const acceptsHtml = request.headers.get('accept')?.includes('text/html')
    if (!acceptsHtml) return response

    const fallbackUrl = new URL('/index.html', request.url)
    const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, request))
    return withAbsoluteSocialImages(fallback, request)
  },
}
