const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, requireManager, requireStaff, setFlash } = require('../middleware/auth');

// GET all operations data
router.get('/operations', requireAuth, async (req, res) => {
    try {
        const [cycles] = await pool.query(`
            SELECT c.cycle_id, b.breed_name 
            FROM Cycle c JOIN Breed b ON c.breed_id = b.breed_id 
            WHERE c.cycle_status = 'Active'
            ORDER BY c.cycle_id DESC`);
        
        const [medicines] = await pool.query('SELECT * FROM Medicine');
        const [sheds] = await pool.query('SELECT * FROM Shed');
        const [devices] = await pool.query(`
            SELECT d.*, dt.type_name as device_type 
            FROM Device d 
            JOIN Device_Type dt ON d.type_id = dt.type_id`);
        const [treatments] = await pool.query(`
            SELECT * FROM Treatment_Details td
            ORDER BY td.treatment_date DESC`);
        
        const [maintains] = await pool.query(`
            SELECT m.*, d.device_name, dt.type_name as device_type, w.FName, w.LName
            FROM Maintains m 
            JOIN Device d ON m.device_id = d.device_id 
            JOIN Device_Type dt ON d.type_id = dt.type_id
            JOIN Technician t ON m.person_id = t.person_id
            JOIN Worker w ON t.person_id = w.person_id
            ORDER BY m.maintenance_datetime DESC`);

        const [vacSchedules] = await pool.query(`
            SELECT vs.*, v.vaccine_name, b.breed_name, w.FName as assigned_fname, w.LName as assigned_lname
            FROM Vaccination_Schedule vs
            JOIN Vaccine v ON vs.vaccine_id = v.vaccine_id
            JOIN Cycle c ON vs.cycle_id = c.cycle_id
            JOIN Breed b ON c.breed_id = b.breed_id
            LEFT JOIN Worker w ON vs.assigned_worker_id = w.person_id
            WHERE vs.status IN ('Pending','Overdue','Failed')
            ORDER BY vs.scheduled_date ASC`);

        const [farmerWorkers] = await pool.query(`
            SELECT w.person_id, w.FName, w.LName, u.username
            FROM Farmer_Worker fw 
            JOIN Worker w ON fw.person_id = w.person_id
            LEFT JOIN User u ON w.person_id = u.person_id`);

        const [technicians] = await pool.query(`
            SELECT t.person_id, w.FName, w.LName, u.username
            FROM Technician t
            JOIN Worker w ON t.person_id = w.person_id
            LEFT JOIN User u ON w.person_id = u.person_id`);

        const [vaccines] = await pool.query('SELECT * FROM Vaccine');

        res.render('operations', { 
            cycles, medicines, sheds, devices, treatments, 
            maintains, vacSchedules, farmerWorkers, technicians, vaccines
        });
    } catch (err) {
        console.error('[OPERATIONS GET ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load operations.', code: 500 });
    }
});

// POST new treatment
router.post('/operations/treatment', requireManager, async (req, res) => {
    const { cycle_id, medicine_id, treatment_date, quantity_used, treatment_type, administered_by } = req.body;
    try {
        const worker_id = administered_by || req.session.user.person_id;
        
        await pool.query(
            'INSERT INTO Treatment (cycle_id, medicine_id, treatment_date, quantity_used, treatment_type, administered_by) VALUES (?, ?, ?, ?, ?, ?)',
            [cycle_id, medicine_id, treatment_date, quantity_used, treatment_type || 'Curative', worker_id]
        );
        
        setFlash(req, 'success', 'Treatment recorded successfully.');
        res.redirect('/operations#treatments');
    } catch (err) {
        console.error('[TREATMENT POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to record treatment: ' + err.message);
        res.redirect('/operations');
    }
});

// POST new maintenance
router.post('/operations/maintenance', requireStaff, async (req, res) => {
    const { device_id, maintenance_datetime, description, status, technician_id } = req.body;
    try {
        const person_id = technician_id || req.session.user.person_id;
        
        await pool.query(
            'INSERT INTO Maintains (person_id, device_id, maintenance_datetime, description, status) VALUES (?, ?, ?, ?, ?)',
            [person_id, device_id, maintenance_datetime, description, status || 'Pending']
        );

        if (status === 'Completed') {
            await pool.query('UPDATE Device SET status = "Operational" WHERE device_id = ?', [device_id]);
        }
        
        setFlash(req, 'success', 'Maintenance record added.');
        res.redirect('/operations#maintenance');
    } catch (err) {
        console.error('[MAINTENANCE POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to add maintenance record: ' + err.message);
        res.redirect('/operations');
    }
});

// POST new medicine
router.post('/operations/medicine', requireManager, async (req, res) => {
    const { medicine_name, unit, price_per_unit, purpose, withdrawal_days } = req.body;
    try {
        await pool.query(
            'INSERT INTO Medicine (medicine_name, unit, price_per_unit, purpose, withdrawal_days) VALUES (?, ?, ?, ?, ?)',
            [medicine_name, unit, price_per_unit, purpose, withdrawal_days || 0]
        );
        setFlash(req, 'success', 'Medicine added successfully.');
        res.redirect('/operations#treatments');
    } catch (err) {
        console.error('[MEDICINE POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to add medicine: ' + err.message);
        res.redirect('/operations#treatments');
    }
});

// POST new shed
router.post('/operations/shed', requireManager, async (req, res) => {
    const { shed_name, capacity, area_sqm } = req.body;
    if (parseFloat(capacity) < 1) {
        setFlash(req, 'danger', 'Shed capacity must be at least 1.');
        return res.redirect('/operations#sheds');
    }
    try {
        await pool.query(
            'INSERT INTO Shed (shed_name, capacity, area_sqm) VALUES (?, ?, ?)',
            [shed_name, capacity, area_sqm]
        );
        setFlash(req, 'success', 'Shed added successfully.');
        res.redirect('/operations#sheds');
    } catch (err) {
        console.error('[SHED POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to add shed: ' + err.message);
        res.redirect('/operations#sheds');
    }
});

// POST edit shed
router.post('/operations/shed/edit', requireManager, async (req, res) => {
    const { shed_id, shed_name, capacity, area_sqm, status } = req.body;
    if (parseFloat(capacity) < 1) {
        setFlash(req, 'danger', 'Shed capacity must be at least 1.');
        return res.redirect('/operations#sheds');
    }
    try {
        await pool.query(
            'UPDATE Shed SET shed_name = ?, capacity = ?, area_sqm = ?, status = ? WHERE shed_id = ?',
            [shed_name, capacity, area_sqm, status, shed_id]
        );
        setFlash(req, 'success', `Shed "${shed_name}" updated.`);
        res.redirect('/operations#sheds');
    } catch (err) {
        console.error('[SHED EDIT ERROR]', err);
        setFlash(req, 'danger', 'Failed to edit shed: ' + err.message);
        res.redirect('/operations#sheds');
    }
});

// POST new vaccination schedule
router.post('/operations/vaccination-schedule', requireManager, async (req, res) => {
    const { cycle_id, vaccine_id, scheduled_date, planned_birds } = req.body;
    try {
        await pool.query(
            'INSERT INTO Vaccination_Schedule (cycle_id, vaccine_id, scheduled_date, planned_birds) VALUES (?, ?, ?, ?)',
            [cycle_id, vaccine_id, scheduled_date, planned_birds]
        );
        setFlash(req, 'success', 'Vaccination schedule created.');
        res.redirect('/operations#vaccinations');
    } catch (err) {
        console.error('[VAC SCHEDULE POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to create vaccination schedule: ' + err.message);
        res.redirect('/operations#vaccinations');
    }
});

// POST assign vaccine
router.post('/operations/assign-vaccine', requireManager, async (req, res) => {
    const { schedule_id, assigned_worker_id } = req.body;
    try {
        await pool.query('UPDATE Vaccination_Schedule SET assigned_worker_id = ? WHERE schedule_id = ?', [assigned_worker_id, schedule_id]);
        setFlash(req, 'success', 'Worker assigned to vaccination schedule.');
        res.redirect('/operations#vaccinations');
    } catch (err) {
        console.error('[ASSIGN VACCINE ERROR]', err);
        setFlash(req, 'danger', 'Failed to assign worker: ' + err.message);
        res.redirect('/operations#vaccinations');
    }
});

// POST delete vaccination schedule
router.post('/operations/vaccination-schedule/delete', requireManager, async (req, res) => {
    const { schedule_id } = req.body;
    try {
        await pool.query('DELETE FROM Vaccination_Schedule WHERE schedule_id = ?', [schedule_id]);
        setFlash(req, 'success', 'Vaccination schedule deleted.');
        res.redirect('/operations#vaccinations');
    } catch (err) {
        console.error('[DELETE VAC SCHEDULE ERROR]', err);
        setFlash(req, 'danger', 'Failed to delete schedule: ' + err.message);
        res.redirect('/operations#vaccinations');
    }
});

// POST delete medicine
router.post('/operations/medicine/delete', requireManager, async (req, res) => {
    const { medicine_id } = req.body;
    try {
        await pool.query('DELETE FROM Medicine WHERE medicine_id = ?', [medicine_id]);
        setFlash(req, 'success', 'Medicine deleted.');
        res.redirect('/operations#treatments');
    } catch (err) {
        console.error('[DELETE MEDICINE ERROR]', err);
        if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
            setFlash(req, 'danger', 'Cannot delete medicine because it has been used in treatments.');
        } else {
            setFlash(req, 'danger', 'Failed to delete medicine: ' + err.message);
        }
        res.redirect('/operations#treatments');
    }
});

// POST delete shed
router.post('/operations/shed/delete', requireManager, async (req, res) => {
    const { shed_id } = req.body;
    try {
        // Check if there are any cycles in this shed
        const [cycles] = await pool.query('SELECT cycle_id FROM Cycle WHERE shed_id = ?', [shed_id]);
        if (cycles.length > 0) {
            setFlash(req, 'danger', 'Cannot delete shed: It contains cycle records. Only empty sheds with no history can be deleted.');
            return res.redirect('/operations#sheds');
        }
        await pool.query('DELETE FROM Shed WHERE shed_id = ?', [shed_id]);
        setFlash(req, 'success', 'Shed deleted.');
        res.redirect('/operations#sheds');
    } catch (err) {
        console.error('[DELETE SHED ERROR]', err);
        setFlash(req, 'danger', 'Failed to delete shed: ' + err.message);
        res.redirect('/operations#sheds');
    }
});

// ── API endpoint for real-time operations updates ────────────────────────────
router.get('/api/operations/updated', requireAuth, async (req, res) => {
    try {
        const [medicines] = await pool.query('SELECT * FROM Medicine');
        const [treatments] = await pool.query(`SELECT * FROM Treatment_Details td ORDER BY td.treatment_date DESC`);
        const [maintains] = await pool.query(`
            SELECT m.*, d.device_name, dt.type_name as device_type, w.FName, w.LName
            FROM Maintains m 
            JOIN Device d ON m.device_id = d.device_id 
            JOIN Device_Type dt ON d.type_id = dt.type_id
            JOIN Technician t ON m.person_id = t.person_id
            JOIN Worker w ON t.person_id = w.person_id
            ORDER BY m.maintenance_datetime DESC`);

        res.json({ medicines, treatments, maintains, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[API OPERATIONS ERROR]', err);
        res.status(500).json({ error: 'Failed to fetch operations data' });
    }
});

module.exports = router;
