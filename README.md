# AetherAI Chatbot

Vercel-ready chatbot using a static frontend and Python serverless API functions.

## Deploy Structure

- `index.html` - frontend markup served by Vercel
- `styles.css` - UI styles
- `app.js` - browser-side chat UI logic
- `api/chat.py` - secure serverless endpoint that calls OpenRouter
- `api/models.py` - serverless endpoint that returns current free OpenRouter models
- `api/_openrouter.py` - shared OpenRouter helpers
- `vercel.json` - Vercel routing/function config

The browser never receives your OpenRouter API key. The key is read only on the server from `OPENROUTER_API_KEY`.

## Vercel Environment Variable

In Vercel, add:

```text
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Use Production, Preview, and Development environments if you want it to work in all deployments.

## Local Preview

The Vercel API functions are designed for Vercel. For local testing, install and use Vercel CLI:

```powershell
npm i -g vercel
cd chatbot
vercel dev
```

Then open the local URL shown by Vercel CLI.
