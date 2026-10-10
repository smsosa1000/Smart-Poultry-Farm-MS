const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const selectedCycleId = req.query.cycleId ? parseInt(req.query.cycleId) : null;

        // Fetch all cycles for the dropdown selector using v_cycle_status
        const [allCycleList] = await pool.query(`
            SELECT * FROM v_cycle_status 
            ORDER BY cycle_status ASC, cycle_id DESC`);

        const activeCycles = allCycleList.filter(c => c.cycle_status === 'Active');
        
        const [[{ total: totalCycles }]] = await pool.query('SELECT COUNT(*) as total FROM Cycle');
        const [[{ total: totalWorkers }]] = await pool.query('SELECT COUNT(*) as total FROM Worker');
        
        let stats = null;
        let alerts = [];
        let chartData = { labels: [], mortality: [], temps: [] };
        
        // Find which cycle to display stats for
        let currentCycle = null;
        if (selectedCycleId) {
            currentCycle = allCycleList.find(c => c.cycle_id === selectedCycleId);
        } else {
            // For workers, try to find an active cycle in their assigned area (v5.1 logic)
            if (req.session.user && req.session.user.user_role === 'Farmer_Worker') {
                const [[worker]] = await pool.query('SELECT assigned_area FROM Farmer_Worker WHERE person_id = ?', [req.session.user.person_id]);
                if (worker && worker.assigned_area) {
                    currentCycle = allCycleList.find(c => c.cycle_status === 'Active' && c.shed_id == worker.assigned_area);
                }
            }
            if (!currentCycle && activeCycles.length > 0) {
                currentCycle = activeCycles[0];
            }
        }

        if (currentCycle) {
            const currentCycleId = currentCycle.cycle_id;
            
            // Stats from v_cycle_status and other views
            const [feed] = await pool.query('SELECT IFNULL(SUM(quantity), 0) as total_feed FROM Daily_Feed WHERE cycle_id = ?', [currentCycleId]);
            const [profit] = await pool.query('SELECT net_profit FROM Cycle_Profit WHERE cycle_id = ?', [currentCycleId]);
            
            // Recent performance logs for chart and alerts
            const [recentLogs] = await pool.query(
                `SELECT dl.log_date, dl.temp_celsius, dl.humidity, dl.ammonia_level,
                        IFNULL(dm.dead_count, 0) as dead_count
                 FROM Daily_Log dl 
                 LEFT JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
                 WHERE dl.cycle_id = ? ORDER BY dl.log_date DESC LIMIT 7`, [currentCycleId]
            );
            
            for (const log of recentLogs) {
                chartData.labels.unshift(new Date(log.log_date).toLocaleDateString());
                chartData.mortality.unshift(log.dead_count);
                chartData.temps.unshift(parseFloat(log.temp_celsius) || 0);

                if (log.temp_celsius > 35) {
                    alerts.push({ type: 'danger', icon: 'fa-temperature-high',
                        message: `🔴 HEAT ALERT: ${log.temp_celsius}°C detected on ${new Date(log.log_date).toLocaleDateString()}.` });
                }
            }
            
            stats = {
                ...currentCycle,
                total_feed: feed[0].total_feed,
                net_profit: profit.length ? profit[0].net_profit : 0
            };
        }
        
        // Recent activity from Audit Log
        const [recentActivity] = await pool.query(`
            SELECT al.*, w.FName, w.LName 
            FROM Audit_Log al 
            LEFT JOIN Worker w ON al.person_id = w.person_id 
            ORDER BY al.created_at DESC LIMIT 5
        `);

        res.render('dashboard', {
            stats, cycles: activeCycles, allCycles: allCycleList, alerts, chartData,
            totalCycles, totalWorkers, recentActivity,
            selectedCycleId
        });
    } catch (err) {
        console.error('[DASHBOARD ERROR]', err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load dashboard.', code: 500 });
    }
});

module.exports = router;
