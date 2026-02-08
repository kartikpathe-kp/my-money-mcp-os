# My Money MCP OS

An MCP server that turns Claude into your personal finance manager. Track expenses, manage budgets, sync Splitwise — all through conversation.

No app. No forms. Just talk.

---

### The problem

I've tracked my finances for 2 years. Notebook + app, every transaction logged twice. It worked, but it was exhausting — and the system couldn't answer the one question that actually matters:

> *"Can I afford this?"*

To answer that, I'd have to export data, build a spreadsheet, calculate burn rate... basically do an MBA assignment on my own life. Every expense app I tried (and I tried many) had the same flaw: they're great at recording, terrible at thinking.

### The fix

This MCP server connects Claude to a Supabase database. Now instead of tapping through forms, I just talk:

```
Me:     spent 340 on uber, hdfc card
Claude: Recorded ₹340 expense in Transport using HDFC Credit Card.
        Your transport spend this month: ₹2,180 of ₹3,000 budget (73%).

Me:     split 2400 dinner at Bombay Canteen between me, Rohit and Sneha. I paid.
Claude: Added to Splitwise — Rohit owes ₹800, Sneha owes ₹800.
        Logged ₹800 as your Food expense on HDFC card.

Me:     can I afford a MacBook Pro?
Claude: Current savings: ₹1.8L. Monthly burn: ₹38K.
        That MacBook (₹1.5L) would leave you with ~5 weeks of runway.
        I'd suggest waiting 2 more months.
```

That last one hurt. But it was the most useful financial advice I've gotten — from a system running on my own data.

---

## What it does

**Transactions** — Add income/expenses by just saying what you spent. Supports multiple accounts (bank, credit card, cash, wallet), categories, tags, and payment methods. Edit, delete, search through history.

**Budgets** — Set monthly limits per category. Claude tells you where you stand whenever you add an expense, not after the month is over.

**Account balances** — Calculated automatically from all transactions. Transfer between accounts (pay credit card from bank, move to savings).

**Spending analytics** — Monthly/yearly summaries by category. Compare periods ("how's this month vs last month?"). Spot patterns you'd never catch manually.

**Splitwise integration** — Create shared expenses, view balances, check who owes you — without opening Splitwise. Split bills right from the conversation.

**Recurring transactions** — Track upcoming bills and subscriptions. Know what's due before it hits.

---

## Setup

Takes about 15 minutes.

### Prerequisites

- **Node.js 18+**
- **Claude Pro** (or any Claude plan that supports MCP)
- **Supabase account** — [free tier](https://supabase.com) is more than enough
- **Splitwise API keys** — optional, only if you want Splitwise features ([register app here](https://secure.splitwise.com/apps))

### 1. Clone and configure

```bash
git clone https://github.com/kartikpathe-kp/my-money-mcp.git
cd my-money-mcp
cp .env.example .env
```

Open `.env` and add your Supabase credentials (found in your Supabase project → Settings → API).

### 2. Set up the database

Open the [Supabase SQL Editor](https://supabase.com/dashboard) and run the contents of `schema.sql`. This creates all tables, views, indexes, and some default expense/income categories.

### 3. Install and run

```bash
npm install
npm run build
npm start
```

Server starts at `http://localhost:3001`. Hit `/health` to verify it's running.

### 4. Connect to Claude

Add this to your Claude MCP configuration:

```json
{
  "mcpServers": {
    "my-money": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Start a conversation. Try: *"Add ₹500 dinner expense on HDFC card"*

If Claude responds with a confirmation and budget status, you're live.

---

## Deploy to Railway (optional)

If you want to access it from anywhere (not just localhost):

1. Push your fork to GitHub
2. Create a new project on [Railway](https://railway.app) → Deploy from GitHub
3. Add your environment variables (`SUPABASE_URL`, `SUPABASE_KEY`, and optionally the Splitwise keys) in Railway's dashboard
4. Note your public URL and update Claude's MCP config:

```json
{
  "mcpServers": {
    "my-money": {
      "url": "https://your-app.up.railway.app/mcp"
    }
  }
}
```

Railway's free tier handles this comfortably.

---

## Privacy

Your financial data lives in YOUR Supabase database. The MCP server is just a bridge between Claude and your data — it doesn't store anything itself. Deploy it on your own infrastructure and no one else has access. Not me, not Anthropic, not Railway.

---

## Tech stack

TypeScript, Express, Supabase, Splitwise SDK, MCP Protocol

## License

MIT — do whatever you want with it.

---

*Built by [Kartik Pathe](https://linkedin.com/in/kartik-pathe). I use this daily and it's the first finance tracking system I haven't abandoned in 2 years.*
