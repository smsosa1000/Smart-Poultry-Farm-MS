// ─── Smart Poultry Farm — Gemini AI Fallback Engine ──────────────────────────
//
// When the template-matching engine can't understand a user's question,
// this module sends the prompt to Google Gemini with:
//   1. The full database schema (table names + columns)
//   2. The user's ROLE so Gemini can enforce access control
//   3. Strict instructions to return ONLY a SELECT query (no mutations)
//
// The generated SQL is validated, executed, and returned as structured data.
//
// SECURITY LAYERS:
//   • Gemini is told which tables the role CAN'T access
//   • Generated SQL is scanned for forbidden keywords (DROP, DELETE, UPDATE, etc.)
//   • Only SELECT statements are executed
//   • Results are capped at 100 rows
// ─────────────────────────────────────────────────────────────────────────────

'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../config/db');

// ── Schema description (matches actual DB on disk) ──────────────────────────
const FULL_SCHEMA = `
DATABASE: SmartPoultryFarm

TABLE Worker (worker_id PK, FName, LName, national_ID UNIQUE, job_title, hire_date, monthly_salary)
TABLE Manager (worker_id PK/FK→Worker, contract_type, years_experience, education_level) — ISA subtype
TABLE Farmer_Worker (worker_id PK/FK→Worker, assigned_area, shift_time) — ISA subtype
TABLE Technician (worker_id PK/FK→Worker, specialization) — ISA subtype
TABLE User (user_id PK, username UNIQUE, password_hash, user_role ENUM('Manager','Farmer_Worker','Technician'), created_at, worker_id FK→Worker UNIQUE)
TABLE Device (device_id PK, device_type, fuel_type)
TABLE Medicine (medicine_id PK, medicine_name, unit, price_per_unit)
TABLE Cycle (cycle_id PK, breed_type, initial_chicks, chick_price_per_unit, start_date, end_date, cycle_status ENUM('active','closed'), manager_worker_id FK→Manager)
TABLE Assigned_To (worker_id FK→Farmer_Worker, cycle_id FK→Cycle) — M:N
TABLE Daily_Log (log_id+cycle_id composite PK, WEAK entity of Cycle, log_date, temp_celsius, humidity, ammonia_level, water_consumption, notes)
TABLE Daily_Feed (log_id+cycle_id composite PK/FK→Daily_Log, quantity, price)
TABLE Daily_Mortality (log_id+cycle_id composite PK/FK→Daily_Log, dead_count, cause)
TABLE Sale (sale_id PK, cycle_id FK→Cycle, manager_worker_id FK→Manager, sale_date, birds_sold, total_weight_kg, price_per_kg, total_revenue VIRTUAL=total_weight_kg*price_per_kg)
TABLE Expense (expense_id PK, cycle_id FK→Cycle, category VARCHAR, expense_description, amount, expense_date)
TABLE Treatment (treatment_id PK, cycle_id FK→Cycle, medicine_id FK→Medicine, treatment_date, quantity_used)
TABLE Device_Usage (usage_id+device_id+cycle_id composite PK, hours, cost)
TABLE Maintains (worker_id+device_id+maintenance_datetime composite PK, M:N Technician↔Device, maintenance_description, maintenance_status ENUM)

VIEWS:
  Cycle_Living_Birds (cycle_id, initial_chicks, total_dead, living_birds)
  Treatment_Details (treatment_id, cycle_id, treatment_date, medicine_name, unit, quantity_used, price_per_unit, total_cost)
  Cycle_Feed_Cost (cycle_id, total_feed_qty, total_feed_cost)
  Cycle_Profit (cycle_id, breed_type, start_date, end_date, cycle_status, chick_cost, total_revenue, total_expenses, total_feed_cost, total_treatment_cost, total_device_usage_cost, total_cost, net_profit)

CURRENCY: All monetary values are in Egyptian Pounds (EGP).
`;

// ── RBAC: define what each role CANNOT see ──────────────────────────────────
const RESTRICTED_TABLES = {
    Farmer_Worker: [
        'Sale', 'Expense', 'Cycle_Profit', 'Worker', 'User'
    ],
    Technician: [
        'Sale', 'Expense', 'Cycle_Profit'
    ],
};

// ── Forbidden SQL patterns (mutation prevention) ────────────────────────────
const FORBIDDEN_PATTERNS = [
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|REPLACE)\b/i,
    /\bINTO\s+OUTFILE\b/i,
    /\bLOAD\s+DATA\b/i,
    /\bSLEEP\s*\(/i,
    /\bBENCHMARK\s*\(/i,
    /;\s*(INSERT|UPDATE|DELETE|DROP)/i,    // multi-statement injection
    /--\s/,                                // SQL comment injection
    /\/\*/,                                // block comment injection
];

// ── Build the system prompt for Gemini ──────────────────────────────────────
function buildSystemPrompt(userRole, isAdmin) {
    const restricted = isAdmin ? [] : (RESTRICTED_TABLES[userRole] || []);
    const restrictedNote = restricted.length > 0
        ? `\n\n⚠️ ACCESS CONTROL: The user's role is "${userRole}". They are NOT allowed to query these tables/views: ${restricted.join(', ')}. If the user asks about data in those tables, respond with EXACTLY: ACCESS_DENIED`
        : `\n\nThe user is an ${isAdmin ? 'Administrator' : 'Manager'} with full data access.`;

    return `You are an expert MySQL query generator for a Smart Poultry Farm Management System.

SCHEMA:
${FULL_SCHEMA}

RULES:
1. Generate ONLY a single SELECT statement. No INSERT, UPDATE, DELETE, DROP, or any DDL/DML.
2. Return ONLY the raw SQL query — no explanations, no markdown, no backticks, no comments.
3. Use proper JOINs and aliases. Prefer views when they simplify the query.
4. Always use table aliases for clarity.
5. LIMIT results to 100 rows maximum.
6. For date calculations use MySQL functions (CURDATE(), DATE_SUB, DATEDIFF, etc.).
7. Format monetary values — they are in EGP (Egyptian Pounds).
8. When showing worker names, use CONCAT(w.FName, ' ', w.LName) AS full_name.
9. If the question is unclear or unrelated to the farm database, respond with EXACTLY: UNCLEAR
10. Never expose password_hash or sensitive credentials.
11. If multiple interpretations exist, choose the most useful one for farm management.
${restrictedNote}`;
}

// ── Main Gemini fallback function ───────────────────────────────────────────
async function geminiQuery(userPrompt, userRole, username) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            success: false,
            error: '🔑 Gemini API key not configured. Add GEMINI_API_KEY to your .env file.',
            error_ar: '🔑 مفتاح Gemini API غير مكوّن. أضف GEMINI_API_KEY إلى ملف .env',
            source: 'gemini',
        };
    }

    const isAdmin = username === 'sosa1000';
    const systemPrompt = buildSystemPrompt(userRole, isAdmin);

    try {
        // ── Call Gemini API ──────────────────────────────────────────
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: systemPrompt,
        });

        let generatedSQL;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const result = await model.generateContent(userPrompt);
                generatedSQL = result.response.text().trim();
                break;
            } catch (retryErr) {
                if (retryErr.message.includes('429') && attempt < 2) {
                    console.log('[Gemini] Rate limited, retrying in 5s...');
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }
                throw retryErr;
            }
        }

        // ── Handle special responses ────────────────────────────────
        if (generatedSQL === 'ACCESS_DENIED') {
            return {
                success: false,
                error: '⚠️ Access Denied: You do not have permission to view this data.',
                error_ar: '⚠️ تم رفض الوصول: ليس لديك صلاحية لعرض هذه البيانات.',
                source: 'gemini',
            };
        }

        if (generatedSQL === 'UNCLEAR') {
            return {
                success: false,
                error: '❓ I couldn\'t understand that question even with AI. Please try rephrasing or use one of the suggestions.',
                error_ar: '❓ لم أتمكن من فهم السؤال حتى بالذكاء الاصطناعي. حاول إعادة صياغة السؤال.',
                source: 'gemini',
            };
        }

        // ── Clean up: strip markdown fences if Gemini adds them ──────
        generatedSQL = generatedSQL
            .replace(/^```(?:sql)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // ── Security: validate the SQL ──────────────────────────────
        for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.test(generatedSQL)) {
                console.error('[Gemini Security] Blocked dangerous SQL:', generatedSQL);
                return {
                    success: false,
                    error: '🛡️ Security: The AI generated a query that was blocked for safety reasons. Only read-only queries are allowed.',
                    error_ar: '🛡️ أمان: تم حظر الاستعلام المُنشأ لأسباب أمنية. يُسمح فقط بالاستعلامات للقراءة.',
                    source: 'gemini',
                };
            }
        }

        // Must start with SELECT
        if (!/^\s*SELECT\b/i.test(generatedSQL)) {
            return {
                success: false,
                error: '🛡️ Security: Only SELECT queries are allowed.',
                error_ar: '🛡️ أمان: يُسمح فقط باستعلامات SELECT.',
                source: 'gemini',
            };
        }

        // ── RBAC: double-check restricted tables in generated SQL ────
        const restricted = isAdmin ? [] : (RESTRICTED_TABLES[userRole] || []);
        for (const table of restricted) {
            // Check for the table name as a word boundary (case insensitive)
            const tableRegex = new RegExp(`\\b${table}\\b`, 'i');
            if (tableRegex.test(generatedSQL)) {
                return {
                    success: false,
                    error: `⚠️ Access Denied: Your role cannot access "${table}" data.`,
                    error_ar: `⚠️ تم رفض الوصول: دورك لا يسمح بالوصول إلى بيانات "${table}".`,
                    source: 'gemini',
                };
            }
        }

        // ── Enforce LIMIT ───────────────────────────────────────────
        if (!/\bLIMIT\b/i.test(generatedSQL)) {
            generatedSQL += ' LIMIT 100';
        }

        // ── Execute the query ───────────────────────────────────────
        console.log('[Gemini] Executing AI-generated SQL:', generatedSQL);
        const [rows] = await pool.query(generatedSQL);

        return {
            success: true,
            query_id: 'gemini_generated',
            description: '🤖 AI-Generated Query (Powered by Gemini)',
            description_ar: '🤖 استعلام مُنشأ بالذكاء الاصطناعي (بواسطة Gemini)',
            columns: rows.length > 0 ? Object.keys(rows[0]) : [],
            data: rows,
            row_count: rows.length,
            original_prompt: userPrompt,
            generated_sql: generatedSQL,
            source: 'gemini',
        };

    } catch (err) {
        console.error('[Gemini Error]', err.message);

        // Handle rate limiting
        if (err.message.includes('429') || err.message.includes('quota')) {
            return {
                success: false,
                error: '⏳ Gemini API rate limit reached. Please wait a minute and try again.',
                error_ar: '⏳ تم الوصول لحد الاستخدام. انتظر دقيقة وحاول مرة أخرى.',
                source: 'gemini',
            };
        }

        // Handle specific error types
        if (err.message.includes('API_KEY_INVALID') || err.message.includes('401')) {
            return {
                success: false,
                error: '🔑 Invalid Gemini API key. Please check your GEMINI_API_KEY in .env',
                error_ar: '🔑 مفتاح Gemini API غير صالح. تحقق من GEMINI_API_KEY',
                source: 'gemini',
            };
        }

        if (err.code === 'ER_PARSE_ERROR' || err.code === 'ER_BAD_FIELD_ERROR') {
            return {
                success: false,
                error: `🤖 The AI generated an invalid query. Please rephrase your question. (${err.message})`,
                error_ar: `🤖 أنشأ الذكاء الاصطناعي استعلاماً غير صالح. حاول إعادة صياغة السؤال.`,
                source: 'gemini',
            };
        }

        return {
            success: false,
            error: `AI Error: ${err.message}`,
            error_ar: `خطأ الذكاء الاصطناعي: ${err.message}`,
            source: 'gemini',
        };
    }
}

module.exports = { geminiQuery };
