const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, enforceShiftHours, toMysqlDatetime, setFlash } = require('../middleware/auth');

router.get('/logs', requireAuth, async (req, res) => {
    try {
        let cycles = [];
        let vaccinationTasks = [];
        if (req.session.user.user_role === 'Farmer_Worker') {
            const [assigned] = await pool.query(
                `SELECT c.cycle_id, b.breed_name FROM Cycle c
                 JOIN Breed b ON c.breed_id = b.breed_id
                 JOIN Assigned_To a ON a.cycle_id = c.cycle_id
                 WHERE a.person_id = ? AND c.cycle_status = "active" ORDER BY c.cycle_id DESC`,
                [req.session.user.person_id]);
            cycles = assigned;

            const [tasks] = await pool.query(
                `SELECT vs.schedule_id, vs.cycle_id, vs.scheduled_date, vs.planned_birds, vs.status,
                        b.breed_name, v.vaccine_name, v.admin_route
                 FROM Vaccination_Schedule vs
                 JOIN Cycle c ON c.cycle_id = vs.cycle_id
                 JOIN Breed b ON b.breed_id = c.breed_id
                 JOIN Vaccine v ON v.vaccine_id = vs.vaccine_id
                 WHERE (vs.assigned_worker_id = ? OR (vs.assigned_worker_id IS NULL AND EXISTS(SELECT 1 FROM Assigned_To a WHERE a.cycle_id = c.cycle_id AND a.person_id = ?)))
                  AND vs.status IN ("pending", "overdue")
                  ORDER BY vs.scheduled_date ASC`,
                [req.session.user.person_id, req.session.user.person_id]
            );
            vaccinationTasks = tasks;
        } else {
            const [all] = await pool.query('SELECT c.cycle_id, b.breed_name FROM Cycle c JOIN Breed b ON c.breed_id = b.breed_id WHERE c.cycle_status="active"');
            cycles = all;

            const [tasks] = await pool.query(
                `SELECT vs.schedule_id, vs.cycle_id, vs.scheduled_date, vs.planned_birds, vs.status,
                        b.breed_name, v.vaccine_name, v.admin_route,
                        w.FName, w.LName
                 FROM Vaccination_Schedule vs
                 JOIN Cycle c ON c.cycle_id = vs.cycle_id
                 JOIN Breed b ON b.breed_id = c.breed_id
                 JOIN Vaccine v ON v.vaccine_id = vs.vaccine_id
                 LEFT JOIN Vaccination_Record vr ON vr.schedule_id = vs.schedule_id
                 LEFT JOIN Worker w ON w.person_id = vr.administered_by
                 WHERE vs.status IN ("pending", "overdue")
                 ORDER BY vs.scheduled_date ASC`);
            vaccinationTasks = tasks;
        }

        // Feed types for the dropdown
        const [feedTypes] = await pool.query('SELECT feed_type_id, name FROM Feed_Type ORDER BY name');

        const [logs] = await pool.query(`
            SELECT dl.*, df.quantity as feed_quantity, df.price as feed_price,
                   df.feed_type_id, ft.name as feed_type_name,
                   dm.dead_count, dm.cause as mortality_cause,
                   w.FName, w.LName,
                   CASE WHEN dl.temp_celsius > 38 THEN 'danger'
                        WHEN dl.ammonia_level > 25 THEN 'warning'
                        WHEN dl.humidity > 80 THEN 'warning'
                        ELSE 'normal' END as risk_level
            FROM Daily_Log dl
            LEFT JOIN Daily_Feed df ON dl.log_id = df.log_id AND dl.cycle_id = df.cycle_id
            LEFT JOIN Feed_Type ft ON df.feed_type_id = ft.feed_type_id
            LEFT JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
            LEFT JOIN Worker w ON dl.created_by = w.person_id
            ORDER BY dl.log_date DESC LIMIT 50`);
        res.render('logs', { logs, activeCycles: cycles, vaccinationTasks, feedTypes, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load logs.', code: 500 });
    }
});

router.post('/logs', requireAuth, enforceShiftHours, async (req, res) => {
    const { cycle_id, log_date, temp_celsius, humidity, ammonia_level, water_consumption, notes, feed_type_id, feed_qty, feed_price, mortality_count, mortality_cause } = req.body;
    
    // 24-hour edit window check for existing logs
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Check if a log already exists for this date+cycle (prevent duplicates)
        const [existing] = await connection.query(
            'SELECT log_id, log_date FROM Daily_Log WHERE cycle_id = ? AND log_date = ?', [cycle_id, log_date]);
        if (existing.length > 0) {
            const logTime = new Date(existing[0].log_date);
            const hoursAgo = (Date.now() - logTime.getTime()) / (1000 * 60 * 60);
            if (hoursAgo > 24) {
                await connection.rollback();
                connection.release();
                setFlash(req, 'error', 'Cannot edit logs older than 24 hours');
                return res.redirect('/logs');
            }
        }
        
        const [[cycleCheck]] = await connection.query(
            `SELECT c.cycle_status, v.living_birds 
             FROM Cycle c 
             JOIN v_cycle_status v ON c.cycle_id = v.cycle_id 
             WHERE c.cycle_id = ?`, [cycle_id]);

        if (!cycleCheck || cycleCheck.cycle_status !== 'Active') {
            await connection.rollback();
            connection.release();
            setFlash(req, 'error', 'Action denied: this cycle is not active.');
            return res.redirect('/logs');
        }


        // Farmer_Worker: verify assignment
        if (req.session.user.user_role === 'Farmer_Worker') {
            const [allowed] = await connection.query(
                `SELECT 1 FROM Assigned_To a JOIN Cycle c ON c.cycle_id = a.cycle_id
                 WHERE a.person_id = ? AND a.cycle_id = ? AND c.cycle_status = "active" LIMIT 1`,
                [req.session.user.person_id, cycle_id]);
            if (!allowed.length) {
                await connection.rollback();
                connection.release();
                setFlash(req, 'error', 'Access denied: not assigned to this cycle');
                return res.redirect('/logs');
            }
        }
        
        const [logResult] = await connection.query(
            'INSERT INTO Daily_Log (cycle_id, log_date, temp_celsius, humidity, ammonia_level, water_consumption, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [cycle_id, log_date, temp_celsius || null, humidity || null, ammonia_level || null, water_consumption || null, notes || null, req.session.user.person_id]);
        const newLogId = logResult.insertId;

        if (feed_qty && parseFloat(feed_qty) > 0) {
            // Check total available stock first
            const [[stockTotal]] = await connection.query(
                'SELECT SUM(quantity) as total FROM Feed_Stock WHERE feed_type_id = ?', [feed_type_id]);
            
            if (!stockTotal || parseFloat(stockTotal.total || 0) < parseFloat(feed_qty)) {
                await connection.rollback();
                connection.release();
                setFlash(req, 'error', `Insufficient feed stock. Available: ${stockTotal ? stockTotal.total : 0}, requested: ${feed_qty}`);
                return res.redirect('/logs');
            }

            await connection.query('INSERT INTO Daily_Feed (log_id, cycle_id, feed_type_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
                [newLogId, cycle_id, feed_type_id || null, feed_qty, feed_price || 0]);
            
            // Deduct from Feed_Stock (FIFO-ish, oldest stock or largest pile first)
            await connection.query(
                `UPDATE Feed_Stock SET quantity = quantity - ? 
                 WHERE feed_type_id = ? AND quantity >= ? 
                 ORDER BY expiry_date ASC, quantity DESC LIMIT 1`, 
                [feed_qty, feed_type_id, feed_qty]
            );
        }
        if (mortality_count && parseInt(mortality_count) > 0) {
            await connection.query('INSERT INTO Daily_Mortality (log_id, cycle_id, dead_count, cause) VALUES (?, ?, ?, ?)',
                [newLogId, cycle_id, mortality_count, mortality_cause || 'Unknown']);
            
            // Auto-close cycle if living_birds drops to 0
            const [[updatedLiving]] = await connection.query('SELECT living_birds FROM v_cycle_status WHERE cycle_id = ?', [cycle_id]);
            if (updatedLiving && updatedLiving.living_birds <= 0) {
                await connection.query('UPDATE Cycle SET cycle_status = "Closed", end_date = ? WHERE cycle_id = ?', [log_date, cycle_id]);
            }

        }

        await connection.commit();
        res.redirect('/logs');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        setFlash(req, 'error', 'Failed to save log: ' + (err.sqlMessage || err.message));
        res.redirect('/logs');
    } finally {
        connection.release();
    }
});

router.post('/logs/vaccination', requireAuth, enforceShiftHours, async (req, res) => {
    const { schedule_id, administered_at, birds_vaccinated, batch_number, cost, notes } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [allowed] = await connection.query(
            `SELECT vs.schedule_id, vs.planned_birds, vs.vaccine_id, c.cycle_status, c.cycle_id
             FROM Vaccination_Schedule vs
             JOIN Cycle c ON c.cycle_id = vs.cycle_id
             JOIN Assigned_To a ON a.cycle_id = vs.cycle_id
              WHERE vs.schedule_id = ? 
              AND (vs.assigned_worker_id = ? OR (vs.assigned_worker_id IS NULL AND a.person_id = ?))
              AND vs.status IN ("pending", "overdue")
              AND c.cycle_status = "active"
              LIMIT 1`,
            [schedule_id, req.session.user.person_id, req.session.user.person_id]
        );

        if (!allowed.length) {
            await connection.rollback();
            setFlash(req, 'error', 'Action denied: cycle is closed or you are not assigned to it.');
            return res.redirect('/logs');
        }

        let inputQty = birds_vaccinated ? parseInt(birds_vaccinated) : allowed[0].planned_birds;
        if (isNaN(inputQty) || inputQty <= 0) {
            await connection.rollback();
            setFlash(req, 'error', 'Invalid number of birds vaccinated.');
            return res.redirect('/logs');
        }
        if (inputQty > allowed[0].planned_birds) {
            await connection.rollback();
            setFlash(req, 'error', `Cannot vaccinate more birds (${inputQty}) than planned (${allowed[0].planned_birds}).`);
            return res.redirect('/logs');
        }

        const qtyNeeded = inputQty;
        const vaccineId = allowed[0].vaccine_id;

        // Check Vaccine Stock
        const [[vStockTotal]] = await connection.query(
            'SELECT SUM(doses_available) as total FROM Vaccine_Stock WHERE vaccine_id = ?', [vaccineId]);
        
        if (!vStockTotal || parseInt(vStockTotal.total || 0) < parseInt(qtyNeeded)) {
            await connection.rollback();
            setFlash(req, 'error', `Insufficient vaccine doses in stock. Available: ${vStockTotal ? vStockTotal.total : 0}, needed: ${qtyNeeded}`);
            return res.redirect('/logs');
        }

        await connection.query(
            `INSERT INTO Vaccination_Record
             (schedule_id, administered_by, administered_at, birds_vaccinated, batch_number, cost, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                schedule_id,
                req.session.user.person_id,
                administered_at ? toMysqlDatetime(administered_at) : new Date(),
                qtyNeeded,
                batch_number || null,
                cost || 0,
                notes || null
            ]
        );

        // Deduct from Vaccine_Stock
        await connection.query(
            `UPDATE Vaccine_Stock SET doses_available = doses_available - ? 
             WHERE vaccine_id = ? AND doses_available >= ? 
             ORDER BY expiry_date ASC LIMIT 1`, 
            [qtyNeeded, vaccineId, qtyNeeded]
        );

        if (qtyNeeded < allowed[0].planned_birds) {
            await connection.query('UPDATE Vaccination_Schedule SET planned_birds = planned_birds - ? WHERE schedule_id = ?', [qtyNeeded, schedule_id]);
        } else {
            await connection.query('UPDATE Vaccination_Schedule SET status = "Completed" WHERE schedule_id = ?', [schedule_id]);
        }
        await connection.commit();
        setFlash(req, 'success', `Vaccination recorded: ${qtyNeeded} birds vaccinated.`);
        res.redirect('/logs');
    } catch (err) {
        await connection.rollback();
        console.error('[VACCINATION POST ERROR]', err.code, err.message, err.sql);
        setFlash(req, 'error', 'Failed to record vaccination: ' + (err.sqlMessage || err.message));
        res.redirect('/logs');
    } finally {
        connection.release();
    }
});

// ── API endpoint for real-time logs updates ────────────────────────────────
router.get('/api/logs/updated', requireAuth, async (req, res) => {
    try {
        const [logs] = await pool.query(`
            SELECT dl.*, c.cycle_id, b.breed_name, w.FName, w.LName
            FROM Daily_Log dl
            JOIN Cycle c ON dl.cycle_id = c.cycle_id
            JOIN Breed b ON c.breed_id = b.breed_id
            JOIN Worker w ON dl.created_by = w.person_id
            ORDER BY dl.log_date DESC LIMIT 50`);

        const [vacRecords] = await pool.query(`
            SELECT vr.*, vs.schedule_id, v.vaccine_name, w.FName, w.LName
            FROM Vaccination_Record vr
            JOIN Vaccination_Schedule vs ON vr.schedule_id = vs.schedule_id
            JOIN Vaccine v ON vs.vaccine_id = v.vaccine_id
            JOIN Worker w ON vr.administered_by = w.person_id
            ORDER BY vr.administered_at DESC LIMIT 30`);

        res.json({ logs, vacRecords, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[API LOGS ERROR]', err);
        res.status(500).json({ error: 'Failed to fetch logs data' });
    }
});

module.exports = router;
