# VendorRisk Deployment Checklist

Use this before showing the app to anyone.

## Render: Node API

- Service: `vendorrisk-ai-backendd`
- Root directory: `BACKENDD`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`
- Environment variables:
  - `NODE_VERSION=20`
  - `PYTHON_API_BASE=https://vendorrisk-ai-project-backend.onrender.com`
  - `FRONTEND_URL=https://vendor-risk-ai.vercel.app`

Check:

```text
https://vendorrisk-ai-backendd.onrender.com/health
https://vendorrisk-ai-backendd.onrender.com/api/health/full
```

## Render: Python Risk Engine

- Service: `vendorrisk-ai-project-backend`
- Root directory: `Python_BackEnd`
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 180`
- Health check path: `/health`
- Environment variables:
  - `ALERT_API_URL=https://vendorrisk-ai-backendd.onrender.com/api/alerts/internal`

Check:

```text
https://vendorrisk-ai-project-backend.onrender.com/health
```

## Vercel Frontend

- Project root: `FrontEnd`
- The frontend currently calls:

```text
https://vendorrisk-ai-backendd.onrender.com
```

## Demo Rule

Open these URLs first and wait for all health checks to return healthy:

```text
https://vendorrisk-ai-project-backend.onrender.com/health
https://vendorrisk-ai-backendd.onrender.com/health
https://vendorrisk-ai-backendd.onrender.com/api/health/full
```

If the first request is slow on Render free tier, wait 30-60 seconds and reload once. After both services are awake, use the Vercel app.
