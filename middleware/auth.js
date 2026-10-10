/**
 * SMART POULTRY v5.0 - AUTHENTICATION & ACCESS CONTROL
 * Role-Based Access Control (RBAC)
 */

function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

function requireManager(req, res, next) {
    if (!req.session.user || (req.session.user.user_role !== 'Manager' && !req.session.user.is_admin)) {
        req.session.flash = { type: 'error', message: 'Access Denied: Management only.' };
        return res.redirect('/dashboard');
    }
    next();
}

/**
 * requireStaff - NEW for v5.0
 * Allows Managers, Technicians, AND Farmer Workers to access operational data.
 */
function requireStaff(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    
    const allowed = ['Manager', 'Technician', 'Farmer_Worker'];
    if (allowed.includes(req.session.user.user_role) || req.session.user.is_admin) {
        return next();
    }
    
    req.session.flash = { type: 'error', message: 'Access Denied.' };
    res.redirect('/dashboard');
}

function requireAdmin(req, res, next) {
    if (!req.session.user || !req.session.user.is_admin) {
        req.session.flash = { type: 'error', message: 'Access Denied: Admin only.' };
        return res.redirect('/dashboard');
    }
    next();
}

function enforceShiftHours(req, res, next) {
    // Business rule: Only allow log entries during reasonable farm hours (5 AM - 10 PM)
    // TEMPORARILY DISABLED: Allow 24/7 as requested
    /*
    const hour = new Date().getHours();
    if (hour < 5 || hour > 22) {
        req.session.flash = { type: 'error', message: 'Log entries are restricted during night hours (10 PM - 5 AM).' };
        return res.redirect('/logs');
    }
    */
    next();
}

function toMysqlDatetime(jsDate) {
    const d = (typeof jsDate === 'string' || typeof jsDate === 'number') ? new Date(jsDate) : jsDate;
    if (!(d instanceof Date) || isNaN(d)) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

function setFlash(req, type, message) {
    req.session.flash = { type, message };
}

module.exports = {
    requireAuth,
    requireManager,
    requireStaff,
    requireAdmin,
    enforceShiftHours,
    toMysqlDatetime,
    setFlash
};
