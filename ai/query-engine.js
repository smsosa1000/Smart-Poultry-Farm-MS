// ─── Smart Assistant: Natural Language → SQL Query Engine ─────────────────────
// Zero-cost approach using template matching for English & Arabic queries.
// Maps user prompts to pre-defined SQL patterns against the SmartPoultryFarm schema.
// 
// RBAC-aware: restricts sensitive financial/HR data based on user role.

const pool = require('../config/db');
const { geminiQuery } = require('./gemini-fallback');

// ── Sensitive table/keyword lists per role ───────────────────────────────────
const SENSITIVE_KEYWORDS = {
    financial: ['salary', 'profit', 'revenue', 'cost', 'expense', 'price', 'net_profit', 'مرتب', 'ربح', 'إيراد', 'تكلفة', 'مصروف'],
    hr:        ['national_id', 'password', 'worker', 'hire_date', 'رقم_قومي', 'كلمة_سر'],
};

// ── Query Templates ─────────────────────────────────────────────────────────
// Each template has: patterns (regex), sql, params builder, description
const QUERY_TEMPLATES = [
    // ── Mortality Queries ────────────────────────────────────────────────
    {
        id: 'mortality_total',
        patterns: [
            /how many (?:birds?|chickens?|poultry) (?:have )?died/i,
            /total (?:mortality|deaths?|dead)/i,
            /كم (?:عدد )?(?:الدواجن|الطيور|الفراخ) (?:التي |اللي )?(?:ماتت|نفقت)/i,
            /إجمالي (?:النفوق|الوفيات)/i,
            /عدد الوفيات/i,
        ],
        sql: `SELECT c.cycle_id, b.breed_name, IFNULL(SUM(dm.dead_count), 0) AS total_dead
              FROM Cycle c
              JOIN Breed b ON c.breed_id = b.breed_id
              LEFT JOIN Daily_Mortality dm ON c.cycle_id = dm.cycle_id
              GROUP BY c.cycle_id, b.breed_name
              ORDER BY c.cycle_id DESC`,
        description: 'Total mortality per cycle',
        description_ar: 'إجمالي النفوق لكل دورة',
        sensitivity: null
    },
    {
        id: 'mortality_by_month',
        patterns: [
            /(?:deaths?|mortality|died) (?:in|during|for) (?:month )?(\w+)/i,
            /كم (?:عدد )?(?:الدواجن|الطيور|الفراخ) (?:التي |اللي )?(?:ماتت|نفقت) في (?:شهر )?(.+?)(?:\?|$)/i,
        ],
        buildSql: (match) => {
            const monthNames = {
                'january': 1, 'february': 2, 'march': 3, 'april': 4,
                'may': 5, 'june': 6, 'july': 7, 'august': 8,
                'september': 9, 'october': 10, 'november': 11, 'december': 12,
                'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4,
                'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'أغسطس': 8, 'اغسطس': 8,
                'سبتمبر': 9, 'أكتوبر': 10, 'اكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
            };
            const monthStr = (match[1] || '').trim().toLowerCase();
            const monthNum = monthNames[monthStr] || parseInt(monthStr) || null;
            if (!monthNum) return null;
            return {
                sql: `SELECT c.cycle_id, b.breed_name,
                             IFNULL(SUM(dm.dead_count), 0) AS total_dead,
                             MONTHNAME(dl.log_date) AS month_name
                      FROM Daily_Mortality dm
                      JOIN Daily_Log dl ON dm.log_id = dl.log_id AND dm.cycle_id = dl.cycle_id
                      JOIN Cycle c ON c.cycle_id = dm.cycle_id
                      JOIN Breed b ON c.breed_id = b.breed_id
                      WHERE MONTH(dl.log_date) = ?
                      GROUP BY c.cycle_id, b.breed_name, MONTHNAME(dl.log_date)`,
                params: [monthNum]
            };
        },
        description: 'Mortality by month',
        description_ar: 'النفوق حسب الشهر',
        sensitivity: null
    },
    // ── Feed Queries ─────────────────────────────────────────────────────
    {
        id: 'feed_total',
        patterns: [
            /(?:total|how much) feed/i,
            /feed (?:consumption|used|consumed)/i,
            /كم(?:ية)? (?:العلف|الأعلاف)/i,
            /إجمالي (?:العلف|التغذية)/i,
        ],
        sql: `SELECT c.cycle_id, b.breed_name,
                     IFNULL(SUM(df.quantity), 0) AS total_feed_kg,
                     IFNULL(SUM(df.quantity * df.price), 0) AS total_feed_cost
              FROM Cycle c
              JOIN Breed b ON c.breed_id = b.breed_id
              LEFT JOIN Daily_Feed df ON c.cycle_id = df.cycle_id
              GROUP BY c.cycle_id, b.breed_name
              ORDER BY c.cycle_id DESC`,
        description: 'Total feed consumption per cycle',
        description_ar: 'إجمالي استهلاك العلف لكل دورة',
        sensitivity: null
    },
    // ── Living Birds ─────────────────────────────────────────────────────
    {
        id: 'living_birds',
        patterns: [
            /(?:how many|number of) (?:birds?|chickens?|chicks?) (?:are )?(?:alive|living|remaining)/i,
            /living birds/i,
            /remaining (?:birds?|chicks?)/i,
            /كم (?:عدد )?(?:الطيور|الفراخ|الدواجن) (?:الحية|المتبقية|الباقية)/i,
        ],
        sql: `SELECT * FROM Cycle_Living_Birds ORDER BY cycle_id DESC`,
        description: 'Living birds per cycle',
        description_ar: 'الطيور الحية لكل دورة',
        sensitivity: null
    },
    // ── Cycle Info ────────────────────────────────────────────────────────
    {
        id: 'active_cycles',
        patterns: [
            /(?:active|current|running) cycles?/i,
            /what cycles? (?:are|is) (?:active|running)/i,
            /الدورات? (?:النشطة|الحالية|الشغالة)/i,
        ],
        sql: `SELECT c.cycle_id, b.breed_name, c.initial_chicks, c.chick_price_per_unit,
                     c.start_date, c.cycle_status, c.manager_id
              FROM Cycle c
              JOIN Breed b ON c.breed_id = b.breed_id
              WHERE c.cycle_status = 'active'
              ORDER BY c.cycle_id DESC`,
        description: 'Currently active cycles',
        description_ar: 'الدورات النشطة حالياً',
        sensitivity: null
    },
    {
        id: 'all_cycles',
        patterns: [
            /(?:all|list|show) cycles?/i,
            /cycle (?:history|overview)/i,
            /(?:كل|جميع|عرض) الدورات/i,
        ],
        sql: `SELECT c.cycle_id, b.breed_name, c.initial_chicks, c.start_date, c.end_date,
                     c.cycle_status
              FROM Cycle c
              JOIN Breed b ON c.breed_id = b.breed_id
              ORDER BY c.cycle_id DESC`,
        description: 'All cycles',
        description_ar: 'جميع الدورات',
        sensitivity: null
    },
    // ── Financial Queries (Manager/Admin only) ───────────────────────────
    {
        id: 'profit_loss',
        patterns: [
            /profit|loss|revenue|net profit/i,
            /financial (?:report|summary)/i,
            /ربح|خسارة|إيراد/i,
            /تقرير مالي/i,
        ],
        sql: `SELECT * FROM Cycle_Profit ORDER BY cycle_id DESC`,
        description: 'Profit/Loss per cycle',
        description_ar: 'الأرباح والخسائر لكل دورة',
        sensitivity: 'financial'
    },
    {
        id: 'expenses_summary',
        patterns: [
            /(?:total|all|show) expenses?/i,
            /(?:how much|what) (?:was |were )?(?:spent|expenses?)/i,
            /(?:إجمالي|كل) المصروفات/i,
            /كم (?:صرفنا|المصروف)/i,
        ],
        sql: `SELECT e.cycle_id, b.breed_name, e.category,
                     SUM(e.amount) AS total_amount,
                     COUNT(*) AS num_entries
              FROM Expense e
              JOIN Cycle c ON e.cycle_id = c.cycle_id
              JOIN Breed b ON c.breed_id = b.breed_id
              GROUP BY e.cycle_id, b.breed_name, e.category
              ORDER BY e.cycle_id DESC, total_amount DESC`,
        description: 'Expenses breakdown by category',
        description_ar: 'المصروفات حسب الفئة',
        sensitivity: 'financial'
    },
    {
        id: 'sales_summary',
        patterns: [
            /(?:total|all|show) sales?/i,
            /(?:how much|what) (?:was |were )?sold/i,
            /(?:إجمالي|كل) المبيعات/i,
            /كم (?:بعنا|المبيعات)/i,
        ],
        sql: `SELECT s.cycle_id, b.breed_name, SUM(s.birds_sold) AS total_sold,
                     SUM(s.total_weight_kg) AS total_weight,
                     SUM(s.total_revenue) AS total_revenue,
                     AVG(s.price_per_kg) AS avg_price_per_kg
              FROM Sale s
              JOIN Cycle c ON s.cycle_id = c.cycle_id
              JOIN Breed b ON c.breed_id = b.breed_id
              GROUP BY s.cycle_id, b.breed_name
              ORDER BY s.cycle_id DESC`,
        description: 'Sales summary per cycle',
        description_ar: 'ملخص المبيعات لكل دورة',
        sensitivity: 'financial'
    },
    // ── Treatment Queries ────────────────────────────────────────────────
    {
        id: 'treatments',
        patterns: [
            /(?:treatments?|medications?|medicine)/i,
            /what (?:treatments?|medicine) (?:was |were )?(?:given|used|applied)/i,
            /(?:العلاجات|الأدوية)/i,
        ],
        sql: `SELECT * FROM Treatment_Details ORDER BY treatment_date DESC`,
        description: 'All treatments with costs',
        description_ar: 'جميع العلاجات مع التكاليف',
        sensitivity: null
    },
    // ── Worker/Staff Queries (HR - Manager/Admin only) ───────────────────
    {
        id: 'staff_list',
        patterns: [
            /(?:all|list|show) (?:workers?|staff|employees?)/i,
            /who works here/i,
            /(?:كل|جميع|عرض) (?:العمال|الموظفين)/i,
            /مين بيشتغل/i,
        ],
         sql: `SELECT p.person_id AS worker_id, p.FName, p.LName, w.job_title,
                w.hire_date, u.username, u.user_role
            FROM Worker w
            JOIN Person p ON p.person_id = w.person_id
            LEFT JOIN User u ON u.person_id = p.person_id
            ORDER BY FIELD(u.user_role, 'Manager', 'Technician', 'Farmer_Worker', NULL), p.FName`,
        description: 'Staff directory',
        description_ar: 'دليل الموظفين',
        sensitivity: 'hr'
    },
    // ── Device Queries ───────────────────────────────────────────────────
    {
        id: 'devices',
        patterns: [
            /(?:all|list|show) devices?/i,
            /(?:equipment|machines?)/i,
            /(?:كل|جميع|عرض) الأجهزة/i,
            /المعدات/i,
        ],
        sql: `SELECT d.*, dt.type_name as device_type, COUNT(du.usage_id) AS times_used,
                     IFNULL(SUM(du.hours), 0) AS total_hours
              FROM Device d
              JOIN Device_Type dt ON d.type_id = dt.type_id
              LEFT JOIN Device_Usage du ON d.device_id = du.device_id
              GROUP BY d.device_id, dt.type_name`,
        description: 'Devices with usage stats',
        description_ar: 'الأجهزة مع إحصائيات الاستخدام',
        sensitivity: null
    },
    // ── Health/Risk Queries ──────────────────────────────────────────────
    {
        id: 'high_risk_logs',
        patterns: [
            /(?:high risk|warning|danger|alert)/i,
            /high (?:temp|temperature|ammonia)/i,
            /(?:خطر|تحذير|إنذار)/i,
            /حرارة (?:عالية|مرتفعة)/i,
        ],
        sql: `SELECT dl.log_id, dl.cycle_id, dl.log_date, dl.temp_celsius,
                     dl.humidity, dl.ammonia_level,
                     CASE
                       WHEN dl.temp_celsius > 38 THEN '🔴 HIGH TEMPERATURE'
                       WHEN dl.ammonia_level > 25 THEN '🟠 HIGH AMMONIA'
                       WHEN dl.humidity > 80 THEN '🟡 HIGH HUMIDITY'
                       ELSE '🟢 NORMAL'
                     END AS risk_status,
                     IFNULL(dm.dead_count, 0) AS mortality_on_day
              FROM Daily_Log dl
              LEFT JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
              WHERE dl.temp_celsius > 38 OR dl.ammonia_level > 25 OR dl.humidity > 80
              ORDER BY dl.log_date DESC`,
        description: 'High-risk environmental readings with mortality correlation',
        description_ar: 'قراءات بيئية عالية الخطورة مع ارتباط النفوق',
        sensitivity: null
    },
    // ── Mortality Prediction / Correlation ────────────────────────────────
    {
        id: 'mortality_prediction',
        patterns: [
            /(?:predict|forecast) mortality/i,
            /mortality (?:prediction|forecast|trend)/i,
            /(?:توقع|تنبؤ) (?:النفوق|الوفيات)/i,
        ],
        sql: `SELECT dl.cycle_id, dl.log_date, dl.temp_celsius, dl.humidity,
                     dl.ammonia_level, IFNULL(dm.dead_count, 0) AS deaths,
                     CASE
                       WHEN dl.temp_celsius > 38 AND dl.ammonia_level > 20 THEN '🔴 CRITICAL - Expect High Mortality'
                       WHEN dl.temp_celsius > 38 THEN '🟠 WARNING - Temperature stress detected'
                       WHEN dl.ammonia_level > 25 THEN '🟠 WARNING - Ammonia levels dangerous'
                       WHEN dl.humidity > 80 THEN '🟡 CAUTION - Humidity stress possible'
                       ELSE '🟢 LOW RISK'
                     END AS prediction
              FROM Daily_Log dl
              LEFT JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
              ORDER BY dl.log_date DESC
              LIMIT 30`,
        description: 'Mortality risk predictions based on environmental conditions',
        description_ar: 'توقعات مخاطر النفوق بناءً على الظروف البيئية',
        sensitivity: null
    },
];

// ── Fallback suggestions ────────────────────────────────────────────────────
const SUGGESTIONS = {
    en: [
        'How many birds died?',
        'Show total feed consumption',
        'What are the active cycles?',
        'Show profit and loss',
        'List all treatments',
        'Show high risk alerts',
        'How many birds are alive?',
        'Show all expenses',
        'Predict mortality trends',
        'List all devices',
    ],
    ar: [
        'كم عدد الدواجن التي ماتت؟',
        'إجمالي استهلاك العلف',
        'ما هي الدورات النشطة؟',
        'عرض الأرباح والخسائر',
        'عرض جميع العلاجات',
        'عرض تحذيرات الخطر',
        'كم عدد الطيور الحية؟',
        'إجمالي المصروفات',
        'توقع النفوق',
        'عرض جميع الأجهزة',
    ]
};

// ── Main Query Processor ────────────────────────────────────────────────────
async function processQuery(userPrompt, userRole, username) {
    const prompt = userPrompt.trim();
    if (!prompt) {
        return {
            success: false,
            error: 'Please enter a question.',
            error_ar: 'يرجى إدخال سؤال.',
            suggestions: SUGGESTIONS
        };
    }
    
    // ── Complexity Detector ──────────────────────────────────────────────
    // If the query has specific filters/conditions that our templates can't
    // handle, skip template matching and go straight to Gemini AI.
    const COMPLEXITY_SIGNALS = [
        /\b(current\s+(?:and|&)\s+last|last\s+(?:and|&)\s+current)\b/i,
        /\b(only|specific(?:ally)?|just|exactly|between)\b/i,
        /\b(current\s+cycle|last\s+cycle|previous\s+cycle|first\s+cycle)\b/i,
        /\b(closed\s+cycles?|active\s+cycles?)\b.*\b(show|list|get|display|what|how)\b.*\b(treat|expens|cost|mortal|dead|died|profit|sale|feed)\b/i,
        /\b(treat|expens|cost|mortal|dead|died|profit|sale|feed)\b.*\b(closed|active|current|last|previous)\b/i,
        /\b(cycle\s+\d+|cycle\s+#?\d+)\b/i,
        /\b(compare|versus|vs\.?|difference|correlation)\b/i,
        /\b(top\s+\d+|bottom\s+\d+|best|worst|highest|lowest|most|least)\b/i,
        /\b(per\s+(?:bird|chick|kg|day|week|month|worker))\b/i,
        /\b(average|avg|mean|median|sum\s+of|total\s+of)\b.*\b(per|each|every|by)\b/i,
        /\b(في\s+(?:الدورة|آخر|الحالية|المغلقة|النشطة))\b/i,
        /\b(فقط|الحالية\s+والأخيرة|مقارنة)\b/i,
    ];

    const isComplex = COMPLEXITY_SIGNALS.some(rx => rx.test(prompt));

    if (isComplex && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
        console.log('[AI] Complex query detected:', prompt, '→ routing to Gemini');
        const geminiResult = await geminiQuery(prompt, userRole, username);
        return geminiResult;
    }

    // Try to match against simple templates
    for (const template of QUERY_TEMPLATES) {
        for (const pattern of template.patterns) {
            const match = prompt.match(pattern);
            if (match) {
                // ── RBAC Check ──────────────────────────────────────
                if (template.sensitivity) {
                    const isAdmin = username === 'sosa1000';
                    const isManager = userRole === 'Manager';
                    
                    if (template.sensitivity === 'financial' && !isAdmin && !isManager) {
                        return {
                            success: false,
                            error: '⚠️ Access Denied: Financial data is restricted to Managers and Administrators.',
                            error_ar: '⚠️ تم رفض الوصول: البيانات المالية مقيدة بالمديرين والمسؤولين.',
                            matched_template: template.id
                        };
                    }
                    if (template.sensitivity === 'hr' && !isAdmin && !isManager) {
                        return {
                            success: false,
                            error: '⚠️ Access Denied: Staff information is restricted to Managers and Administrators.',
                            error_ar: '⚠️ تم رفض الوصول: معلومات الموظفين مقيدة بالمديرين والمسؤولين.',
                            matched_template: template.id
                        };
                    }
                }
                
                // ── Execute Query ───────────────────────────────────
                try {
                    let sql, params = [];
                    
                    if (template.buildSql) {
                        const built = template.buildSql(match);
                        if (!built) continue; // Try next pattern
                        sql = built.sql;
                        params = built.params || [];
                    } else {
                        sql = template.sql;
                    }
                    
                    const [rows] = await pool.query(sql, params);
                    
                    return {
                        success: true,
                        query_id: template.id,
                        description: template.description,
                        description_ar: template.description_ar,
                        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
                        data: rows,
                        row_count: rows.length,
                        original_prompt: prompt
                    };
                } catch (err) {
                    console.error('AI Query Error:', err);
                    return {
                        success: false,
                        error: `Database error: ${err.message}`,
                        error_ar: `خطأ في قاعدة البيانات: ${err.message}`
                    };
                }
            }
        }
    }
    
    // ── No template matched → Gemini AI Fallback ─────────────────────────
    console.log('[AI] No template match for:', prompt, '→ falling back to Gemini');
    const geminiResult = await geminiQuery(prompt, userRole, username);
    return geminiResult;
}

module.exports = { processQuery, SUGGESTIONS };
