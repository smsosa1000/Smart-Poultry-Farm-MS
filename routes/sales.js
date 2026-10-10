const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, requireManager, setFlash } = require('../middleware/auth');

router.get('/sales', requireManager, async (req, res) => {
    try {
        const [cycles] = await pool.query(`
            SELECT c.cycle_id, b.breed_name, c.cycle_status
            FROM Cycle c JOIN Breed b ON c.breed_id = b.breed_id 
            WHERE c.cycle_status = 'Active'
            ORDER BY c.cycle_id DESC`);

        const [customers] = await pool.query(`
            SELECT c.customer_id, c.company_name AS name, c.company_name, c.customer_type
            FROM Customer c
            WHERE c.status = 'Active' ORDER BY c.company_name`);

        // Unfulfilled sales orders that can be linked
        const [pendingSOs] = await pool.query(`
            SELECT so.order_id, so.order_number, so.birds_qty, so.price_per_kg,
                   so.est_weight_kg, so.customer_id, so.cycle_id,
                   c.company_name AS customer_name
            FROM Sales_Order so
            JOIN Customer c ON so.customer_id = c.customer_id
            JOIN Cycle cy ON so.cycle_id = cy.cycle_id
            WHERE so.status IN ('Confirmed', 'Ready', 'Pending')
            AND cy.cycle_status = 'Active'
            AND NOT EXISTS (SELECT 1 FROM Sale s WHERE s.order_id = so.order_id)
            ORDER BY so.order_date DESC`);

        const [sales] = await pool.query(`
            SELECT s.sale_id, s.cycle_id, s.sale_date, s.birds_sold, 
                   s.total_weight_kg, s.price_per_kg, (s.total_weight_kg * s.price_per_kg) AS total_revenue,
                   s.customer_id, s.order_id,
                   b.breed_name,
                   c.company_name AS customer_name,
                   so.order_number
            FROM Sale s 
            JOIN Cycle cy ON s.cycle_id = cy.cycle_id 
            JOIN Breed b ON cy.breed_id = b.breed_id
            LEFT JOIN Customer c ON s.customer_id = c.customer_id
            LEFT JOIN Sales_Order so ON s.order_id = so.order_id
            ORDER BY s.sale_date DESC`);

        // Summary stats
        const totalRevenue = sales.reduce((sum, s) => sum + parseFloat(s.total_revenue || 0), 0);
        const totalBirds = sales.reduce((sum, s) => sum + (s.birds_sold || 0), 0);

        res.render('sales', { sales, cycles, customers, pendingSOs, stats: { totalRevenue, totalBirds } });
    } catch (err) {
        console.error('[SALES GET ERROR]', err.code, err.message, err.sql);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load sales.', code: 500 });
    }
});

router.post('/sales', requireManager, async (req, res) => {
    const { cycle_id, sale_date, birds_sold, total_weight_kg, price_per_kg, customer_id, order_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verify cycle is active
        const [cycleCheck] = await connection.query('SELECT cycle_status FROM Cycle WHERE cycle_id = ?', [cycle_id]);
        if (!cycleCheck.length || cycleCheck[0].cycle_status !== 'Active') {
            await connection.rollback();
            setFlash(req, 'error', 'Action denied: this cycle is closed.');
            return res.redirect('/sales');
        }

        // If linking to SO, verify it matches the cycle
        if (order_id) {
            const [soCheck] = await connection.query('SELECT cycle_id FROM Sales_Order WHERE order_id = ?', [order_id]);
            if (!soCheck.length || soCheck[0].cycle_id != cycle_id) {
                await connection.rollback();
                setFlash(req, 'error', 'The linked Sales Order does not belong to the selected cycle.');
                return res.redirect('/sales');
            }
        }

        // Business rule: Cannot sell more birds than living
        const [living] = await connection.query('SELECT living_birds FROM v_cycle_status WHERE cycle_id = ?', [cycle_id]);
        if (living.length && parseInt(birds_sold) > living[0].living_birds) {
            await connection.rollback();
            setFlash(req, 'error', 'Cannot sell more birds than currently alive (' + living[0].living_birds + ')');
            return res.redirect('/sales');
        }

        // If not linked to SO, create a random SO
        let actual_customer_id = customer_id || null;
        let actual_order_id = order_id || null;

        if (!actual_customer_id) {
            // Find or create walk-in customer
            const [walkIn] = await connection.query('SELECT customer_id FROM Customer WHERE company_name = "Walk-In Customer"');
            if (walkIn.length > 0) {
                actual_customer_id = walkIn[0].customer_id;
            } else {
                const [newCust] = await connection.query(
                    'INSERT INTO Customer (company_name, customer_type, phone, email, city, address) VALUES (?, ?, ?, ?, ?, ?)',
                    ['Walk-In Customer', 'Other', '00000000', 'walkin@example.com', 'Local', 'Farm']
                );
                actual_customer_id = newCust.insertId;
            }
        }

        if (!actual_order_id) {
            const so_number = 'SO-' + Math.floor(Math.random() * 10000) + '-' + Date.now().toString().slice(-6);
            const [result] = await connection.query(
                'INSERT INTO Sales_Order (order_number, customer_id, cycle_id, order_date, delivery_date, birds_qty, est_weight_kg, price_per_kg, status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [so_number, actual_customer_id, cycle_id, sale_date, sale_date, birds_sold, total_weight_kg, price_per_kg, 'Delivered', 'Paid']
            );
            actual_order_id = result.insertId;
        }

        await connection.query(
            'INSERT INTO Sale (cycle_id, manager_id, customer_id, order_id, sale_date, birds_sold, total_weight_kg, price_per_kg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [cycle_id, req.session.user.person_id,
             actual_customer_id, actual_order_id,
             sale_date, birds_sold, total_weight_kg, price_per_kg]
        );

        // If it was an existing SO, update SO status
        if (order_id) {
            await connection.query('UPDATE Sales_Order SET status = ?, payment_status = ? WHERE order_id = ?', ['Delivered', 'Paid', order_id]);
        }

        // Auto-close cycle if living_birds drops to 0
        const [updatedLiving] = await connection.query('SELECT living_birds FROM v_cycle_status WHERE cycle_id = ?', [cycle_id]);
        if (updatedLiving.length && updatedLiving[0].living_birds <= 0) {
            await connection.query('UPDATE Cycle SET cycle_status = "Closed", end_date = ? WHERE cycle_id = ?', [sale_date, cycle_id]);
        }

        await connection.commit();
        res.redirect('/sales');
    } catch (err) {
        await connection.rollback();
        console.error('[SALES POST ERROR]', err.code, err.message, err.sql);
        setFlash(req, 'error', 'Failed to record sale: ' + (err.sqlMessage || err.message));
        res.redirect('/sales');
    } finally {
        connection.release();
    }
});

module.exports = router;
