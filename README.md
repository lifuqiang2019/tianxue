# Tianxue Listening Assistant (Node + Vercel)

A Node/TypeScript MVP for listening-question auto answering.

## Features

- `POST /api/tasks` create async task
- `GET /api/tasks/:id` query status
- `GET /api/tasks/:id/result` fetch final answers
- Simple web UI for manual testing
- Doubao integration via env vars (fallback logic included)

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Create `.env.local`:

```bash
DOUBAO_API_KEY=your_api_key
DOUBAO_MODEL=your_model_id
# optional
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

If `DOUBAO_API_KEY` or `DOUBAO_MODEL` is missing, the app returns fallback answers for smoke test.

## API Examples

### 1) Create task

```bash
curl -X POST http://localhost:3000/api/tasks \
  -F 'questionText=1. What does the boy do?\nA. Teacher\nB. Doctor\nC. Driver' \
  -F 'transcript=He works in a hospital and helps patients every day.'
```

### 2) Query status

```bash
curl http://localhost:3000/api/tasks/<taskId>
```

### 3) Query result

```bash
curl http://localhost:3000/api/tasks/<taskId>/result
```

## Deploy to Vercel

```bash
vercel --prod
```

Then set env vars in Vercel project settings:

- `DOUBAO_API_KEY`
- `DOUBAO_MODEL`
- `DOUBAO_BASE_URL` (optional)
