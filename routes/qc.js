const router = require('express').Router();
const pool = require('../config/db');
const { requireStaff, requireManager, setFlash } = require('../middleware/auth');

// GET all QC records
router.get('/qc', requireStaff, async (req, res) => {
    try {
        const [qcs] = await pool.query(`
            SELECT qc.*, c.cycle_id, b.breed_name, w.FName, w.LName 
            FROM Quality_Control qc
            JOIN Cycle c ON qc.cycle_id = c.cycle_id
            JOIN Breed b ON c.breed_id = b.breed_id
            JOIN Worker w ON qc.inspector_id = w.person_id
            ORDER BY qc.inspection_date DESC`);
        
        const [activeCycles] = await pool.query(`
            SELECT c.cycle_id, b.breed_name 
            FROM Cycle c JOIN Breed b ON c.breed_id = b.breed_id 
            WHERE c.cycle_status = 'Active'`);
        
        const [technicians] = await pool.query(`
            SELECT t.person_id, w.FName, w.LName 
            FROM Technician t JOIN Worker w ON t.person_id = w.person_id`);

        res.render('qc', { qcs, activeCycles, technicians });
    } catch (err) {
        console.error('[QC ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load Quality Control module.', code: 500 });
    }
});

// POST new QC inspection
router.post('/qc', requireManager, async (req, res) => {
    const { cycle_id, inspector_id, inspection_date, inspection_type, compliance_status, test_results, corrective_action } = req.body;
    try {
        await pool.query(
            'INSERT INTO Quality_Control (cycle_id, inspector_id, inspection_date, inspection_type, compliance_status, test_results, corrective_action) VALUES (?,?,?,?,?,?,?)',
            [cycle_id, inspector_id, inspection_date, inspection_type, compliance_status, test_results || null, corrective_action || null]
        );
        setFlash(req, 'success', 'Quality Control inspection recorded.');
        res.redirect('/qc');
    } catch (err) { 
        console.error('[QC POST ERROR]', err); 
        setFlash(req, 'danger', 'Failed to save QC inspection: ' + err.message); 
        res.redirect('/qc'); 
    }
});

module.exports = router;
