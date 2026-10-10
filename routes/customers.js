const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, requireManager, setFlash } = require('../middleware/auth');

// GET all customers with filters
router.get('/customers', requireAuth, async (req, res) => {
    try {
        const { search, type, status } = req.query;
        const filters = { search: search || '', type: type || '', status: status || '' };
        
        let query = `SELECT c.*, 
            (SELECT COUNT(*) FROM Sales_Order so WHERE so.customer_id = c.customer_id AND so.status IN ('Pending','Confirmed','Ready')) AS active_orders_count
            FROM Customer c WHERE 1=1`;
        const params = [];

        if (search) {
            query += ' AND (c.company_name LIKE ? OR c.trade_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (type) {
            query += ' AND c.customer_type = ?';
            params.push(type);
        }
        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }
        query += ' ORDER BY c.company_name ASC';

        const [customers] = await pool.query(query, params);
        
        // Detailed Sales Stats
        let [salesHistory] = [];
        try {
            [salesHistory] = await pool.query('SELECT * FROM Customer_Sales_History');
        } catch (ignoreErr) {
            salesHistory = [];
        }
        
        const stats = {
            totalCustomers: customers.length,
            activeCustomers: customers.filter(c => c.status === 'Active').length,
            totalSpent: salesHistory.reduce((sum, s) => sum + parseFloat(s.total_revenue || 0), 0),
            totalBirdsBought: salesHistory.reduce((sum, s) => sum + parseInt(s.total_birds || 0), 0)
        };

        res.render('customers', { customers, stats, filters });
    } catch (err) {
        console.error('[CUSTOMERS GET ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load customers.', code: 500 });
    }
});

// POST new customer
router.post('/customers', requireManager, async (req, res) => {
    const { company_name, trade_name, customer_type, phone, email, city, address, credit_limit, payment_terms } = req.body;
    try {
        await pool.query(
            'INSERT INTO Customer (company_name, trade_name, customer_type, phone, email, city, address, credit_limit, payment_terms) VALUES (?,?,?,?,?,?,?,?,?)',
            [company_name, trade_name || null, customer_type, phone, email, city, address, credit_limit || 0, payment_terms || 'Net-30']
        );
        setFlash(req, 'success', 'Customer registered successfully.');
        res.redirect('/customers');
    } catch (err) {
        console.error('[CUSTOMER POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to add customer: ' + err.message);
        res.redirect('/customers');
    }
});

// POST edit customer
router.post('/customers/edit', requireManager, async (req, res) => {
    const { customer_id, company_name, trade_name, phone, email, city, address, status, credit_limit } = req.body;
    try {
        await pool.query(
            'UPDATE Customer SET company_name=?, trade_name=?, phone=?, email=?, city=?, address=?, status=?, credit_limit=? WHERE customer_id=?',
            [company_name, trade_name || null, phone, email, city, address, status, credit_limit || 0, customer_id]
        );
        setFlash(req, 'success', 'Customer profile updated.');
        res.redirect('/customers');
    } catch (err) {
        console.error('[CUSTOMER EDIT ERROR]', err);
        setFlash(req, 'danger', 'Update failed: ' + err.message);
        res.redirect('/customers');
    }
});

// POST delete customer
router.post('/customers/delete', requireManager, async (req, res) => {
    const { customer_id } = req.body;
    try {
        await pool.query('DELETE FROM Customer WHERE customer_id = ?', [customer_id]);
        setFlash(req, 'success', 'Customer deleted.');
        res.redirect('/customers');
    } catch (err) {
        console.error('[CUSTOMER DELETE ERROR]', err);
        setFlash(req, 'danger', 'Delete failed: ' + err.message);
        res.redirect('/customers');
    }
});

module.exports = router;
