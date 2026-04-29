import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractTranscriptPayload,
} from '../../api/transcript.js'

test('extractTranscriptPayload prefers embedded Perplexity transcript content when present', () => {
  const html = `
    <html>
      <head>
        <title>GNRC Q1 2026 Earnings Transcript</title>
        <script id="__NEXT_DATA__" type="application/json">
          {
            "props": {
              "pageProps": {
                "event": {
                  "company": { "symbol": "GNRC" },
                  "transcript": {
                    "sections": [
                      {
                        "speaker": "Operator",
                        "text": "Good day and welcome to the Generac Holdings earnings conference call."
                      },
                      {
                        "speaker": "Aaron Jagdfeld",
                        "text": "Demand improved sequentially and our residential dealer backlog normalized."
                      },
                      {
                        "speaker": "Analyst",
                        "text": "Can you talk about margin cadence through the second half?"
                      }
                    ]
                  }
                }
              }
            }
          }
        </script>
      </head>
      <body>
        <div>Stub body content only.</div>
      </body>
    </html>
  `

  const payload = extractTranscriptPayload(html, 'https://www.perplexity.ai/finance/GNRC/earnings?eventId=555216&tab=transcript')

  assert.equal(payload.title, 'GNRC Q1 2026 Earnings Transcript')
  assert.match(payload.text, /Operator:\s+Good day and welcome/i)
  assert.match(payload.text, /Aaron Jagdfeld:\s+Demand improved sequentially/i)
  assert.match(payload.text, /Analyst:\s+Can you talk about margin cadence/i)
  assert.ok(payload.text.length > 120)
})

test('extractTranscriptPayload falls back to visible transcript-like html blocks for Perplexity pages', () => {
  const html = `
    <html>
      <head><title>Transcript View</title></head>
      <body>
        <main>
          <div>Operator</div>
          <div>Good afternoon, and welcome to the quarterly earnings call.</div>
          <div>Chief Financial Officer</div>
          <div>Gross margin expanded 240 basis points year over year.</div>
          <div>Question-and-Answer Session</div>
          <div>Can you discuss free cash flow conversion?</div>
        </main>
      </body>
    </html>
  `

  const payload = extractTranscriptPayload(html, 'https://www.perplexity.ai/finance/GNRC/earnings?eventId=555216&tab=transcript')

  assert.equal(payload.title, 'Transcript View')
  assert.match(payload.text, /Operator/i)
  assert.match(payload.text, /Gross margin expanded 240 basis points/i)
  assert.match(payload.text, /Question-and-Answer Session/i)
})
