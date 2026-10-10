const router = require('express').Router();
const pool = require('../config/db');
const { requireManager } = require('../middleware/auth');

router.get('/audit', requireManager, async (req, res) => {
    try {
        const [logs] = await pool.query(`
            SELECT a.*, w.FName, w.LName             FROM Audit_Log a
             LEFT JOIN Worker w ON a.person_id = w.person_id
             ORDER BY a.created_at DESC LIMIT 100`);
        
        res.render('audit', { logs });
    } catch (err) {
        console.error('[AUDIT ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load Audit Logs.', code: 500 });
    }
});

module.exports = router;
