# Sistema de Sinalização Digital (SSD) - Bosque da Esperança

## Project Overview
A digital signage system for a cemetery/crematorium that displays real-time memorial information on digital panels. The system fetches live data from Bubble.io (a CMS for memorial content) and displays names, photos, room numbers, and schedules.

## Architecture
- **Backend**: Node.js + Express (`backend/server.js`) — serves both the API and the static frontend
- **Frontend**: Vanilla HTML/CSS/JS (`painel/`) — airport-style display panel

## Key Files
- `backend/server.js` — Main server (API routes + static file serving)
- `backend/package.json` — Node.js dependencies (express, axios, cors, dotenv)
- `painel/index.html` — Main display panel page
- `painel/js/script.js` — Frontend logic (fetches Bubble.io data, renders rows, updates clock)
- `painel/css/style.css` — Styling (green/orange/yellow theme matching Bosque da Esperança branding)

## Running the App
- Single workflow: `cd backend && node server.js`
- Runs on port **5000** (frontend + API combined)
- API routes: `GET /api/hall` (full list), `GET /api/sala/:id` (individual room)

## Environment Variables
- `PORT=5000` — Server port
- `BUBBLE_API_URL` — Bubble.io API endpoint for memorial data
- `BUBBLE_TOKEN` — Bubble.io Bearer token for authentication
- `IVERTEX_API_URL` / `IVERTEX_TOKEN` — iVertex logistics API (pending configuration)

## External Integrations
- **Bubble.io**: CMS at `memorialbosque.com.br` for memorial data (names, photos, room assignments)
- **iVertex**: Logistics API for schedule data (token pending from stakeholder)

## Deployment
- Target: Autoscale
- Run command: `node backend/server.js`
