const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, requireManager } = require('../middleware/auth');

// GET Management Dashboard
router.get('/management', requireManager, async (req, res) => {
    try {
        const { role } = req.query;
        const roleFilter = role || '';

        // Set session collation to avoid illegal mix of collations error
        await pool.query("SET collation_connection = 'utf8mb4_unicode_ci'");

        let workerQuery = 'SELECT * FROM Worker';
        const workerParams = [];
        if (role) {
            workerQuery += ' WHERE worker_type = ?';
            workerParams.push(role);
        }
        workerQuery += ' ORDER BY hire_date DESC';

        const [workers] = await pool.query(workerQuery, workerParams);
        const [attendance] = await pool.query(`
            SELECT a.*, w.FName, w.LName 
            FROM Attendance a 
            JOIN Worker w ON a.person_id = w.person_id 
            ORDER BY a.work_date DESC LIMIT 50
        `);
        const [payroll] = await pool.query(`
            SELECT p.*, w.FName, w.LName 
            FROM Payroll p 
            JOIN Worker w ON p.person_id = w.person_id 
            ORDER BY p.payment_date DESC
        `);
        
        const [inventory] = await pool.query('SELECT * FROM Inventory_Status');
        const [inventoryAlerts] = await pool.query("SELECT * FROM Inventory_Status WHERE stock_status != 'OK'");
        
        const [training] = await pool.query('SELECT * FROM Training ORDER BY scheduled_date DESC');
        const [enrollments] = await pool.query(`
            SELECT te.*, t.title as training_title, w.FName, w.LName 
            FROM Training_Enrollment te
            JOIN Training t ON te.training_id = t.training_id
            JOIN Worker w ON te.person_id = w.person_id
        `);

        const [auditLogs] = await pool.query(`
            SELECT al.*, w.FName, w.LName 
            FROM Audit_Log al 
            LEFT JOIN Worker w ON al.person_id = w.person_id 
            ORDER BY al.created_at DESC LIMIT 100
        `);

        res.render('management', { 
            workers, attendance, payroll, inventory, 
            inventoryAlerts, roleFilter,
            training, enrollments, auditLogs 
        });
    } catch (err) {
        console.error('[MANAGEMENT GET ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load management data.', code: 500 });
    }
});

// POST edit worker details
router.post('/management/worker/edit', requireManager, async (req, res) => {
    const { person_id, FName, LName, job_title, monthly_salary, phone, email } = req.body;
    try {
        await pool.query(
            'UPDATE Worker SET FName = ?, LName = ?, job_title = ?, monthly_salary = ?, phone = ?, email = ? WHERE person_id = ?',
            [FName, LName, job_title, monthly_salary, phone || null, email || null, person_id]
        );
        req.session.flash = { type: 'success', message: `Worker "${FName} ${LName}" updated successfully.` };
        res.redirect('/management');
    } catch (err) {
        console.error('[WORKER EDIT ERROR]', err);
        req.session.flash = { type: 'error', message: 'Failed to update worker: ' + (err.sqlMessage || err.message) };
        res.redirect('/management');
    }
});

// POST delete worker
router.post('/management/worker/delete', requireManager, async (req, res) => {
    const { person_id } = req.body;
    try {
        // Attempt to unassign from active tasks, delete user account, payroll, and the worker.
        await pool.query('UPDATE Vaccination_Schedule SET assigned_worker_id = NULL WHERE assigned_worker_id = ?', [person_id]);
        await pool.query('UPDATE Vaccination_Record SET administered_by = NULL WHERE administered_by = ?', [person_id]);
        await pool.query('UPDATE Treatment SET administered_by = NULL WHERE administered_by = ?', [person_id]);
        await pool.query('UPDATE Maintains SET person_id = NULL WHERE person_id = ?', [person_id]);
        await pool.query('UPDATE Daily_Log SET created_by = NULL WHERE created_by = ?', [person_id]);
        await pool.query('UPDATE Audit_Log SET person_id = NULL WHERE person_id = ?', [person_id]);
        
        await pool.query('DELETE FROM User WHERE person_id = ?', [person_id]);
        await pool.query('DELETE FROM Payroll WHERE person_id = ?', [person_id]);
        await pool.query('DELETE FROM Attendance WHERE person_id = ?', [person_id]);
        await pool.query('DELETE FROM Training_Enrollment WHERE person_id = ?', [person_id]);
        
        // Remove from sub-types
        await pool.query('DELETE FROM Farmer_Worker WHERE person_id = ?', [person_id]);
        await pool.query('DELETE FROM Technician WHERE person_id = ?', [person_id]);
        await pool.query('DELETE FROM Manager WHERE person_id = ?', [person_id]);

        await pool.query('DELETE FROM Worker WHERE person_id = ?', [person_id]);
        
        req.session.flash = { type: 'success', message: 'Worker and associated records deleted successfully.' };
        res.redirect('/management');
    } catch (err) {
        console.error('[WORKER DELETE ERROR]', err);
        req.session.flash = { type: 'error', message: 'Failed to delete worker. They may be referenced in logs that cannot be deleted. Error: ' + err.message };
        res.redirect('/management');
    }
});

module.exports = router;
