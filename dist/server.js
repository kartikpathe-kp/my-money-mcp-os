// server.ts - Expense Tracking MCP Server + Full Splitwise Tooling
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
// ==================== Supabase Setup ====================
const SUPABASE_URL = process.env.SUPABASE_URL || "https://eixgyftdoolsoobifaoj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_J-AgZq1M_zXtIhO3khpOOQ_wcmBV2rW";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// ==================== Splitwise Setup ====================
import * as SplitwisePkg from "splitwise";
let splitwiseClient = null;
function getSplitwiseExport() {
    const mod = SplitwisePkg;
    return mod?.default ?? mod;
}
function buildSplitwiseClient(config) {
    const exported = getSplitwiseExport();
    const candidates = [
        exported,
        exported?.Splitwise,
        exported?.createClient,
        SplitwisePkg,
        SplitwisePkg?.Splitwise,
        SplitwisePkg?.default,
    ].filter(Boolean);
    let lastErr = null;
    for (const c of candidates) {
        if (typeof c !== "function")
            continue;
        try {
            return c(config);
        }
        catch (e) {
            lastErr = e;
            if (String(e?.message || e).includes("cannot be invoked without 'new'")) {
                try {
                    return new c(config);
                }
                catch (e2) {
                    lastErr = e2;
                }
            }
        }
    }
    const exportedKeys = exported ? Object.keys(exported) : [];
    throw new Error(`Splitwise SDK init failed. Export keys: ${exportedKeys.join(", ")}. Last error: ${lastErr?.message || lastErr}`);
}
function getSplitwiseClient() {
    if (splitwiseClient)
        return splitwiseClient;
    const consumerKey = process.env.SPLITWISE_CONSUMER_KEY;
    const consumerSecret = process.env.SPLITWISE_CONSUMER_SECRET;
    const accessToken = process.env.SPLITWISE_ACCESS_TOKEN;
    if (!consumerKey || !consumerSecret) {
        throw new Error("Splitwise is not configured. Set SPLITWISE_CONSUMER_KEY and SPLITWISE_CONSUMER_SECRET in .env");
    }
    const config = {
        consumerKey,
        consumerSecret,
        ...(accessToken ? { accessToken } : {}),
        logLevel: "error",
    };
    splitwiseClient = buildSplitwiseClient(config);
    return splitwiseClient;
}
// ==================== Helper Functions ====================
function parseDate(dateStr) {
    const today = new Date();
    if (dateStr.toLowerCase() === "today") {
        return today.toISOString().split("T")[0];
    }
    if (dateStr.toLowerCase() === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split("T")[0];
    }
    try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split("T")[0];
        }
    }
    catch {
        return today.toISOString().split("T")[0];
    }
    return today.toISOString().split("T")[0];
}
async function findAccount(accountName) {
    const { data: accounts, error } = await supabase.from("accounts").select("*").eq("is_active", true);
    if (error || !accounts)
        return null;
    let account = accounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase());
    if (!account) {
        account = accounts.find((a) => a.name.toLowerCase().includes(accountName.toLowerCase()) ||
            accountName.toLowerCase().includes(a.name.toLowerCase()));
    }
    return account || null;
}
function getPeriodDates(period) {
    const today = new Date();
    let startDate;
    let endDate;
    if (period === "this_month") {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
        endDate = today.toISOString().split("T")[0];
    }
    else if (period === "last_month") {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        startDate = lastMonth.toISOString().split("T")[0];
        endDate = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split("T")[0];
    }
    else if (period === "this_year") {
        startDate = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];
        endDate = today.toISOString().split("T")[0];
    }
    else {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
        endDate = today.toISOString().split("T")[0];
    }
    return { startDate, endDate };
}
function safeJson(content) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(content),
            },
        ],
    };
}
function normalizeName(obj) {
    const fn = obj?.first_name ?? obj?.firstName ?? obj?.getFirstName?.();
    const ln = obj?.last_name ?? obj?.lastName ?? obj?.getLastName?.();
    const name = [fn, ln].filter(Boolean).join(" ").trim();
    return name || obj?.name || `User ${obj?.id ?? obj?.getId?.() ?? "?"}`;
}
function extractBalances(friend) {
    const balances = friend?.balance || friend?.balances || friend?.getBalance?.() || [];
    return (balances || []).map((b) => ({
        currency_code: b.currency_code || b.currencyCode || b.getCurrencyCode?.() || "UNKNOWN",
        amount: Number(b.amount ?? b.getAmount?.() ?? 0),
    }));
}
/**
 * CRITICAL FIX: Ensures amounts balance exactly (paid_share total = owed_share total = cost)
 * Handles rounding by adjusting the last participant
 */
function splitEquallyUsers(cost, payer_user_id, participant_user_ids) {
    const n = participant_user_ids.length;
    if (n <= 0)
        throw new Error("participant_user_ids must have at least 1 user_id");
    const costCents = Math.round(cost * 100); // Work in cents to avoid floating point issues
    const owedCentsEach = Math.floor(costCents / n);
    const remainder = costCents - (owedCentsEach * n);
    const users = participant_user_ids.map((uid, index) => {
        // Last person gets the remainder to ensure exact balance
        const owedCents = index === n - 1 ? owedCentsEach + remainder : owedCentsEach;
        const owedShare = (owedCents / 100).toFixed(2);
        const paidShare = uid === payer_user_id ? cost.toFixed(2) : "0.00";
        return {
            user_id: uid,
            owed_share: owedShare,
            paid_share: paidShare,
        };
    });
    // Validation: Ensure totals balance
    const totalOwed = users.reduce((sum, u) => sum + parseFloat(u.owed_share), 0);
    const totalPaid = users.reduce((sum, u) => sum + parseFloat(u.paid_share), 0);
    if (Math.abs(totalOwed - cost) > 0.01 || Math.abs(totalPaid - cost) > 0.01) {
        throw new Error(`Balance mismatch: cost=${cost}, totalOwed=${totalOwed}, totalPaid=${totalPaid}`);
    }
    return users;
}
// ==================== Tool Handlers ====================
const toolsListHandler = async () => {
    console.log("📋 Tools list requested");
    return {
        tools: [
            // -------------------- Existing Supabase Tools --------------------
            {
                name: "add_transaction",
                description: "Record a new income or expense transaction. Use this when user mentions spending money or receiving money.",
                inputSchema: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["income", "expense"], description: "Type of transaction" },
                        amount: { type: "number", description: "Transaction amount in INR" },
                        category: { type: "string", description: "Category like Food & Dining, Rent, Salary, etc." },
                        account_name: { type: "string", description: "Name of account used (e.g., 'HDFC Credit Card', 'Cash')" },
                        date: {
                            type: "string",
                            description: "Transaction date. Can be 'today', 'yesterday', or YYYY-MM-DD. Default: today",
                        },
                        description: { type: "string", description: "Optional notes about the transaction" },
                        payment_method: { type: "string", enum: ["upi", "card", "cash", "netbanking", "wallet"] },
                        tags: { type: "array", items: { type: "string" } },
                    },
                    required: ["type", "amount", "category", "account_name"],
                },
            },
            {
                name: "transfer_between_accounts",
                description: "Transfer money between accounts (e.g., paying credit card from bank account, moving to savings). This is NOT income or expense.",
                inputSchema: {
                    type: "object",
                    properties: {
                        from_account: { type: "string" },
                        to_account: { type: "string" },
                        amount: { type: "number" },
                        date: { type: "string", description: "Transfer date (default: today)" },
                        description: { type: "string" },
                    },
                    required: ["from_account", "to_account", "amount"],
                },
            },
            {
                name: "get_account_balance",
                description: "Get current balance of one or all accounts. Balance is calculated from all transactions.",
                inputSchema: { type: "object", properties: { account_name: { type: "string" } } },
            },
            {
                name: "get_transactions",
                description: "Get transaction history with optional filters.",
                inputSchema: {
                    type: "object",
                    properties: {
                        from_date: { type: "string" },
                        to_date: { type: "string" },
                        type: { type: "string", enum: ["income", "expense", "transfer"] },
                        category: { type: "string" },
                        account_name: { type: "string" },
                        search: { type: "string" },
                        limit: { type: "number", description: "default: 20" },
                    },
                },
            },
            {
                name: "edit_transaction",
                description: "Edit an existing transaction. User must provide transaction ID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        transaction_id: { type: "string" },
                        amount: { type: "number" },
                        category: { type: "string" },
                        description: { type: "string" },
                        date: { type: "string" },
                    },
                    required: ["transaction_id"],
                },
            },
            {
                name: "delete_transaction",
                description: "Delete a transaction. User must provide transaction ID.",
                inputSchema: { type: "object", properties: { transaction_id: { type: "string" } }, required: ["transaction_id"] },
            },
            {
                name: "get_summary",
                description: "Get financial summary and analytics for a period.",
                inputSchema: {
                    type: "object",
                    properties: {
                        period: { type: "string", enum: ["this_month", "last_month", "this_year", "custom"] },
                        from_date: { type: "string" },
                        to_date: { type: "string" },
                    },
                    required: ["period"],
                },
            },
            {
                name: "compare_spending",
                description: "Compare spending between two periods (e.g., this month vs last month).",
                inputSchema: {
                    type: "object",
                    properties: {
                        period1: { type: "string", enum: ["this_month", "last_month"] },
                        period2: { type: "string", enum: ["this_month", "last_month"] },
                    },
                    required: ["period1", "period2"],
                },
            },
            {
                name: "set_budget",
                description: "Set monthly budget for a category.",
                inputSchema: {
                    type: "object",
                    properties: { category: { type: "string" }, amount: { type: "number" }, month: { type: "string" } },
                    required: ["category", "amount"],
                },
            },
            {
                name: "get_budget_status",
                description: "Check budget status for current or specific month.",
                inputSchema: { type: "object", properties: { month: { type: "string" }, category: { type: "string" } } },
            },
            {
                name: "get_categories",
                description: "Get list of available categories.",
                inputSchema: { type: "object", properties: { type: { type: "string", enum: ["income", "expense"] } } },
            },
            {
                name: "get_recurring_due",
                description: "Get upcoming recurring transactions that are due soon.",
                inputSchema: { type: "object", properties: { days_ahead: { type: "number" } } },
            },
            // -------------------- Splitwise Tools --------------------
            {
                name: "splitwise_get_current_user",
                description: "Splitwise: Get the authenticated (current) user.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "splitwise_get_friends",
                description: "Splitwise: List friends (optionally include balances summary).",
                inputSchema: {
                    type: "object",
                    properties: {
                        include_balances: { type: "boolean", description: "If true, returns balance per friend (net) by currency." },
                    },
                },
            },
            {
                name: "splitwise_get_net_balances",
                description: "Splitwise: Final amounts you need to GET or OWE from friends (net per friend, per currency).",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "splitwise_get_groups",
                description: "Splitwise: List groups.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "splitwise_get_expenses",
                description: "Splitwise: List expenses (optionally filtered by group_id, friend_id, date range, limit).",
                inputSchema: {
                    type: "object",
                    properties: {
                        group_id: { type: "number" },
                        friend_id: { type: "number" },
                        dated_after: { type: "string", description: "YYYY-MM-DD" },
                        dated_before: { type: "string", description: "YYYY-MM-DD" },
                        limit: { type: "number", description: "default 20" },
                    },
                },
            },
            {
                name: "splitwise_get_expense",
                description: "Splitwise: Get one expense by expense_id.",
                inputSchema: { type: "object", properties: { expense_id: { type: "number" } }, required: ["expense_id"] },
            },
            {
                name: "splitwise_create_expense",
                description: "Splitwise: Create an expense. Provide either explicit users array or split_equally fields.",
                inputSchema: {
                    type: "object",
                    properties: {
                        cost: { type: "number" },
                        description: { type: "string" },
                        group_id: { type: "number" },
                        date: { type: "string", description: "YYYY-MM-DD (optional)" },
                        currency_code: { type: "string", description: "e.g. INR (optional)" },
                        category_id: { type: "number", description: "Splitwise category_id (optional)" },
                        payment: { type: "boolean", description: "If true, marks as payment (optional)" },
                        // Option A: explicit split
                        users: {
                            type: "array",
                            description: "Explicit split. Each user: { user_id, paid_share, owed_share }. Numbers as strings are ok.",
                            items: {
                                type: "object",
                                properties: {
                                    user_id: { type: "number" },
                                    paid_share: { type: "string" },
                                    owed_share: { type: "string" },
                                },
                                required: ["user_id"],
                            },
                        },
                        // Option B: split equally (we compute shares)
                        split_equally: { type: "boolean" },
                        payer_user_id: { type: "number" },
                        participant_user_ids: { type: "array", items: { type: "number" } },
                    },
                    required: ["cost", "description"],
                },
            },
            {
                name: "splitwise_update_expense",
                description: "Splitwise: Update an expense. You can update description/cost/date/group/category/users.",
                inputSchema: {
                    type: "object",
                    properties: {
                        expense_id: { type: "number" },
                        cost: { type: "number" },
                        description: { type: "string" },
                        date: { type: "string" },
                        group_id: { type: "number" },
                        currency_code: { type: "string" },
                        category_id: { type: "number" },
                        payment: { type: "boolean" },
                        users: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: { user_id: { type: "number" }, paid_share: { type: "string" }, owed_share: { type: "string" } },
                                required: ["user_id"],
                            },
                        },
                    },
                    required: ["expense_id"],
                },
            },
            {
                name: "splitwise_delete_expense",
                description: "Splitwise: Delete an expense by expense_id.",
                inputSchema: { type: "object", properties: { expense_id: { type: "number" } }, required: ["expense_id"] },
            },
            {
                name: "splitwise_create_debt",
                description: "Splitwise: Create a simple IOU/debt (from -> to) inside a group (optional).",
                inputSchema: {
                    type: "object",
                    properties: {
                        from: { type: "number", description: "User ID who owes" },
                        to: { type: "number", description: "User ID who is owed" },
                        amount: { type: "number" },
                        description: { type: "string" },
                        group_id: { type: "number" },
                    },
                    required: ["from", "to", "amount", "description"],
                },
            },
            {
                name: "splitwise_get_categories",
                description: "Splitwise: Fetch Splitwise categories.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "splitwise_get_currencies",
                description: "Splitwise: Fetch supported currencies.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "splitwise_get_notifications",
                description: "Splitwise: Fetch notifications.",
                inputSchema: { type: "object", properties: { limit: { type: "number" } } },
            },
        ],
    };
};
const toolCallHandler = async (request) => {
    console.log("🔧 Tool called:", request.params.name);
    const { name, arguments: args } = request.params;
    if (!args)
        throw new Error("No arguments provided");
    // ==================== Splitwise Tools ====================
    if (name.startsWith("splitwise_")) {
        try {
            const sw = getSplitwiseClient();
            if (name === "splitwise_get_current_user") {
                const me = await sw.getCurrentUser();
                return safeJson({ user: me });
            }
            if (name === "splitwise_get_friends") {
                const { include_balances = false } = args;
                const friends = await sw.getFriends();
                if (!include_balances)
                    return safeJson({ count: friends.length, friends });
                const summarized = friends.map((f) => {
                    const balances = extractBalances(f);
                    const nonZero = balances.filter((b) => b.amount !== 0);
                    return {
                        id: f.id,
                        name: normalizeName(f),
                        balances: nonZero,
                    };
                });
                return safeJson({ count: summarized.length, friends: summarized });
            }
            if (name === "splitwise_get_net_balances") {
                const friends = await sw.getFriends();
                const owed_to_you = [];
                const you_owe = [];
                const totals = {};
                for (const f of friends) {
                    const fid = Number(f.id);
                    const fname = normalizeName(f);
                    const balances = extractBalances(f);
                    for (const b of balances) {
                        if (!b.amount)
                            continue;
                        if (!totals[b.currency_code]) {
                            totals[b.currency_code] = { owed_to_you: 0, you_owe: 0, net: 0 };
                        }
                        if (b.amount > 0) {
                            owed_to_you.push({ friend_id: fid, name: fname, currency_code: b.currency_code, amount: b.amount });
                            totals[b.currency_code].owed_to_you += b.amount;
                        }
                        else {
                            you_owe.push({ friend_id: fid, name: fname, currency_code: b.currency_code, amount: b.amount });
                            totals[b.currency_code].you_owe += Math.abs(b.amount);
                        }
                        totals[b.currency_code].net += b.amount;
                    }
                }
                owed_to_you.sort((a, b) => b.amount - a.amount);
                you_owe.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
                return safeJson({
                    owed_to_you,
                    you_owe,
                    totals_by_currency: Object.entries(totals).map(([currency_code, t]) => ({
                        currency_code,
                        total_owed_to_you: Number(t.owed_to_you.toFixed(2)),
                        total_you_owe: Number(t.you_owe.toFixed(2)),
                        net: Number(t.net.toFixed(2)),
                    })),
                });
            }
            if (name === "splitwise_get_groups") {
                const groups = await sw.getGroups();
                return safeJson({ count: groups.length, groups });
            }
            if (name === "splitwise_get_expenses") {
                const { group_id, friend_id, dated_after, dated_before, limit = 20 } = args;
                const payload = { limit };
                if (group_id)
                    payload.group_id = group_id;
                if (friend_id)
                    payload.friend_id = friend_id;
                if (dated_after)
                    payload.dated_after = dated_after;
                if (dated_before)
                    payload.dated_before = dated_before;
                const expenses = await sw.getExpenses(payload);
                return safeJson({ count: expenses.length, expenses });
            }
            if (name === "splitwise_get_expense") {
                const { expense_id } = args;
                const expense = await sw.getExpense({ id: expense_id });
                return safeJson({ expense });
            }
            if (name === "splitwise_create_expense") {
                const { cost, description, group_id, date, currency_code, category_id, payment, users, split_equally, payer_user_id, participant_user_ids, } = args;
                const payload = {
                    cost: String(cost),
                    description,
                };
                if (group_id)
                    payload.group_id = group_id;
                if (date)
                    payload.date = date;
                if (currency_code)
                    payload.currency_code = currency_code;
                if (category_id)
                    payload.category_id = category_id;
                if (typeof payment === "boolean")
                    payload.payment = payment;
                if (Array.isArray(users) && users.length > 0) {
                    payload.users = users;
                }
                else if (split_equally) {
                    if (!payer_user_id || !Array.isArray(participant_user_ids) || participant_user_ids.length < 1) {
                        throw new Error("For split_equally=true, provide payer_user_id and participant_user_ids[]");
                    }
                    payload.users = splitEquallyUsers(Number(cost), Number(payer_user_id), participant_user_ids.map(Number));
                }
                else {
                    throw new Error("Provide either users[] OR split_equally=true with payer_user_id + participant_user_ids[]");
                }
                console.log("📤 Splitwise createExpense payload:", JSON.stringify(payload, null, 2));
                const created = await sw.createExpense(payload);
                console.log("📥 Splitwise createExpense response:", JSON.stringify(created, null, 2));
                if (!created || (Array.isArray(created) && created.length === 0)) {
                    throw new Error("Splitwise API returned empty response - expense may not have been created");
                }
                // Extract expense object from response (SDK may wrap it differently)
                const expense = Array.isArray(created) ? created[0] : created;
                return safeJson({
                    success: true,
                    expense,
                    expense_id: expense?.id || expense?.getId?.(),
                });
            }
            if (name === "splitwise_update_expense") {
                const { expense_id, cost, description, date, group_id, currency_code, category_id, payment, users, } = args;
                const payload = { id: expense_id };
                if (cost !== undefined)
                    payload.cost = String(cost);
                if (description !== undefined)
                    payload.description = description;
                if (date !== undefined)
                    payload.date = date;
                if (group_id !== undefined)
                    payload.group_id = group_id;
                if (currency_code !== undefined)
                    payload.currency_code = currency_code;
                if (category_id !== undefined)
                    payload.category_id = category_id;
                if (typeof payment === "boolean")
                    payload.payment = payment;
                if (Array.isArray(users))
                    payload.users = users;
                console.log("📤 Splitwise updateExpense payload:", JSON.stringify(payload, null, 2));
                const updated = await sw.updateExpense(payload);
                console.log("📥 Splitwise updateExpense response:", JSON.stringify(updated, null, 2));
                return safeJson({ success: true, expense: updated });
            }
            if (name === "splitwise_delete_expense") {
                const { expense_id } = args;
                const deleted = await sw.deleteExpense({ id: expense_id });
                return safeJson({ success: true, result: deleted });
            }
            if (name === "splitwise_create_debt") {
                const { from, to, amount, description, group_id } = args;
                const payload = {
                    from,
                    to,
                    amount: String(amount),
                    description,
                };
                if (group_id)
                    payload.group_id = group_id;
                const debt = await sw.createDebt(payload);
                return safeJson({ success: true, result: debt });
            }
            if (name === "splitwise_get_categories") {
                const categories = await sw.getCategories();
                return safeJson({ categories });
            }
            if (name === "splitwise_get_currencies") {
                const currencies = await sw.getCurrencies();
                return safeJson({ currencies });
            }
            if (name === "splitwise_get_notifications") {
                const { limit } = args;
                const payload = {};
                if (limit)
                    payload.limit = limit;
                const notifications = await sw.getNotifications(payload);
                return safeJson({ notifications });
            }
            throw new Error(`Unknown Splitwise tool: ${name}`);
        }
        catch (err) {
            console.error("❌ Splitwise error:", err?.message || err);
            console.error("Full error:", err);
            return safeJson({
                error: err?.message || "Splitwise error",
                hint: "Check SPLITWISE_CONSUMER_KEY / SPLITWISE_CONSUMER_SECRET (and optionally SPLITWISE_ACCESS_TOKEN).",
                details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            });
        }
    }
    // ==================== Supabase Tools ====================
    if (name === "add_transaction") {
        const { type, amount, category, account_name, date, description, payment_method, tags } = args;
        const account = await findAccount(account_name);
        if (!account) {
            return safeJson({
                error: `Account '${account_name}' not found`,
                available_accounts: (await supabase.from("accounts").select("name").eq("is_active", true)).data,
            });
        }
        const transactionDate = date ? parseDate(date) : new Date().toISOString().split("T")[0];
        const { data: transaction, error } = await supabase
            .from("transactions")
            .insert({
            date: transactionDate,
            type,
            amount,
            category,
            account_id: account.id,
            description: description || null,
            payment_method: payment_method || null,
            tags: tags || null,
        })
            .select()
            .single();
        if (error)
            return safeJson({ error: error.message });
        console.log(`✅ Added ${type}: ₹${amount} in ${category}`);
        return safeJson({
            success: true,
            message: `Recorded ₹${amount} ${type} in ${category} using ${account.name}`,
            transaction: {
                id: transaction.id,
                date: transaction.date,
                type: transaction.type,
                amount: transaction.amount,
                category: transaction.category,
                account_name: account.name,
            },
        });
    }
    if (name === "transfer_between_accounts") {
        const { from_account, to_account, amount, date, description } = args;
        const fromAcc = await findAccount(from_account);
        const toAcc = await findAccount(to_account);
        if (!fromAcc)
            return safeJson({ error: `Account '${from_account}' not found` });
        if (!toAcc)
            return safeJson({ error: `Account '${to_account}' not found` });
        const transferDate = date ? parseDate(date) : new Date().toISOString().split("T")[0];
        const transferId = crypto.randomUUID();
        const { error } = await supabase.from("transactions").insert([
            {
                date: transferDate,
                type: "transfer",
                amount: amount,
                category: "Transfer",
                account_id: fromAcc.id,
                transfer_to_account_id: toAcc.id,
                transfer_id: transferId,
                description: description || `Transfer to ${toAcc.name}`,
            },
        ]);
        if (error)
            return safeJson({ error: error.message });
        console.log(`💸 Transfer: ₹${amount} from ${fromAcc.name} to ${toAcc.name}`);
        return safeJson({
            success: true,
            message: `Transferred ₹${amount} from ${fromAcc.name} to ${toAcc.name}`,
            transfer: { amount, from: fromAcc.name, to: toAcc.name, date: transferDate },
        });
    }
    if (name === "get_account_balance") {
        const { account_name } = args;
        let query = supabase.from("account_balances").select("*");
        if (account_name) {
            const account = await findAccount(account_name);
            if (!account)
                return safeJson({ error: `Account '${account_name}' not found` });
            query = query.eq("id", account.id);
        }
        const { data: balances, error } = await query;
        if (error)
            return safeJson({ error: error.message });
        return safeJson({
            balances: balances?.map((b) => ({
                account: b.name,
                type: b.type,
                current_balance: Number(b.current_balance),
                initial_balance: Number(b.initial_balance),
            })),
        });
    }
    if (name === "get_transactions") {
        const { from_date, to_date, type, category, account_name, search, limit = 20 } = args;
        let query = supabase
            .from("transactions")
            .select(`
        *,
        accounts:account_id (name, type),
        to_account:transfer_to_account_id (name)
      `)
            .order("date", { ascending: false })
            .limit(limit);
        if (from_date)
            query = query.gte("date", from_date);
        if (to_date)
            query = query.lte("date", to_date);
        if (type)
            query = query.eq("type", type);
        if (category)
            query = query.eq("category", category);
        const { data: transactions, error } = await query;
        if (error)
            return safeJson({ error: error.message });
        let filtered = transactions || [];
        if (account_name) {
            filtered = filtered.filter((t) => t.accounts?.name?.toLowerCase().includes(account_name.toLowerCase()));
        }
        if (search) {
            const sLower = search.toLowerCase();
            filtered = filtered.filter((t) => t.description?.toLowerCase().includes(sLower) || t.category?.toLowerCase().includes(sLower));
        }
        return safeJson({
            count: filtered.length,
            transactions: filtered.map((t) => ({
                id: t.id,
                date: t.date,
                type: t.type,
                amount: t.amount,
                category: t.category,
                account: t.accounts?.name,
                to_account: t.to_account?.name,
                description: t.description,
                payment_method: t.payment_method,
                tags: t.tags,
            })),
        });
    }
    if (name === "edit_transaction") {
        const { transaction_id, amount, category, description, date } = args;
        const updates = {};
        if (amount !== undefined)
            updates.amount = amount;
        if (category !== undefined)
            updates.category = category;
        if (description !== undefined)
            updates.description = description;
        if (date !== undefined)
            updates.date = parseDate(date);
        const { data: updated, error } = await supabase
            .from("transactions")
            .update(updates)
            .eq("id", transaction_id)
            .select()
            .single();
        if (error)
            return safeJson({ error: error.message });
        return safeJson({ success: true, message: "Transaction updated successfully", transaction: updated });
    }
    if (name === "delete_transaction") {
        const { transaction_id } = args;
        const { error } = await supabase.from("transactions").delete().eq("id", transaction_id);
        if (error)
            return safeJson({ error: error.message });
        return safeJson({ success: true, message: "Transaction deleted successfully" });
    }
    if (name === "get_summary") {
        const { period, from_date, to_date } = args;
        let startDate;
        let endDate;
        if (period === "custom" && from_date && to_date) {
            startDate = from_date;
            endDate = to_date;
        }
        else {
            const dates = getPeriodDates(period);
            startDate = dates.startDate;
            endDate = dates.endDate;
        }
        const { data: transactions, error } = await supabase
            .from("transactions")
            .select("*")
            .gte("date", startDate)
            .lte("date", endDate);
        if (error)
            return safeJson({ error: error.message });
        const income = (transactions || []).filter((t) => t.type === "income");
        const expenses = (transactions || []).filter((t) => t.type === "expense");
        const totalIncome = income.reduce((sum, t) => sum + Number(t.amount), 0);
        const totalExpense = expenses.reduce((sum, t) => sum + Number(t.amount), 0);
        const expensesByCategory = {};
        for (const t of expenses)
            expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + Number(t.amount);
        const incomeByCategory = {};
        for (const t of income)
            incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + Number(t.amount);
        return safeJson({
            period,
            from_date: startDate,
            to_date: endDate,
            total_income: totalIncome,
            total_expense: totalExpense,
            net_savings: totalIncome - totalExpense,
            transaction_count: (transactions || []).length,
            expenses_by_category: Object.entries(expensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => ({ category, amount })),
            income_by_category: Object.entries(incomeByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => ({ category, amount })),
        });
    }
    if (name === "compare_spending") {
        const { period1, period2 } = args;
        const dates1 = getPeriodDates(period1);
        const dates2 = getPeriodDates(period2);
        const { data: trans1 } = await supabase
            .from("transactions")
            .select("*")
            .eq("type", "expense")
            .gte("date", dates1.startDate)
            .lte("date", dates1.endDate);
        const { data: trans2 } = await supabase
            .from("transactions")
            .select("*")
            .eq("type", "expense")
            .gte("date", dates2.startDate)
            .lte("date", dates2.endDate);
        const total1 = (trans1 || []).reduce((sum, t) => sum + Number(t.amount), 0);
        const total2 = (trans2 || []).reduce((sum, t) => sum + Number(t.amount), 0);
        const change = total1 - total2;
        const changePercent = total2 > 0 ? ((change / total2) * 100).toFixed(2) : "0";
        return safeJson({
            period1: { name: period1, total_expense: total1, from_date: dates1.startDate, to_date: dates1.endDate },
            period2: { name: period2, total_expense: total2, from_date: dates2.startDate, to_date: dates2.endDate },
            comparison: { difference: change, percent_change: changePercent, trend: change > 0 ? "increased" : change < 0 ? "decreased" : "same" },
        });
    }
    if (name === "set_budget") {
        const { category, amount, month } = args;
        const today = new Date();
        const budgetMonth = month || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const { data: budget, error } = await supabase
            .from("budgets")
            .upsert({ category, month: budgetMonth, limit_amount: amount }, { onConflict: "category,month" })
            .select()
            .single();
        if (error)
            return safeJson({ error: error.message });
        return safeJson({ success: true, message: `Budget set for ${category}: ₹${amount} for ${budgetMonth}`, budget });
    }
    if (name === "get_budget_status") {
        const { month, category } = args;
        const today = new Date();
        const targetMonth = month || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        let query = supabase.from("budgets").select("*").eq("month", targetMonth);
        if (category)
            query = query.eq("category", category);
        const { data: budgets, error } = await query;
        if (error)
            return safeJson({ error: error.message });
        const startDate = `${targetMonth}-01`;
        const endDate = `${targetMonth}-31`;
        const results = await Promise.all((budgets || []).map(async (budget) => {
            const { data: transactions } = await supabase
                .from("transactions")
                .select("amount")
                .eq("type", "expense")
                .eq("category", budget.category)
                .gte("date", startDate)
                .lte("date", endDate);
            const spent = (transactions || []).reduce((sum, t) => sum + Number(t.amount), 0);
            const remaining = Number(budget.limit_amount) - spent;
            const percentUsed = Number(budget.limit_amount) > 0 ? ((spent / Number(budget.limit_amount)) * 100).toFixed(2) : "0.00";
            return {
                category: budget.category,
                budget_limit: Number(budget.limit_amount),
                spent,
                remaining,
                percent_used: percentUsed,
                status: spent > Number(budget.limit_amount)
                    ? "over_budget"
                    : spent > Number(budget.limit_amount) * 0.8
                        ? "warning"
                        : "healthy",
            };
        }));
        return safeJson({ month: targetMonth, budgets: results });
    }
    if (name === "get_categories") {
        const { type } = args;
        let query = supabase.from("categories").select("*").eq("is_active", true).order("name");
        if (type)
            query = query.eq("type", type);
        const { data: categories, error } = await query;
        if (error)
            return safeJson({ error: error.message });
        return safeJson({ categories: categories?.map((c) => ({ name: c.name, type: c.type })) });
    }
    if (name === "get_recurring_due") {
        const { days_ahead = 7 } = args;
        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + days_ahead);
        const { data: recurring, error } = await supabase
            .from("recurring_transactions")
            .select("*")
            .eq("is_active", true)
            .lte("next_due_date", futureDate.toISOString().split("T")[0])
            .order("next_due_date");
        if (error)
            return safeJson({ error: error.message });
        return safeJson({
            upcoming_count: recurring?.length || 0,
            recurring_transactions: (recurring || []).map((r) => ({
                description: r.description,
                amount: r.amount,
                category: r.category,
                frequency: r.frequency,
                next_due_date: r.next_due_date,
                days_until_due: Math.ceil((new Date(r.next_due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
            })),
        });
    }
    throw new Error(`Unknown tool: ${name}`);
};
// ==================== HTTP Server Setup ====================
const sessions = new Map();
app.post("/mcp", async (req, res) => {
    try {
        const { method, id, params } = req.body;
        if (!id && id !== 0)
            return res.status(202).end();
        if (method === "initialize") {
            const sessionId = Math.random().toString(36).substring(7);
            sessions.set(sessionId, {});
            res.setHeader("Mcp-Session-Id", sessionId);
            res.setHeader("Content-Type", "application/json");
            return res.json({
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2025-11-25",
                    capabilities: { tools: {} },
                    serverInfo: { name: "expense-mcp-server", version: "2.1.0" },
                },
            });
        }
        if (method === "tools/list") {
            const result = await toolsListHandler();
            return res.json({ jsonrpc: "2.0", id, result });
        }
        if (method === "tools/call") {
            const result = await toolCallHandler({ params });
            return res.json({ jsonrpc: "2.0", id, result });
        }
        res.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
    catch (error) {
        console.error("❌ Error:", error?.message || error);
        res.status(500).json({
            jsonrpc: "2.0",
            id: req.body.id || null,
            error: { code: -32603, message: error?.message || "Internal error" },
        });
    }
});
app.get("/health", (req, res) => {
    res.json({ status: "ok", server: "expense-mcp-server", version: "2.1.0" });
});
app.get("/", (req, res) => {
    res.json({
        status: "running",
        name: "expense-mcp-server",
        version: "2.1.0",
        features: [
            "Transactions (add/edit/delete/search)",
            "Account transfers",
            "Account balances (calculated)",
            "Budget management",
            "Spending analytics",
            "Recurring transactions tracking",
            "Splitwise: friends/groups/expenses CRUD",
            "Splitwise: final net balances (owe/get)",
        ],
    });
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`\n💰 Expense MCP Server v2.1 running!`);
    console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health\n`);
});
//# sourceMappingURL=server.js.map