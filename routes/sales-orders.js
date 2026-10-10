const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, requireManager, setFlash } = require('../middleware/auth');

// ── GET /sales-orders — List all Sales Orders ───────────────────────────────
router.get('/sales-orders', requireAuth, async (req, res) => {
    try {
        const { status, payment_status, customer_id, cycle_id } = req.query;

        let query = `
            SELECT so.*, 
                   c.company_name,
                   c.trade_name,
                   b.breed_name, sh.shed_name, cy.start_date AS cycle_start,
                   cy.cycle_status,
                   s.sale_id AS linked_sale_id
            FROM Sales_Order so
            JOIN Customer c ON so.customer_id = c.customer_id
            JOIN Cycle cy ON so.cycle_id = cy.cycle_id
            JOIN Breed b ON cy.breed_id = b.breed_id
            LEFT JOIN Shed sh ON cy.shed_id = sh.shed_id
            LEFT JOIN Sale s ON s.order_id = so.order_id
            WHERE 1=1`;
        const params = [];

        if (status) { query += ` AND so.status = ?`; params.push(status); }
        if (payment_status) { query += ` AND so.payment_status = ?`; params.push(payment_status); }
        if (customer_id) { query += ` AND so.customer_id = ?`; params.push(customer_id); }
        if (cycle_id) { query += ` AND so.cycle_id = ?`; params.push(cycle_id); }

        query += ` ORDER BY so.order_date DESC`;
        const [orders] = await pool.query(query, params);

        const [customers] = await pool.query(`
            SELECT customer_id, company_name, trade_name, customer_type
            FROM Customer
            WHERE status = 'Active' ORDER BY company_name`);

        const [cycles] = await pool.query(`
            SELECT cy.cycle_id, b.breed_name, sh.shed_name, cy.start_date, cy.cycle_status
            FROM Cycle cy
            JOIN Breed b ON cy.breed_id = b.breed_id
            LEFT JOIN Shed sh ON cy.shed_id = sh.shed_id
            WHERE cy.cycle_status = 'Active'
            ORDER BY cy.cycle_id DESC`);

        // Summary stats
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(o => o.status === 'Pending').length;
        const totalAmount = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const unpaidCount = orders.filter(o => o.payment_status === 'Unpaid').length;

        res.render('sales_orders', {
            orders, customers, cycles,
            filters: { status, payment_status, customer_id, cycle_id },
            stats: { totalOrders, pendingOrders, totalAmount, unpaidCount }
        });
    } catch (err) {
        console.error('[SO GET ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load sales orders.', code: 500 });
    }
});

// ── POST /sales-orders — Create a new Sales Order ───────────────────────────
router.post('/sales-orders', requireManager, async (req, res) => {
    const { customer_id, cycle_id, birds_qty, est_weight_kg, price_per_kg, delivery_date, notes } = req.body;
    try {
        const order_number = 'SO-' + Date.now().toString().slice(-8);
        await pool.query(
            `INSERT INTO Sales_Order 
             (order_number, customer_id, cycle_id, birds_qty, est_weight_kg, price_per_kg, order_date, delivery_date, status)
             VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, 'Pending')`,
            [order_number, customer_id, cycle_id, birds_qty, est_weight_kg || null, price_per_kg, delivery_date]
        );
        setFlash(req, 'success', 'Sales Order created.');
        res.redirect('/sales-orders');
    } catch (err) {
        console.error('[SO POST ERROR]', err);
        setFlash(req, 'error', 'Failed to create order: ' + err.sqlMessage);
        res.redirect('/sales-orders');
    }
});

// ── POST /sales-orders/update-status ───────────────────────────────────────
router.post('/sales-orders/update-status', requireManager, async (req, res) => {
    const { order_id, new_status } = req.body;
    try {
        await pool.query('UPDATE Sales_Order SET status = ? WHERE order_id = ?', [new_status, order_id]);
        setFlash(req, 'success', `Order status updated to ${new_status}.`);
        res.redirect('/sales-orders');
    } catch (err) {
        setFlash(req, 'error', 'Failed to update status.');
        res.redirect('/sales-orders');
    }
});

// ── POST /sales-orders/fulfill — Convert Order to Sale ──────────────────────
router.post('/sales-orders/fulfill', requireManager, async (req, res) => {
    const { order_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get Order Details
        const [orders] = await connection.query('SELECT * FROM Sales_Order WHERE order_id = ?', [order_id]);
        if (!orders.length) throw new Error('Order not found');
        const o = orders[0];

        // 2. Insert into Sale
        const [saleResult] = await connection.query(
            `INSERT INTO Sale (cycle_id, manager_id, customer_id, order_id, sale_date, birds_sold, total_weight_kg, price_per_kg)
             VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?)`,
            [o.cycle_id, req.session.user.person_id || 1000, o.customer_id, o.order_id, o.birds_qty, o.est_weight_kg || 0, o.price_per_kg]
        );

        // 3. Mark Order as Delivered
        await connection.query("UPDATE Sales_Order SET status = 'Delivered' WHERE order_id = ?", [order_id]);

        await connection.commit();
        setFlash(req, 'success', 'Order fulfilled! Sale record created.');
        res.redirect('/sales-orders');
    } catch (err) {
        await connection.rollback();
        console.error('[SO FULFILL ERROR]', err);
        setFlash(req, 'error', 'Fulfillment failed: ' + err.message);
        res.redirect('/sales-orders');
    } finally {
        connection.release();
    }
});

// ── POST /sales-orders/update-payment — Update Payment Status ─────────────────
router.post('/sales-orders/update-payment', requireManager, async (req, res) => {
    const { order_id, payment_status } = req.body;
    try {
        await pool.query('UPDATE Sales_Order SET payment_status = ? WHERE order_id = ?', [payment_status, order_id]);
        setFlash(req, 'success', `Payment status updated to ${payment_status}.`);
        res.redirect('/sales-orders');
    } catch (err) {
        console.error('[SO PAYMENT UPDATE ERROR]', err);
        setFlash(req, 'error', 'Failed to update payment status.');
        res.redirect('/sales-orders');
    }
});

// ── API endpoint for real-time sales orders updates ────────────────────────
router.get('/api/sales-orders/updated', requireAuth, async (req, res) => {
    try {
        const [orders] = await pool.query(`
            SELECT so.*, 
                   c.company_name,
                   c.trade_name,
                   b.breed_name, sh.shed_name, cy.start_date AS cycle_start,
                   cy.cycle_status,
                   s.sale_id AS linked_sale_id
            FROM Sales_Order so
            JOIN Customer c ON so.customer_id = c.customer_id
            JOIN Cycle cy ON so.cycle_id = cy.cycle_id
            JOIN Breed b ON cy.breed_id = b.breed_id
            LEFT JOIN Shed sh ON cy.shed_id = sh.shed_id
            LEFT JOIN Sale s ON s.order_id = so.order_id
            ORDER BY so.order_date DESC`);

        res.json({ orders, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[API SALES ORDERS ERROR]', err);
        res.status(500).json({ error: 'Failed to fetch sales orders data' });
    }
});

module.exports = router;
