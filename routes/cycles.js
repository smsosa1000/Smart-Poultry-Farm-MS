const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, requireManager, enforceShiftHours, setFlash } = require('../middleware/auth');

router.get('/cycles', requireAuth, async (req, res) => {
    try {
        const [cycles] = await pool.query(`
            SELECT c.*, b.breed_name, s.shed_name, (SELECT GROUP_CONCAT(CONCAT(w.FName, ' ', w.LName) SEPARATOR ', ') FROM Assigned_To a JOIN Worker w ON a.person_id = w.person_id WHERE a.cycle_id = c.cycle_id) as assigned_workers
            FROM Cycle c 
            JOIN Breed b ON c.breed_id = b.breed_id 
            LEFT JOIN Shed s ON c.shed_id = s.shed_id 
            ORDER BY c.cycle_id DESC`);
        const [breeds] = await pool.query('SELECT * FROM Breed');
        const [sheds] = await pool.query('SELECT * FROM Shed');
        const [farmerWorkers] = await pool.query(`
            SELECT fw.person_id, w.FName, w.LName 
            FROM Farmer_Worker fw 
            JOIN Worker w ON fw.person_id = w.person_id`);
        res.render('cycles', { cycles, breeds, sheds, farmerWorkers, error: null, mode: 'view', activeCycleId: null });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load cycles.', code: 500 });
    }
});

router.get('/my-cycles', requireAuth, async (req, res) => {
    if (req.session.user.user_role !== 'Farmer_Worker') return res.redirect('/cycles');
    try {
        const [cycles] = await pool.query(
            `SELECT c.*, b.breed_name, s.shed_name, (SELECT GROUP_CONCAT(CONCAT(w.FName, ' ', w.LName) SEPARATOR ', ') FROM Assigned_To a JOIN Worker w ON a.person_id = w.person_id WHERE a.cycle_id = c.cycle_id) as assigned_workers 
             FROM Cycle c 
             JOIN Breed b ON c.breed_id = b.breed_id 
             LEFT JOIN Shed s ON c.shed_id = s.shed_id
             JOIN Assigned_To a ON a.cycle_id = c.cycle_id
             WHERE a.person_id = ? ORDER BY c.cycle_id DESC`, [req.session.user.person_id]);
        const [breeds] = await pool.query('SELECT * FROM Breed');
        const [sheds] = await pool.query('SELECT * FROM Shed');
        res.render('cycles', { cycles, breeds, sheds, error: cycles.length === 0 ? 'No cycles assigned to you yet.' : null, mode: 'view', activeCycleId: null });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load cycles.', code: 500 });
    }
});

router.get('/cycles/new', requireManager, async (req, res) => {
    try {
        const [breeds] = await pool.query('SELECT * FROM Breed');
        const [sheds] = await pool.query("SELECT * FROM Shed WHERE status = 'Active'");
        const [cycles] = await pool.query(`
            SELECT c.*, b.breed_name, s.shed_name, (SELECT GROUP_CONCAT(CONCAT(w.FName, ' ', w.LName) SEPARATOR ', ') FROM Assigned_To a JOIN Worker w ON a.person_id = w.person_id WHERE a.cycle_id = c.cycle_id) as assigned_workers 
            FROM Cycle c 
            JOIN Breed b ON c.breed_id = b.breed_id 
            LEFT JOIN Shed s ON c.shed_id = s.shed_id 
            ORDER BY c.cycle_id DESC`);
        const [farmerWorkers] = await pool.query(`
            SELECT fw.person_id, w.FName, w.LName 
            FROM Farmer_Worker fw 
            JOIN Worker w ON fw.person_id = w.person_id`);
        res.render('cycles', { 
            cycles, breeds, sheds, farmerWorkers, error: null, mode: 'create', activeCycleId: null 
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load cycle form.', code: 500 });
    }
});

router.post('/cycles', requireManager, async (req, res) => {
    const { breed_id, shed_id, initial_chicks, chick_price_per_unit, start_date } = req.body;
    const numChicks = parseInt(initial_chicks);
    try {
        // Business rule: Multiple active cycles allowed until shed capacity is reached
        const [[shed]] = await pool.query('SELECT shed_name, capacity FROM Shed WHERE shed_id = ?', [shed_id]);
        if (!shed) {
            setFlash(req, 'error', 'Invalid shed selected.');
            return res.redirect('/cycles/new');
        }

        // Check for pending sales orders from last closed cycle
        const [pendingSO] = await pool.query(
            `SELECT COUNT(*) as cnt FROM Sales_Order 
             WHERE cycle_id = (SELECT MAX(cycle_id) FROM Cycle WHERE cycle_status='Closed')
             AND status NOT IN ('Delivered','Cancelled')`
        );
        if (pendingSO[0].cnt > 0) {
            const [allBreeds] = await pool.query('SELECT * FROM Breed');
            const [allSheds] = await pool.query("SELECT * FROM Shed WHERE status = 'Active'");
            const [cycles] = await pool.query(`
                SELECT c.*, b.breed_name, s.shed_name, (SELECT GROUP_CONCAT(CONCAT(w.FName, ' ', w.LName) SEPARATOR ', ') FROM Assigned_To a JOIN Worker w ON a.person_id = w.person_id WHERE a.cycle_id = c.cycle_id) as assigned_workers 
                FROM Cycle c 
                JOIN Breed b ON c.breed_id = b.breed_id 
                LEFT JOIN Shed s ON c.shed_id = s.shed_id 
                ORDER BY c.cycle_id DESC`);
            
            return res.render('cycles', {
                cycles, breeds: allBreeds, sheds: allSheds, mode: 'create', activeCycleId: null,
                error: `There are ${pendingSO[0].cnt} undelivered sales orders from the previous cycle. Resolve them first.`
            });
        }


        const [[currentActive]] = await pool.query(`
            SELECT IFNULL(SUM(initial_chicks), 0) as total_initial
            FROM Cycle 
            WHERE cycle_status = "active" AND shed_id = ?`, [shed_id]);
        
        const currentChicksCount = parseInt(currentActive.total_initial);

        if (currentChicksCount + numChicks > shed.capacity) {
            const [allBreeds] = await pool.query('SELECT * FROM Breed');
            const [allSheds] = await pool.query("SELECT * FROM Shed WHERE status = 'Active'");
            const [cycles] = await pool.query(`
                SELECT c.*, b.breed_name, s.shed_name, (SELECT GROUP_CONCAT(CONCAT(w.FName, ' ', w.LName) SEPARATOR ', ') FROM Assigned_To a JOIN Worker w ON a.person_id = w.person_id WHERE a.cycle_id = c.cycle_id) as assigned_workers 
                FROM Cycle c 
                JOIN Breed b ON c.breed_id = b.breed_id 
                LEFT JOIN Shed s ON c.shed_id = s.shed_id 
                ORDER BY c.cycle_id DESC`);
            
            return res.render('cycles', {
                cycles, breeds: allBreeds, sheds: allSheds, mode: 'create', activeCycleId: null,
                error: `Cannot add ${numChicks} birds. Shed "${shed.shed_name}" current load: ${currentChicksCount}/${shed.capacity}.`
            });
        }

        const [result] = await pool.query(
            'INSERT INTO Cycle (breed_id, shed_id, initial_chicks, chick_price_per_unit, start_date, manager_id) VALUES (?, ?, ?, ?, ?, ?)',
            [breed_id, shed_id, initial_chicks, chick_price_per_unit, start_date, req.session.user.person_id]);
        
        // Log to Audit_Log
        await pool.query(
            'INSERT INTO Audit_Log (person_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.person_id, 'create', 'Cycle', result.insertId, JSON.stringify(req.body)]
        );

        setFlash(req, 'success', 'Cycle created successfully.');
        res.redirect('/cycles');
    } catch (err) {
        console.error(err);
        const [breeds] = await pool.query('SELECT * FROM Breed');
        const [sheds] = await pool.query('SELECT * FROM Shed');
        res.status(500).render('cycles', { cycles: [], breeds, sheds, error: 'Failed to create cycle', mode: 'create', activeCycleId: null });
    }
});

router.post('/cycles/:id/close', requireManager, async (req, res) => {
    const { end_date } = req.body;
    const cycleId = parseInt(req.params.id);
    try {
        const [result] = await pool.query('UPDATE Cycle SET cycle_status = "Closed", end_date = ? WHERE cycle_id = ? AND cycle_status = "Active"',
            [end_date || new Date().toISOString().split('T')[0], cycleId]);
        
        if (result.affectedRows === 0) {
            setFlash(req, 'warning', 'Cycle already closed or not found.');
        } else {
            // Log to Audit_Log
            await pool.query(
                'INSERT INTO Audit_Log (person_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
                [req.session.user.person_id, 'close', 'Cycle', cycleId, JSON.stringify({ status: 'Closed', end_date })]
            );
            // Mark any pending vaccination tasks as Failed
            await pool.query('UPDATE Vaccination_Schedule SET status = "Failed" WHERE cycle_id = ? AND status = "Pending"', [cycleId]);
            setFlash(req, 'success', `Cycle #${cycleId} closed successfully. Pending tasks marked as failed.`);
        }
        res.redirect('/cycles');
    } catch (err) {
        console.error('[CYCLE CLOSE ERROR]', err);
        setFlash(req, 'error', 'Failed to close cycle: ' + err.message);
        res.redirect('/cycles');
    }
});

// POST assign worker to cycle
router.post('/cycles/assign-worker', requireManager, async (req, res) => {
    const { cycle_id, person_id } = req.body;
    try {
        // Check if already assigned
        const [existing] = await pool.query('SELECT * FROM Assigned_To WHERE cycle_id = ? AND person_id = ?', [cycle_id, person_id]);
        if (existing.length === 0) {
            await pool.query('INSERT INTO Assigned_To (cycle_id, person_id) VALUES (?, ?)', [cycle_id, person_id]);
            setFlash(req, 'success', 'Worker assigned to cycle successfully.');
        } else {
            setFlash(req, 'warning', 'Worker is already assigned to this cycle.');
        }
        res.redirect('/cycles');
    } catch (err) {
        console.error('[ASSIGN WORKER ERROR]', err);
        setFlash(req, 'danger', 'Failed to assign worker: ' + err.message);
        res.redirect('/cycles');
    }
});

// ── API endpoint for real-time data updates ────────────────────────────────
router.get('/api/cycles/updated', requireAuth, async (req, res) => {
    try {
        const [cycles] = await pool.query(`
            SELECT c.*, b.breed_name, s.shed_name, (SELECT GROUP_CONCAT(CONCAT(w.FName, ' ', w.LName) SEPARATOR ', ') FROM Assigned_To a JOIN Worker w ON a.person_id = w.person_id WHERE a.cycle_id = c.cycle_id) as assigned_workers 
            FROM Cycle c 
            JOIN Breed b ON c.breed_id = b.breed_id 
            LEFT JOIN Shed s ON c.shed_id = s.shed_id 
            ORDER BY c.cycle_id DESC`);
        const [farmerWorkers] = await pool.query(`
            SELECT fw.person_id, w.FName, w.LName 
            FROM Farmer_Worker fw 
            JOIN Worker w ON fw.person_id = w.person_id`);
        
        let userRole = null;
        if (req.session && req.session.user) {
            userRole = req.session.user.user_role;
            if (req.session.user.is_admin) userRole = 'Manager'; // treat admin as manager for UI purposes
        }

        res.json({ cycles, farmerWorkers, userRole, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[API CYCLES ERROR]', err);
        res.status(500).json({ error: 'Failed to fetch cycles' });
    }
});

module.exports = router;
