const router = require('express').Router();
const pool = require('../config/db');
const { requireManager, setFlash } = require('../middleware/auth');

router.get('/purchase-orders', requireManager, async (req, res) => {
    try {
        const [pos] = await pool.query('SELECT po.*, s.company_name, s.email FROM Purchase_Order po JOIN Supplier s ON po.supplier_id = s.supplier_id ORDER BY po.order_date DESC');
        const [suppliers] = await pool.query('SELECT supplier_id, company_name, email, supplier_type FROM Supplier WHERE status = "Active" ORDER BY company_name');
        const [feedTypes] = await pool.query('SELECT feed_type_id, name, supplier_id FROM Feed_Type ORDER BY name');
        const [medicines] = await pool.query('SELECT medicine_id, medicine_name, supplier_id FROM Medicine ORDER BY medicine_name');
        const [vaccines] = await pool.query('SELECT vaccine_id, vaccine_name, supplier_id FROM Vaccine ORDER BY vaccine_name');
        const [storages] = await pool.query('SELECT storage_id, storage_name FROM Storage ORDER BY storage_name');
        res.render('purchase_orders', { pos, suppliers, feedTypes, medicines, vaccines, storages });
    } catch (err) {
        console.error('[PO GET ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load purchase orders.', code: 500 });
    }
});

router.post('/purchase-orders', requireManager, async (req, res) => {
    const { supplier_id, item_type, item_ref, storage_id, quantity, unit, unit_price, expected_delivery_date, initial_status } = req.body;
    try {
        const refId = item_ref ? parseInt(item_ref, 10) : null;
        let item_name = item_ref || 'Custom Item';
        const itemTypeLower = item_type.toLowerCase();
        if (itemTypeLower === 'feed' && refId) {
            const [feedRows] = await pool.query('SELECT name FROM Feed_Type WHERE feed_type_id = ? LIMIT 1', [refId]);
            item_name = feedRows[0]?.name || item_name;
        }
        if (itemTypeLower === 'vaccine' && refId) {
            const [vaccineRows] = await pool.query('SELECT vaccine_name FROM Vaccine WHERE vaccine_id = ? LIMIT 1', [refId]);
            item_name = vaccineRows[0]?.vaccine_name || item_name;
        }
        if (itemTypeLower === 'medicine' && refId) {
            const [medicineRows] = await pool.query('SELECT medicine_name FROM Medicine WHERE medicine_id = ? LIMIT 1', [refId]);
            item_name = medicineRows[0]?.medicine_name || item_name;
        }
        const po_number = 'PO-' + Date.now();
        const status = initial_status && initial_status.toLowerCase() === 'sent' ? 'Sent' : 'Draft';
        const item_description = `refId:${refId || ''};unit:${unit || 'kg'}`;
        await pool.query('INSERT INTO Purchase_Order (po_number, supplier_id, item_type, item_name, item_description, quantity, unit_price, order_date, expected_delivery_date, status, storage_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [po_number, supplier_id, item_type, item_name, item_description, quantity, unit_price, new Date().toISOString().split('T')[0], expected_delivery_date || null, status, storage_id || null]);
        setFlash(req, 'success', `Purchase Order ${po_number} created as "${status}".`);
        res.redirect('/purchase-orders');
    } catch (err) {
        console.error('[PO POST ERROR]', err);
        setFlash(req, 'error', 'Failed to create PO: ' + (err.sqlMessage || err.message));
        res.redirect('/purchase-orders');
    }
});

// ── POST /purchase-orders/update-status — Change PO status ──────────────────
router.post('/purchase-orders/update-status', requireManager, async (req, res) => {
    const { po_id, new_status } = req.body;
    try {
        const validStatuses = ['draft', 'sent', 'confirmed', 'received', 'cancelled'];
        if (!validStatuses.includes(new_status)) {
            setFlash(req, 'error', 'Invalid status.');
            return res.redirect('/purchase-orders');
        }
        await pool.query('UPDATE Purchase_Order SET status = ? WHERE po_id = ?', [new_status, po_id]);
        setFlash(req, 'success', `PO status updated to "${new_status}".`);
        res.redirect('/purchase-orders');
    } catch (err) {
        console.error('[PO STATUS ERROR]', err);
        setFlash(req, 'error', 'Failed to update status.');
        res.redirect('/purchase-orders');
    }
});

router.post('/purchase-orders/receive', requireManager, async (req, res) => {
    const { po_id } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM Purchase_Order WHERE po_id = ? LIMIT 1', [po_id]);
        if (!rows.length) { setFlash(req, 'error', 'PO not found.'); return res.redirect('/purchase-orders'); }
        const po = rows[0];
        if (po.status === 'received') { setFlash(req, 'info', 'PO already received.'); return res.redirect('/purchase-orders'); }

        // parse item_description
        // format: refId:id;unit:kg
        const parts = (po.item_description || '').split(';').reduce((acc, p) => { const [k, v] = p.split(':'); acc[k] = v; return acc; }, {});
        const storageId = po.storage_id;

        // update stock based on po.item_type and stored reference ID
        const refId = parts.refId ? parseInt(parts.refId, 10) : null;
        if (po.item_type.toLowerCase() === 'feed' && refId) {
            const [existing] = await pool.query('SELECT quantity FROM Feed_Stock WHERE storage_id = ? AND feed_type_id = ? LIMIT 1', [storageId, refId]);
            if (existing.length) {
                await pool.query('UPDATE Feed_Stock SET quantity = quantity + ?, last_restock_date = CURDATE() WHERE storage_id = ? AND feed_type_id = ?', [po.quantity, storageId, refId]);
            } else {
                await pool.query('INSERT INTO Feed_Stock (storage_id, feed_type_id, quantity, reorder_level, expiry_date, last_restock_date) VALUES (?,?,?,?,NULL,CURDATE())', [storageId, refId, po.quantity, 0]);
            }
        } else if (po.item_type.toLowerCase() === 'vaccine' && refId) {
            const [existing] = await pool.query('SELECT doses_available FROM Vaccine_Stock WHERE storage_id = ? AND vaccine_id = ? LIMIT 1', [storageId, refId]);
            if (existing.length) {
                await pool.query('UPDATE Vaccine_Stock SET doses_available = doses_available + ?, expiry_date = COALESCE(expiry_date, NULL) WHERE storage_id = ? AND vaccine_id = ?', [po.quantity, storageId, refId]);
            } else {
                await pool.query('INSERT INTO Vaccine_Stock (storage_id, vaccine_id, doses_available, expiry_date, batch_number) VALUES (?,?,?,?,NULL)', [storageId, refId, po.quantity, null]);
            }
        } else if (po.item_type.toLowerCase() === 'medicine' && refId) {
            const [existing] = await pool.query('SELECT quantity FROM Medicine_Stock WHERE storage_id = ? AND medicine_id = ? LIMIT 1', [storageId, refId]);
            if (existing.length) {
                await pool.query('UPDATE Medicine_Stock SET quantity = quantity + ? WHERE storage_id = ? AND medicine_id = ?', [po.quantity, storageId, refId]);
            } else {
                await pool.query('INSERT INTO Medicine_Stock (storage_id, medicine_id, quantity, reorder_level) VALUES (?,?,?,?)', [storageId, refId, po.quantity, 0]);
            }
        }

        await pool.query('UPDATE Purchase_Order SET status = ? WHERE po_id = ?', ['received', po_id]);
        setFlash(req, 'success', 'PO received and stock updated.');
        res.redirect('/purchase-orders');
    } catch (err) {
        console.error('[PO RECEIVE ERROR]', err);
        setFlash(req, 'error', 'Failed to receive PO: ' + (err.sqlMessage || err.message));
        res.redirect('/purchase-orders');
    }
});

module.exports = router;
