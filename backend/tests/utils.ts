import { createServer } from 'node:http'

export function createTestServer(app: any) {
  return createServer(async (req, res) => {
    const url = `http://localhost${req.url}`
    const method = req.method || 'GET'
    const headers = new Headers()

    Object.entries(req.headers).forEach(([key, value]) => {
      if (value) headers.set(key, String(value))
    })

    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))

    await new Promise<void>((resolve) => req.on('end', resolve))

    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

    const response = await app.fetch(
      new Request(url, { method, headers, body }),
      {} as any
    )

    res.statusCode = response.status
    res.statusMessage = response.statusText

    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    const responseBody = await response.arrayBuffer()
    res.end(Buffer.from(responseBody))
  })
}

export { TEST_ADMIN_KEY, TEST_UPLOADS_DIR, createTestPodcast, createTestEpisode } from './setup.js'
