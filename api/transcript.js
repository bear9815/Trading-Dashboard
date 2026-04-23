const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function decodeEntities(text = '') {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function extractMeta(html, attr, value) {
  const pattern = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["']`, 'i')
  return decodeEntities(html.match(pattern)?.[1] || '')
}

function extractTitle(html) {
  return (
    extractMeta(html, 'property', 'og:title') ||
    extractMeta(html, 'name', 'twitter:title') ||
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  ).trim()
}

function cleanHtmlToText(html) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html
  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|header|footer|li|tr|h1|h2|h3|h4|h5|h6)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')

  return decodeEntities(stripped)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function findTranscriptWindow(text) {
  const lowered = text.toLowerCase()
  const markers = [
    'company participants',
    'conference call participants',
    'presentation',
    'operator',
    'question-and-answer session',
  ]

  const start = markers
    .map(marker => lowered.indexOf(marker))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]

  if (start >= 0) return text.slice(Math.max(0, start - 400)).trim()
  return text
}

function normalizeTranscriptText(text) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { url } = req.body || {}
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Transcript URL is required.' })

    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return res.status(400).json({ error: 'Invalid URL.' })
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http and https URLs are supported.' })
    }

    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })

    if (!upstream.ok) {
      return res.status(502).json({ error: `Transcript fetch failed (${upstream.status}).` })
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return res.status(415).json({ error: 'The transcript URL did not return an HTML page.' })
    }

    const html = await upstream.text()
    const title = extractTitle(html) || 'Transcript Import'
    const text = normalizeTranscriptText(findTranscriptWindow(cleanHtmlToText(html)))

    if (!text || text.length < 1200) {
      return res.status(422).json({
        error: 'Could not extract enough transcript text from that page. Try a page with the full transcript visible.',
      })
    }

    return res.status(200).json({
      title,
      sourceUrl: parsed.toString(),
      text: text.slice(0, 120000),
    })
  } catch (error) {
    console.error('[api/transcript]', error)
    return res.status(500).json({ error: error.message || 'Transcript import failed.' })
  }
}
