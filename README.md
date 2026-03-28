# 🍳 Mise en Place — AI Recipe Generator

A minimal, elegant AI-powered recipe generator. Tell it what ingredients you have; it suggests 3 recipes with steps, ingredient tags, and YouTube links.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Run the server
```bash
npm start
```

### 3. Open in browser
```
http://localhost:3000

https://shadows-intelligent-flags-homeland.trycloudflare.com
```

### 4. Log in
Password: **1234**

---

## 🤖 AI Mode

### Mock mode (default — no API key needed)
Works out of the box. Returns 3 sensible recipe templates built from your ingredients.

### Real AI mode (OpenAI)
Set your OpenAI API key as an environment variable:

```bash
# macOS / Linux
OPENAI_API_KEY=sk-... npm start

# Windows (PowerShell)
$env:OPENAI_API_KEY="sk-..."; npm start

# Windows (CMD)
set OPENAI_API_KEY=sk-... && npm start
```

The server will log which mode it's running in on startup.

---

## 📁 Project Structure

```
recipe-app/
├── server.js          # Express backend — login + /generate route
├── package.json
└── public/
    ├── index.html     # Single-page app
    ├── style.css      # Parchment-toned design system
    └── script.js      # Login flow, tag cloud, recipe rendering
```

---

## ✨ Features

- **Login wall** — hardcoded password (`1234`), random 2-word user ID shown after login
- **Live emoji tag cloud** — updates as you type ingredients
- **3 recipe cards** — name, emoji, ingredient tags, numbered steps, YouTube link
- **Loading animation** — sizzling skillet while AI thinks
- **"Try Again" button** — re-runs the generation
- **Ctrl/Cmd + Enter** shortcut to submit

---

## 🔧 Customisation

| Thing | Where |
|---|---|
| Change password | `server.js` → `const PASSWORD` |
| Change port | `server.js` → `const PORT` |
| Swap AI model | `server.js` → `callOpenAI()` → `model` field |
| Adjust recipe count | AI prompt in `server.js` → `"suggest exactly 3"` |
