const router = require('express').Router();
const pool = require('../config/db');
const { requireManager, setFlash } = require('../middleware/auth');

// ── GET /suppliers — Full Supplier Management ────────────────────────────────
router.get('/suppliers', requireManager, async (req, res) => {
    try {
        const { type, status } = req.query;
        let query = 'SELECT * FROM Supplier WHERE 1=1';
        let params = [];

        if (type) {
            query += ' AND FIND_IN_SET(?, supplier_type)';
            params.push(type);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        query += ' ORDER BY company_name';

        const [suppliers] = await pool.query(query, params);

        // Map products for each supplier (Feed, Medicine, Vaccine)
        const [feeds] = await pool.query('SELECT name, supplier_id FROM Feed_Type');
        const [meds] = await pool.query('SELECT medicine_name AS name, supplier_id FROM Medicine');
        const [vacs] = await pool.query('SELECT vaccine_name AS name, supplier_id FROM Vaccine');

        const productsMap = {};
        [...feeds, ...meds, ...vacs].forEach(p => {
            if (p.supplier_id) {
                if (!productsMap[p.supplier_id]) productsMap[p.supplier_id] = [];
                productsMap[p.supplier_id].push(p);
            }
        });

        // Map PO summary for each supplier
        const [poSummary] = await pool.query(`
            SELECT supplier_id, COUNT(*) as total_pos, 
            SUM(quantity * unit_price) as total_purchased 
            FROM Purchase_Order 
            GROUP BY supplier_id
        `);
        const poMap = {};
        poSummary.forEach(s => { poMap[s.supplier_id] = s; });

        res.render('suppliers', { 
            suppliers, 
            filters: { type, status },
            productsMap,
            poMap
        });
    } catch (err) {
        console.error('[SUPPLIERS GET ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load suppliers.', code: 500 });
    }
});

// ── POST /suppliers — Create Supplier ───────────────────────────────────────
router.post('/suppliers', requireManager, async (req, res) => {
    const { company_name, contact_person, phone, email, city, supplier_type } = req.body;
    try {
        // supplier_type can be a string or an array from multi-select
        const typeStr = Array.isArray(supplier_type) ? supplier_type.join(',') : (supplier_type || 'other');
        
        await pool.query(
            'INSERT INTO Supplier (company_name, contact_person, phone, email, city, supplier_type) VALUES (?,?,?,?,?,?)',
            [company_name, contact_person, phone, email, city, typeStr]
        );
        setFlash(req, 'success', `Supplier "${company_name}" created successfully.`);
        res.redirect('/suppliers');
    } catch (err) {
        console.error('[SUPPLIERS POST ERROR]', err);
        setFlash(req, 'error', 'Failed to create supplier: ' + (err.sqlMessage || err.message));
        res.redirect('/suppliers');
    }
});

// ── POST /suppliers/edit — Update Supplier ──────────────────────────────────
router.post('/suppliers/edit', requireManager, async (req, res) => {
    const { supplier_id, company_name, contact_person, phone, email, city, supplier_type, status } = req.body;
    try {
        const typeStr = Array.isArray(supplier_type) ? supplier_type.join(',') : (supplier_type || 'other');

        await pool.query(
            'UPDATE Supplier SET company_name=?, contact_person=?, phone=?, email=?, city=?, supplier_type=?, status=? WHERE supplier_id=?',
            [company_name, contact_person, phone, email, city, typeStr, status, supplier_id]
        );
        setFlash(req, 'success', `Supplier "${company_name}" updated.`);
        res.redirect('/suppliers');
    } catch (err) {
        console.error('[SUPPLIERS EDIT ERROR]', err);
        setFlash(req, 'error', 'Failed to update supplier.');
        res.redirect('/suppliers');
    }
});

// ── POST /suppliers/delete — Delete Supplier ────────────────────────────────
router.post('/suppliers/delete', requireManager, async (req, res) => {
    const { supplier_id } = req.body;
    try {
        await pool.query('DELETE FROM Supplier WHERE supplier_id = ?', [supplier_id]);
        setFlash(req, 'success', 'Supplier deleted successfully.');
        res.redirect('/suppliers');
    } catch (err) {
        console.error('[SUPPLIERS DELETE ERROR]', err);
        if (err.errno === 1451) {
            setFlash(req, 'error', 'Cannot delete supplier: They have existing products or purchase orders.');
        } else {
            setFlash(req, 'error', 'Failed to delete supplier.');
        }
        res.redirect('/suppliers');
    }
});

module.exports = router;
