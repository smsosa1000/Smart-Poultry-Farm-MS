const router = require('express').Router();
const pool = require('../config/db');
const { requireManager } = require('../middleware/auth');

router.get('/reports', requireManager, async (req, res) => {
    try {
        const cycleIdQuery = req.query.cycle_id;
        
        // Use v_cycle_status to get all cycles with basic info
        const [cycles] = await pool.query(`SELECT * FROM v_cycle_status ORDER BY cycle_id DESC`);
        
        let reportData = null;
        if (cycles.length > 0) {
            const cid = cycleIdQuery ? parseInt(cycleIdQuery) : cycles[0].cycle_id;
            const currentCycle = cycles.find(c => c.cycle_id === cid) || cycles[0];
            
            const initial = currentCycle.initial_chicks;
            const living = currentCycle.living_birds;
            const dead = currentCycle.initial_chicks - currentCycle.living_birds; // Simplification
            const mortalityRate = currentCycle.mortality_rate;

            // Totals from standard views/tables
            const [feed] = await pool.query('SELECT IFNULL(SUM(quantity), 0) as total_feed, IFNULL(SUM(quantity * price), 0) as feed_cost FROM Daily_Feed WHERE cycle_id = ?', [cid]);
            const [sales] = await pool.query('SELECT IFNULL(SUM(total_weight_kg), 0) as total_weight, AVG(price_per_kg) as avg_price, IFNULL(SUM(total_revenue), 0) as total_revenue FROM Sale WHERE cycle_id = ?', [cid]);
            const [treatments] = await pool.query('SELECT IFNULL(SUM(total_cost), 0) as treatment_cost FROM Treatment_Details WHERE cycle_id = ?', [cid]);
            const [expenses] = await pool.query('SELECT IFNULL(SUM(amount), 0) as other_expenses FROM Expense WHERE cycle_id = ?', [cid]);
            const [cycleInfo] = await pool.query('SELECT initial_chicks, chick_price_per_unit FROM Cycle WHERE cycle_id = ?', [cid]);
            
            const totalFeed = parseFloat(feed[0].total_feed) || 0;
            const totalWeight = parseFloat(sales[0].total_weight) || 0;
            const totalRevenue = parseFloat(sales[0].total_revenue) || 0;
            
            const chickCost = (cycleInfo[0].initial_chicks * cycleInfo[0].chick_price_per_unit);
            const feedCost = parseFloat(feed[0].feed_cost) || 0;
            const treatCost = parseFloat(treatments[0].treatment_cost) || 0;
            const otherExpenses = parseFloat(expenses[0].other_expenses) || 0;
            
            const totalCost = chickCost + feedCost + treatCost + otherExpenses;
            const netProfit = totalRevenue - totalCost;

            let fcr = 'N/A', fcrType = '';
            if (totalWeight > 0) {
                fcr = (totalFeed / totalWeight).toFixed(2);
                fcrType = 'Actual';
            } else if (living > 0) {
                fcr = (totalFeed / (living * 2.0)).toFixed(2); // Estimated 2kg per bird
                fcrType = 'Estimated (2kg avg)';
            }

            reportData = {
                cycle_id: cid, 
                breed_name: currentCycle.breed_name,
                mortalityRate, fcr, fcrType,
                initial_chicks: initial, 
                living_birds: living, 
                total_dead: dead,
                total_feed: totalFeed,
                total_weight: totalWeight,
                avg_price: sales[0].avg_price ? parseFloat(sales[0].avg_price).toFixed(2) : 0,
                total_revenue: totalRevenue,
                total_expenses: otherExpenses,
                feed_cost: feedCost,
                treatment_cost: treatCost,
                chick_cost: chickCost,
                total_cost: totalCost,
                netProfit
            };
        }
        res.render('reports', { reportData, cycles });
    } catch (err) {
        console.error('[REPORTS ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load reports.', code: 500 });
    }
});

module.exports = router;
