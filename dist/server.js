// server.ts - Complete Expense Tracking MCP Server with All Features
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
const app = express();
app.use(cors());
app.use(express.json());
// ==================== Supabase Setup ====================
const SUPABASE_URL = "https://eixgyftdoolsoobifaoj.supabase.co";
const SUPABASE_KEY = "sb_publishable_J-AgZq1M_zXtIhO3khpOOQ_wcmBV2rW";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// ==================== Helper Functions ====================
function parseDate(dateStr) {
    const today = new Date();
    if (dateStr.toLowerCase() === "today") {
        return today.toISOString().split('T')[0];
    }
    if (dateStr.toLowerCase() === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0];
    }
    try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
        }
    }
    catch (e) {
        return today.toISOString().split('T')[0];
    }
    return today.toISOString().split('T')[0];
}
async function findAccount(accountName) {
    const { data: accounts, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true);
    if (error || !accounts)
        return null;
    let account = accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
    if (!account) {
        account = accounts.find(a => a.name.toLowerCase().includes(accountName.toLowerCase()) ||
            accountName.toLowerCase().includes(a.name.toLowerCase()));
    }
    return account || null;
}
function getPeriodDates(period) {
    const today = new Date();
    let startDate;
    let endDate;
    if (period === "this_month") {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
    }
    else if (period === "last_month") {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        startDate = lastMonth.toISOString().split('T')[0];
        endDate = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
    }
    else if (period === "this_year") {
        startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
    }
    else {
        // Default to this month
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
    }
    return { startDate, endDate };
}
// ==================== Tool Handlers ====================
const toolsListHandler = async () => {
    console.log("📋 Tools list requested");
    return {
        tools: [
            {
                name: "add_transaction",
                description: "Record a new income or expense transaction. Use this when user mentions spending money or receiving money.",
                inputSchema: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["income", "expense"],
                            description: "Type of transaction"
                        },
                        amount: {
                            type: "number",
                            description: "Transaction amount in INR"
                        },
                        category: {
                            type: "string",
                            description: "Category like Food & Dining, Rent, Salary, etc."
                        },
                        account_name: {
                            type: "string",
                            description: "Name of account used (e.g., 'HDFC Credit Card', 'Cash')"
                        },
                        date: {
                            type: "string",
                            description: "Transaction date. Can be 'today', 'yesterday', or YYYY-MM-DD. Default: today"
                        },
                        description: {
                            type: "string",
                            description: "Optional notes about the transaction"
                        },
                        payment_method: {
                            type: "string",
                            enum: ["upi", "card", "cash", "netbanking", "wallet"],
                            description: "How payment was made"
                        },
                        tags: {
                            type: "array",
                            items: { type: "string" },
                            description: "Optional tags for flexible categorization"
                        }
                    },
                    required: ["type", "amount", "category", "account_name"]
                }
            },
            {
                name: "transfer_between_accounts",
                description: "Transfer money between accounts (e.g., paying credit card from bank account, moving to savings). This is NOT income or expense.",
                inputSchema: {
                    type: "object",
                    properties: {
                        from_account: {
                            type: "string",
                            description: "Account to transfer from"
                        },
                        to_account: {
                            type: "string",
                            description: "Account to transfer to"
                        },
                        amount: {
                            type: "number",
                            description: "Amount to transfer"
                        },
                        date: {
                            type: "string",
                            description: "Transfer date (default: today)"
                        },
                        description: {
                            type: "string",
                            description: "Optional notes (e.g., 'Credit card payment')"
                        }
                    },
                    required: ["from_account", "to_account", "amount"]
                }
            },
            {
                name: "get_account_balance",
                description: "Get current balance of one or all accounts. Balance is calculated from all transactions.",
                inputSchema: {
                    type: "object",
                    properties: {
                        account_name: {
                            type: "string",
                            description: "Specific account name, or omit to get all accounts"
                        }
                    }
                }
            },
            {
                name: "get_transactions",
                description: "Get transaction history with optional filters.",
                inputSchema: {
                    type: "object",
                    properties: {
                        from_date: {
                            type: "string",
                            description: "Start date (YYYY-MM-DD)"
                        },
                        to_date: {
                            type: "string",
                            description: "End date (YYYY-MM-DD)"
                        },
                        type: {
                            type: "string",
                            enum: ["income", "expense", "transfer"],
                            description: "Filter by transaction type"
                        },
                        category: {
                            type: "string",
                            description: "Filter by category"
                        },
                        account_name: {
                            type: "string",
                            description: "Filter by account"
                        },
                        search: {
                            type: "string",
                            description: "Search in description and category"
                        },
                        limit: {
                            type: "number",
                            description: "Number of transactions to return (default: 20)"
                        }
                    }
                }
            },
            {
                name: "edit_transaction",
                description: "Edit an existing transaction. User must provide transaction ID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        transaction_id: {
                            type: "string",
                            description: "UUID of the transaction to edit"
                        },
                        amount: {
                            type: "number",
                            description: "New amount"
                        },
                        category: {
                            type: "string",
                            description: "New category"
                        },
                        description: {
                            type: "string",
                            description: "New description"
                        },
                        date: {
                            type: "string",
                            description: "New date"
                        }
                    },
                    required: ["transaction_id"]
                }
            },
            {
                name: "delete_transaction",
                description: "Delete a transaction. User must provide transaction ID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        transaction_id: {
                            type: "string",
                            description: "UUID of the transaction to delete"
                        }
                    },
                    required: ["transaction_id"]
                }
            },
            {
                name: "get_summary",
                description: "Get financial summary and analytics for a period.",
                inputSchema: {
                    type: "object",
                    properties: {
                        period: {
                            type: "string",
                            enum: ["this_month", "last_month", "this_year", "custom"],
                            description: "Time period for summary"
                        },
                        from_date: {
                            type: "string",
                            description: "Start date for custom period"
                        },
                        to_date: {
                            type: "string",
                            description: "End date for custom period"
                        }
                    },
                    required: ["period"]
                }
            },
            {
                name: "compare_spending",
                description: "Compare spending between two periods (e.g., this month vs last month).",
                inputSchema: {
                    type: "object",
                    properties: {
                        period1: {
                            type: "string",
                            enum: ["this_month", "last_month"],
                            description: "First period to compare"
                        },
                        period2: {
                            type: "string",
                            enum: ["this_month", "last_month"],
                            description: "Second period to compare"
                        }
                    },
                    required: ["period1", "period2"]
                }
            },
            {
                name: "set_budget",
                description: "Set monthly budget for a category.",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Category name"
                        },
                        amount: {
                            type: "number",
                            description: "Budget limit amount"
                        },
                        month: {
                            type: "string",
                            description: "Month in YYYY-MM format (default: current month)"
                        }
                    },
                    required: ["category", "amount"]
                }
            },
            {
                name: "get_budget_status",
                description: "Check budget status for current or specific month.",
                inputSchema: {
                    type: "object",
                    properties: {
                        month: {
                            type: "string",
                            description: "Month in YYYY-MM format (default: current month)"
                        },
                        category: {
                            type: "string",
                            description: "Specific category, or omit for all categories"
                        }
                    }
                }
            },
            {
                name: "get_categories",
                description: "Get list of available categories.",
                inputSchema: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["income", "expense"],
                            description: "Filter by type"
                        }
                    }
                }
            },
            {
                name: "get_recurring_due",
                description: "Get upcoming recurring transactions that are due soon.",
                inputSchema: {
                    type: "object",
                    properties: {
                        days_ahead: {
                            type: "number",
                            description: "Look ahead this many days (default: 7)"
                        }
                    }
                }
            }
        ]
    };
};
const toolCallHandler = async (request) => {
    console.log("🔧 Tool called:", request.params.name);
    const { name, arguments: args } = request.params;
    if (!args) {
        throw new Error("No arguments provided");
    }
    // ADD TRANSACTION
    if (name === "add_transaction") {
        const { type, amount, category, account_name, date, description, payment_method, tags } = args;
        const account = await findAccount(account_name);
        if (!account) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: `Account '${account_name}' not found`,
                            available_accounts: (await supabase.from('accounts').select('name').eq('is_active', true)).data
                        })
                    }]
            };
        }
        const transactionDate = date ? parseDate(date) : new Date().toISOString().split('T')[0];
        const { data: transaction, error } = await supabase
            .from('transactions')
            .insert({
            date: transactionDate,
            type,
            amount,
            category,
            account_id: account.id,
            description: description || null,
            payment_method: payment_method || null,
            tags: tags || null
        })
            .select()
            .single();
        if (error) {
            console.error("Error adding transaction:", error);
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        console.log(`✅ Added ${type}: ₹${amount} in ${category}`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        message: `Recorded ₹${amount} ${type} in ${category} using ${account.name}`,
                        transaction: {
                            id: transaction.id,
                            date: transaction.date,
                            type: transaction.type,
                            amount: transaction.amount,
                            category: transaction.category,
                            account_name: account.name
                        }
                    })
                }]
        };
    }
    // TRANSFER BETWEEN ACCOUNTS
    if (name === "transfer_between_accounts") {
        const { from_account, to_account, amount, date, description } = args;
        const fromAcc = await findAccount(from_account);
        const toAcc = await findAccount(to_account);
        if (!fromAcc) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: `Account '${from_account}' not found` })
                    }]
            };
        }
        if (!toAcc) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: `Account '${to_account}' not found` })
                    }]
            };
        }
        const transferDate = date ? parseDate(date) : new Date().toISOString().split('T')[0];
        const transferId = crypto.randomUUID();
        // Create paired transfer transactions
        const { error } = await supabase
            .from('transactions')
            .insert([
            {
                date: transferDate,
                type: 'transfer',
                amount: amount,
                category: 'Transfer',
                account_id: fromAcc.id,
                transfer_to_account_id: toAcc.id,
                transfer_id: transferId,
                description: description || `Transfer to ${toAcc.name}`
            }
        ]);
        if (error) {
            console.error("Error creating transfer:", error);
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        console.log(`💸 Transfer: ₹${amount} from ${fromAcc.name} to ${toAcc.name}`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        message: `Transferred ₹${amount} from ${fromAcc.name} to ${toAcc.name}`,
                        transfer: {
                            amount,
                            from: fromAcc.name,
                            to: toAcc.name,
                            date: transferDate
                        }
                    })
                }]
        };
    }
    // GET ACCOUNT BALANCE
    if (name === "get_account_balance") {
        const { account_name } = args;
        let query = supabase
            .from('account_balances')
            .select('*');
        if (account_name) {
            const account = await findAccount(account_name);
            if (!account) {
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({ error: `Account '${account_name}' not found` })
                        }]
                };
            }
            query = query.eq('id', account.id);
        }
        const { data: balances, error } = await query;
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        balances: balances?.map(b => ({
                            account: b.name,
                            type: b.type,
                            current_balance: Number(b.current_balance),
                            initial_balance: Number(b.initial_balance)
                        }))
                    })
                }]
        };
    }
    // GET TRANSACTIONS
    if (name === "get_transactions") {
        const { from_date, to_date, type, category, account_name, search, limit = 20 } = args;
        let query = supabase
            .from('transactions')
            .select(`
        *,
        accounts:account_id (name, type),
        to_account:transfer_to_account_id (name)
      `)
            .order('date', { ascending: false })
            .limit(limit);
        if (from_date)
            query = query.gte('date', from_date);
        if (to_date)
            query = query.lte('date', to_date);
        if (type)
            query = query.eq('type', type);
        if (category)
            query = query.eq('category', category);
        const { data: transactions, error } = await query;
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        let filteredTransactions = transactions || [];
        if (account_name) {
            filteredTransactions = filteredTransactions.filter(t => t.accounts?.name.toLowerCase().includes(account_name.toLowerCase()));
        }
        if (search) {
            const searchLower = search.toLowerCase();
            filteredTransactions = filteredTransactions.filter(t => t.description?.toLowerCase().includes(searchLower) ||
                t.category.toLowerCase().includes(searchLower));
        }
        console.log(`📊 Retrieved ${filteredTransactions.length} transactions`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        count: filteredTransactions.length,
                        transactions: filteredTransactions.map(t => ({
                            id: t.id,
                            date: t.date,
                            type: t.type,
                            amount: t.amount,
                            category: t.category,
                            account: t.accounts?.name,
                            to_account: t.to_account?.name,
                            description: t.description,
                            payment_method: t.payment_method,
                            tags: t.tags
                        }))
                    })
                }]
        };
    }
    // EDIT TRANSACTION
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
            .from('transactions')
            .update(updates)
            .eq('id', transaction_id)
            .select()
            .single();
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        console.log(`✏️ Updated transaction ${transaction_id}`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        message: "Transaction updated successfully",
                        transaction: updated
                    })
                }]
        };
    }
    // DELETE TRANSACTION
    if (name === "delete_transaction") {
        const { transaction_id } = args;
        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', transaction_id);
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        console.log(`🗑️ Deleted transaction ${transaction_id}`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        message: "Transaction deleted successfully"
                    })
                }]
        };
    }
    // GET SUMMARY
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
            .from('transactions')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate);
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        const income = transactions?.filter(t => t.type === 'income') || [];
        const expenses = transactions?.filter(t => t.type === 'expense') || [];
        const totalIncome = income.reduce((sum, t) => sum + Number(t.amount), 0);
        const totalExpense = expenses.reduce((sum, t) => sum + Number(t.amount), 0);
        const expensesByCategory = {};
        expenses.forEach(t => {
            expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + Number(t.amount);
        });
        const incomeByCategory = {};
        income.forEach(t => {
            incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + Number(t.amount);
        });
        console.log(`📈 Summary: Income ₹${totalIncome}, Expense ₹${totalExpense}`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        period: period,
                        from_date: startDate,
                        to_date: endDate,
                        total_income: totalIncome,
                        total_expense: totalExpense,
                        net_savings: totalIncome - totalExpense,
                        transaction_count: transactions?.length || 0,
                        expenses_by_category: Object.entries(expensesByCategory)
                            .sort((a, b) => b[1] - a[1])
                            .map(([category, amount]) => ({ category, amount })),
                        income_by_category: Object.entries(incomeByCategory)
                            .sort((a, b) => b[1] - a[1])
                            .map(([category, amount]) => ({ category, amount })),
                    })
                }]
        };
    }
    // COMPARE SPENDING
    if (name === "compare_spending") {
        const { period1, period2 } = args;
        const dates1 = getPeriodDates(period1);
        const dates2 = getPeriodDates(period2);
        const { data: trans1 } = await supabase
            .from('transactions')
            .select('*')
            .eq('type', 'expense')
            .gte('date', dates1.startDate)
            .lte('date', dates1.endDate);
        const { data: trans2 } = await supabase
            .from('transactions')
            .select('*')
            .eq('type', 'expense')
            .gte('date', dates2.startDate)
            .lte('date', dates2.endDate);
        const total1 = trans1?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const total2 = trans2?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const change = total1 - total2;
        const changePercent = total2 > 0 ? ((change / total2) * 100).toFixed(2) : 0;
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        period1: {
                            name: period1,
                            total_expense: total1,
                            from_date: dates1.startDate,
                            to_date: dates1.endDate
                        },
                        period2: {
                            name: period2,
                            total_expense: total2,
                            from_date: dates2.startDate,
                            to_date: dates2.endDate
                        },
                        comparison: {
                            difference: change,
                            percent_change: changePercent,
                            trend: change > 0 ? "increased" : change < 0 ? "decreased" : "same"
                        }
                    })
                }]
        };
    }
    // SET BUDGET
    if (name === "set_budget") {
        const { category, amount, month } = args;
        const today = new Date();
        const budgetMonth = month || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const { data: budget, error } = await supabase
            .from('budgets')
            .upsert({
            category,
            month: budgetMonth,
            limit_amount: amount
        }, { onConflict: 'category,month' })
            .select()
            .single();
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        console.log(`💰 Set budget: ${category} = ₹${amount} for ${budgetMonth}`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        message: `Budget set for ${category}: ₹${amount} for ${budgetMonth}`,
                        budget
                    })
                }]
        };
    }
    // GET BUDGET STATUS
    if (name === "get_budget_status") {
        const { month, category } = args;
        const today = new Date();
        const targetMonth = month || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        let query = supabase
            .from('budgets')
            .select('*')
            .eq('month', targetMonth);
        if (category) {
            query = query.eq('category', category);
        }
        const { data: budgets, error } = await query;
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        // Get actual spending for each budget category
        const startDate = `${targetMonth}-01`;
        const endDate = `${targetMonth}-31`;
        const results = await Promise.all((budgets || []).map(async (budget) => {
            const { data: transactions } = await supabase
                .from('transactions')
                .select('amount')
                .eq('type', 'expense')
                .eq('category', budget.category)
                .gte('date', startDate)
                .lte('date', endDate);
            const spent = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
            const remaining = budget.limit_amount - spent;
            const percentUsed = ((spent / budget.limit_amount) * 100).toFixed(2);
            return {
                category: budget.category,
                budget_limit: budget.limit_amount,
                spent: spent,
                remaining: remaining,
                percent_used: percentUsed,
                status: spent > budget.limit_amount ? 'over_budget' :
                    spent > budget.limit_amount * 0.8 ? 'warning' : 'healthy'
            };
        }));
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        month: targetMonth,
                        budgets: results
                    })
                }]
        };
    }
    // GET CATEGORIES
    if (name === "get_categories") {
        const { type } = args;
        let query = supabase
            .from('categories')
            .select('*')
            .eq('is_active', true)
            .order('name');
        if (type) {
            query = query.eq('type', type);
        }
        const { data: categories, error } = await query;
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        categories: categories?.map(c => ({
                            name: c.name,
                            type: c.type
                        }))
                    })
                }]
        };
    }
    // GET RECURRING DUE
    if (name === "get_recurring_due") {
        const { days_ahead = 7 } = args;
        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + days_ahead);
        const { data: recurring, error } = await supabase
            .from('recurring_transactions')
            .select('*')
            .eq('is_active', true)
            .lte('next_due_date', futureDate.toISOString().split('T')[0])
            .order('next_due_date');
        if (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: error.message })
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        upcoming_count: recurring?.length || 0,
                        recurring_transactions: recurring?.map(r => ({
                            description: r.description,
                            amount: r.amount,
                            category: r.category,
                            frequency: r.frequency,
                            next_due_date: r.next_due_date,
                            days_until_due: Math.ceil((new Date(r.next_due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                        }))
                    })
                }]
        };
    }
    throw new Error(`Unknown tool: ${name}`);
};
// ==================== HTTP Server Setup ====================
const sessions = new Map();
app.post("/mcp", async (req, res) => {
    try {
        const { method, id, params } = req.body;
        if (!id && id !== 0) {
            return res.status(202).end();
        }
        if (method === "initialize") {
            const sessionId = Math.random().toString(36).substring(7);
            sessions.set(sessionId, {});
            res.setHeader("Mcp-Session-Id", sessionId);
            res.setHeader("Content-Type", "application/json");
            return res.json({
                jsonrpc: "2.0",
                id: id,
                result: {
                    protocolVersion: "2025-11-25",
                    capabilities: { tools: {} },
                    serverInfo: {
                        name: "expense-mcp-server",
                        version: "2.0.0",
                    },
                },
            });
        }
        if (method === "tools/list") {
            const result = await toolsListHandler();
            return res.json({
                jsonrpc: "2.0",
                id: id,
                result: result,
            });
        }
        if (method === "tools/call") {
            const result = await toolCallHandler({ params });
            return res.json({
                jsonrpc: "2.0",
                id: id,
                result: result,
            });
        }
        res.json({
            jsonrpc: "2.0",
            id: id,
            error: {
                code: -32601,
                message: `Method not found: ${method}`,
            },
        });
    }
    catch (error) {
        console.error("❌ Error:", error.message);
        res.status(500).json({
            jsonrpc: "2.0",
            id: req.body.id || null,
            error: {
                code: -32603,
                message: error.message || "Internal error",
            },
        });
    }
});
app.get("/health", (req, res) => {
    res.json({ status: "ok", server: "expense-mcp-server", version: "2.0.0" });
});
app.get("/", (req, res) => {
    res.json({
        status: "running",
        name: "expense-mcp-server",
        version: "2.0.0",
        features: [
            "Transactions (add/edit/delete/search)",
            "Account transfers",
            "Account balances (calculated)",
            "Budget management",
            "Spending analytics",
            "Recurring transactions tracking"
        ]
    });
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`\n💰 Expense MCP Server v2.0 running!`);
    console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health\n`);
});
//# sourceMappingURL=server.js.map