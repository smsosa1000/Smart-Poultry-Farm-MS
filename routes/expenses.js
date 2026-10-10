const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth, requireManager, setFlash } = require('../middleware/auth');

// GET all expenses
router.get('/expenses', requireAuth, async (req, res) => {
    try {
        const [expenses] = await pool.query(`
            SELECT e.*, b.breed_name
            FROM Expense e
            JOIN Cycle c ON e.cycle_id = c.cycle_id
            JOIN Breed b ON c.breed_id = b.breed_id
            ORDER BY e.expense_date DESC
        `);
        
        const [cycles] = await pool.query("SELECT cycle_id FROM Cycle WHERE cycle_status = 'Active'");
        
        // Define available categories for the UI dropdown
        const categories = ['Feed', 'Medicine', 'Vaccine', 'Utilities', 'Maintenance', 'Labor', 'Chicks', 'Other'];

        res.render('expenses', { expenses, cycles, categories });
    } catch (err) {
        console.error('[EXPENSES GET ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load expenses.', code: 500 });
    }
});

// POST new expense
router.post('/expenses', requireManager, async (req, res) => {
    const { cycle_id, category, amount, expense_date, notes } = req.body;
    try {
        await pool.query(
            'INSERT INTO Expense (cycle_id, category, amount, expense_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [cycle_id, category, amount, expense_date, notes, req.session.user.person_id]
        );
        setFlash(req, 'success', 'Expense recorded successfully.');
        res.redirect('/expenses');
    } catch (err) {
        console.error('[EXPENSES POST ERROR]', err);
        setFlash(req, 'danger', 'Failed to record expense: ' + err.message);
        res.redirect('/expenses');
    }
});

module.exports = router;
