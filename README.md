# My Money MCP

Track expenses, manage budgets, and sync Splitwise — all through conversation with Claude.

## What is this?

[MCP (Model Context Protocol)](https://modelcontextprotocol.io) lets Claude connect to external tools and data sources. This server gives Claude the ability to manage your personal finances — recording transactions, checking budgets, viewing account balances, and even syncing with Splitwise — all through natural conversation.

Instead of opening a spreadsheet or an app, you just talk:

```
You:    Spent 500 on dinner last night, HDFC card
Claude: Recorded ₹500 expense in Food & Dining using HDFC Credit Card.
        Budget status: ₹3,200/₹5,000 used (64%) this month.

You:    How much did I spend on food this month?
Claude: You've spent ₹8,450 on Food & Dining this month across 12 transactions.
        That's ₹1,200 more than last month.
```

## Prerequisites

- **Node.js 18+**
- **Claude Pro or API access** (any plan that supports MCP)
- **Supabase account** — [free tier](https://supabase.com) works
- **Splitwise API keys** — optional, only needed for Splitwise features ([register here](https://secure.splitwise.com/apps))

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/my-money-mcp.git
cd my-money-mcp
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase URL and anon key. You can find these in your Supabase project under **Settings > API**.

If you want Splitwise integration, add your Splitwise API keys too.

### 3. Set up the database

Open the [Supabase SQL Editor](https://supabase.com/dashboard) for your project and run the contents of `schema.sql`. This creates all the tables, views, indexes, and default categories.

### 4. Install and run

```bash
npm install
npm run build
npm start
```

The server starts on `http://localhost:3001` by default.

### 5. Connect to Claude

Add the MCP server URL to Claude. In your Claude configuration, add:

```json
{
  "mcpServers": {
    "my-money": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

## What can it do?

**Transactions**
- Add income and expenses with account, category, and tags
- Transfer between accounts (e.g., pay credit card from bank)
- Search, edit, and delete transactions

**Accounts & Balances**
- Track multiple accounts (bank, credit card, cash, wallet)
- Balances calculated automatically from transactions

**Budgets**
- Set monthly budgets per category
- Check budget status with spending vs. limit

**Analytics**
- Monthly/yearly spending summaries by category
- Compare spending between periods

**Recurring Transactions**
- Track upcoming bills and subscriptions
- See what's due in the next N days

**Splitwise Integration**
- View friends, groups, and balances
- Create, update, and delete shared expenses
- Record debts and settle up

## Deploying to Railway

[Railway](https://railway.app) offers a free tier that works well for this server.

1. Push your repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project
3. Select **Deploy from GitHub repo** and pick your repository
4. Add environment variables in the Railway dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SPLITWISE_CONSUMER_KEY` (optional)
   - `SPLITWISE_CONSUMER_SECRET` (optional)
   - `SPLITWISE_ACCESS_TOKEN` (optional)
5. Railway auto-detects the start command from `package.json`. Deploy and note your public URL.
6. Update your Claude MCP config to use the Railway URL instead of localhost:
   ```json
   {
     "mcpServers": {
       "my-money": {
         "url": "https://your-app.up.railway.app/mcp"
       }
     }
   }
   ```

## License

MIT
