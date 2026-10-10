const router = require('express').Router();
const pool = require('../config/db');
const { requireStaff, requireManager, setFlash } = require('../middleware/auth');

router.get('/training', requireStaff, async (req, res) => {
    try {
        const [trainings] = await pool.query('SELECT training_id, title, description, trainer, location, scheduled_date, duration_hours, status FROM Training ORDER BY scheduled_date DESC');
        const [workers] = await pool.query('SELECT w.person_id, w.FName, w.LName FROM Worker w ORDER BY w.FName');
        const [enrollments] = await pool.query(`
            SELECT te.*, t.title AS training_title, t.trainer, t.scheduled_date,
                   te.status AS completion_status,
                   te.certificate_issued,
                   w.FName, w.LName 
            FROM Training_Enrollment te
             JOIN Training t ON te.training_id = t.training_id
             JOIN Worker w ON te.person_id = w.person_id
             ORDER BY t.scheduled_date DESC`);
        
        res.render('training', { trainings, workers, enrollments });
    } catch (err) {
        console.error('[TRAINING ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load Training module.', code: 500 });
    }
});

router.post('/training', requireManager, async (req, res) => {
    const { title, description, trainer, scheduled_date, end_date, location, status } = req.body;
    try {
        let duration_hours = null;
        if (scheduled_date && end_date) {
            const start = new Date(scheduled_date);
            const end = new Date(end_date);
            const diff = Math.ceil((end - start) / (1000 * 60 * 60));
            duration_hours = diff > 0 ? diff : 1;
        }
        await pool.query(
            'INSERT INTO Training (title, description, trainer, location, scheduled_date, duration_hours, status) VALUES (?,?,?,?,?,?,?)',
            [title, description || null, trainer || null, location || null, scheduled_date, duration_hours, status || 'Planned']
        );
        setFlash(req, 'success', 'Training session created.');
        res.redirect('/training');
    } catch (err) { console.error(err); setFlash(req, 'error', 'Failed to create training.'); res.redirect('/training'); }
});

router.post('/training/enroll', requireManager, async (req, res) => {
    const { training_id, worker_id } = req.body;
    try {
        await pool.query('INSERT IGNORE INTO Training_Enrollment (training_id, person_id) VALUES (?, ?)', [training_id, worker_id]);
        setFlash(req, 'success', 'Worker enrolled in training.');
        res.redirect('/training#enrollments');
    } catch (err) { console.error(err); setFlash(req, 'error', 'Failed to enroll worker.'); res.redirect('/training'); }
});

router.post('/training/status', requireManager, async (req, res) => {
    const { enrollment_id, completion_status, score, certificate_issued } = req.body;
    try {
        // Validate score if provided
        if (score !== null && score !== undefined && score !== '') {
            const scoreNum = parseFloat(score);
            if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
                setFlash(req, 'error', 'Score must be between 0 and 100.');
                res.redirect('/training#enrollments');
                return;
            }
        }
        
        await pool.query(
            'UPDATE Training_Enrollment SET status=?, score=?, certificate_issued=? WHERE enrollment_id=?',
            [completion_status || 'Enrolled', score || null, certificate_issued === 'on' ? 1 : 0, enrollment_id]
        );
        setFlash(req, 'success', 'Enrollment updated.');
        res.redirect('/training#enrollments');
    } catch (err) { console.error(err); setFlash(req, 'error', 'Failed to update enrollment.'); res.redirect('/training'); }
});

// ── API endpoint for real-time training updates ────────────────────────────
router.get('/api/training/updated', requireStaff, async (req, res) => {
    try {
        const [trainings] = await pool.query('SELECT training_id, title, description, trainer, location, scheduled_date, duration_hours, status FROM Training ORDER BY scheduled_date DESC');
        const [enrollments] = await pool.query(`
            SELECT te.*, t.title AS training_title, t.trainer, t.scheduled_date,
                   te.status AS completion_status,
                   te.certificate_issued,
                   w.FName, w.LName 
            FROM Training_Enrollment te
             JOIN Training t ON te.training_id = t.training_id
             JOIN Worker w ON te.person_id = w.person_id
             ORDER BY t.scheduled_date DESC`);

        res.json({ trainings, enrollments, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[API TRAINING ERROR]', err);
        res.status(500).json({ error: 'Failed to fetch training data' });
    }
});

module.exports = router;
