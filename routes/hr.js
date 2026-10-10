const router = require('express').Router();
const pool = require('../config/db');
const { requireManager, setFlash } = require('../middleware/auth');

// GET HR Dashboard
router.get('/hr', requireManager, async (req, res) => {
    try {
        const [workers] = await pool.query('SELECT w.person_id, w.FName, w.LName, w.job_title FROM Worker w ORDER BY w.FName');
        const [attendance] = await pool.query(`
            SELECT a.*, w.FName, w.LName 
            FROM Attendance a 
            JOIN Worker w ON a.person_id = w.person_id 
            ORDER BY a.work_date DESC, w.FName ASC LIMIT 50`);
        
        const [payroll] = await pool.query(`
            SELECT py.*, w.FName, w.LName 
            FROM Payroll py 
            JOIN Worker w ON py.person_id = w.person_id 
            ORDER BY py.payment_date DESC LIMIT 50`);
        
        const [reviews] = await pool.query(`
            SELECT r.review_id, r.person_id, r.reviewer_id, r.review_date, r.score AS overall_score, r.comments,
                   w.FName, w.LName, CONCAT(m.FName, ' ', m.LName) as reviewer_name
            FROM Performance_Review r
            JOIN Worker w ON r.person_id = w.person_id
            JOIN Worker m ON r.reviewer_id = m.person_id
            ORDER BY r.review_date DESC LIMIT 50`);

        const attendanceSummary = Object.values(attendance.reduce((acc, row) => {
            const id = row.person_id;
            if (!acc[id]) acc[id] = { full_name: `${row.FName} ${row.LName}`, present_days: 0, absent_days: 0, total_days: 0 };
            acc[id].total_days++;
            const statusLower = String(row.status || '').toLowerCase();
            if (statusLower === 'present') acc[id].present_days++; else acc[id].absent_days++;
            return acc;
        }, {})).map(item => ({
            ...item,
            attendance_rate_pct: item.total_days ? Math.round((item.present_days / item.total_days) * 100) : 0
        }));

        const payrollSummary = Object.values(payroll.reduce((acc, row) => {
            const id = row.person_id;
            if (!acc[id]) acc[id] = { full_name: `${row.FName} ${row.LName}`, total_paid: 0, last_payment_date: null };
            const paid = parseFloat(row.net_amount || row.basic_salary || 0);
            acc[id].total_paid += paid;
            if (!acc[id].last_payment_date || new Date(row.payment_date) > new Date(acc[id].last_payment_date)) {
                acc[id].last_payment_date = row.payment_date;
            }
            return acc;
        }, {}));

        res.render('hr', { workers, attendance, payroll, reviews, attendanceSummary, payrollSummary });
    } catch (err) {
        console.error('[HR ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load HR module.', code: 500 });
    }
});

// POST new attendance
router.post('/hr/attendance', requireManager, async (req, res) => {
    const { worker_id, work_date, check_in, check_out, status } = req.body;
    try {
        await pool.query(
            'INSERT INTO Attendance (person_id, work_date, check_in, check_out, status) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE check_in=?, check_out=?, status=?',
            [worker_id, work_date, check_in || null, check_out || null, status, check_in || null, check_out || null, status]
        );
        setFlash(req, 'success', 'Attendance recorded.');
        res.redirect('/hr#attendance');
    } catch (err) { 
        console.error('[HR ATTENDANCE POST ERROR]', err); 
        setFlash(req, 'danger', 'Failed to save attendance: ' + err.message); 
        res.redirect('/hr'); 
    }
});

// POST new payroll
router.post('/hr/payroll', requireManager, async (req, res) => {
    const { worker_id, payment_date, period_start, period_end, basic_salary, overtime_amount, bonuses, deductions } = req.body;
    try {
        await pool.query(
            'INSERT INTO Payroll (person_id, payment_date, period_start, period_end, basic_salary, overtime_amount, bonuses, deductions) VALUES (?,?,?,?,?,?,?,?)',
            [worker_id, payment_date, period_start, period_end, basic_salary, overtime_amount || 0, bonuses || 0, deductions || 0]
        );
        setFlash(req, 'success', 'Payroll record created.');
        res.redirect('/hr#payroll');
    } catch (err) { 
        console.error('[HR PAYROLL POST ERROR]', err); 
        setFlash(req, 'danger', 'Failed to save payroll: ' + err.message); 
        res.redirect('/hr'); 
    }
});

router.post('/hr/performance', requireManager, async (req, res) => {
    const { worker_id, review_date, score, comments } = req.body;
    try {
        await pool.query(
            'INSERT INTO Performance_Review (person_id, reviewer_id, review_date, score, comments) VALUES (?, ?, ?, ?, ?)',
            [worker_id, req.session.user.person_id, review_date, score || null, comments || null]
        );
        setFlash(req, 'success', 'Performance review recorded.');
        res.redirect('/hr#reviews');
    } catch (err) {
        console.error('[HR PERFORMANCE POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to save performance review: ' + err.message);
        res.redirect('/hr');
    }
});

module.exports = router;
