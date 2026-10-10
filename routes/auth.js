const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { requireAuth, requireAdmin, setFlash } = require('../middleware/auth');

router.get('/', (req, res) => {
    res.redirect(req.session.user ? '/dashboard' : '/login');
});

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('auth/login', { error: null });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('[LOGIN DEBUG] Attempt:', { username, passwordLength: password?.length });
    try {
        const [rows] = await pool.query('SELECT * FROM User WHERE username = ?', [username]);
        if (rows.length === 0) {
            console.log('[LOGIN DEBUG] User not found in DB');
            return res.render('auth/login', { error: 'Invalid username or password' });
        }

        const user = rows[0];
        console.log('[LOGIN DEBUG] User found:', { username: user.username, role: user.user_role });

        const match = await bcrypt.compare(password, user.password_hash);
        console.log('[LOGIN DEBUG] Password match result:', match);

        if (!match) return res.render('auth/login', { error: 'Invalid username or password' });

        if (user.user_role === 'Customer') {
            return res.render('auth/login', { error: 'Customer role no longer valid for login.' });
        }

        // Fetch worker info
        const [worker] = await pool.query(
            `SELECT w.FName, w.LName FROM Worker w 
             WHERE w.person_id = ?`,
            [user.person_id]
        );

        req.session.user = {
            user_id: user.user_id,
            username: user.username,
            user_role: user.user_role,
            person_id: user.person_id,
            full_name: worker.length ? `${worker[0].FName} ${worker[0].LName}` : user.username,
            is_admin: user.is_admin ? true : false
        };

        res.redirect('/dashboard');
    } catch (err) {
        console.error('Login error:', err.message, err.code);
        res.render('auth/login', { error: 'Database error occurred' });
    }
});

// ── Customer Auth Removed (B2B Standalone Entity) ───────────────────────────
// Only Admin (sosa1000) can create new worker accounts
router.get('/signup', requireAdmin, (req, res) => {
    res.render('auth/signup', { error: null });
});

router.post('/signup', requireAdmin, async (req, res) => {
    const { username, password, FName, LName, national_ID, job_title, user_role, monthly_salary, is_admin } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Insert Worker (which is the new base entity)
        const [workerResult] = await connection.query(
            'INSERT INTO Worker (FName, LName, national_ID, job_title, hire_date, monthly_salary, worker_type) VALUES (?, ?, ?, ?, CURDATE(), ?, ?)',
            [FName, LName, national_ID, job_title, monthly_salary || 3000, user_role]
        );
        const personId = workerResult.insertId;

        if (user_role === 'Manager') {
            await connection.query('INSERT INTO manager (person_id, contract_type, years_experience, education_level) VALUES (?, ?, ?, ?)',
                [personId, req.body.contract_type || 'Full-Time', req.body.years_experience || 0, req.body.education_level || 'BSc']);
        } else if (user_role === 'Farmer_Worker') {
            await connection.query('INSERT INTO farmer_worker (person_id, assigned_area, shift_time, contract_type) VALUES (?, ?, ?, ?)',
                [personId, req.body.assigned_area || 'Block A', req.body.shift_time || 'Morning', 'permanent']);
        } else if (user_role === 'Technician') {
            await connection.query('INSERT INTO technician (person_id, specialization) VALUES (?, ?)',
                [personId, req.body.specialization || 'General Maintenance']);
        }

        const hashedPw = await bcrypt.hash(password, 12);
        await connection.query('INSERT INTO user (username, password_hash, user_role, is_admin, person_id) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPw, user_role, is_admin ? 1 : 0, personId]);

        await connection.commit();
        setFlash(req, 'success', `Account "${username}" created successfully.`);
        res.redirect('/management');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.render('auth/signup', { error: 'Failed to create user. National ID or Username might already exist.' });
    } finally {
        connection.release();
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;
