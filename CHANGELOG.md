# changelog

## phase 5.5 — sign & execute end-to-end

- `nlp:` claude-driven intent parser (swap / stake / lend / mint phrasings)
- `nlp:` conversational replies layered on top of structured intent output
- `builder:` drag-connect-deploy block canvas with live preview
- `builder:` agent delete + persistence in localStorage
- `chat:` sign & execute round-trip with phantom + jupiter swap routing
- `ui:` full design overhaul — gradient mesh background, Space Mono + Inter
- `ui:` conversational landing page + Guide page (9 sections + 10 FAQ)
- security: 18 of 20 audit findings resolved
- perf: code splitting on builder + guide routes

## phase 5 — backend wiring

- `api:` fastapi endpoints `/parse`, `/execute`, `/quote`
- `intent:` pydantic schemas for swap / stake / lend / mint payloads
- `jupiter:` route fetching + slippage handling
- `executor:` action dispatcher with anchor program client

## phase 4 — frontend bones

- vite/react/reactflow scaffold
- chat panel + builder split layout
- wallet adapter integration
