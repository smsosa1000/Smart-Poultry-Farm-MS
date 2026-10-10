// Real-time Synchronization System
// Polls API endpoints and updates DOM elements in real-time

class RealtimeSync {
    constructor(options = {}) {
        this.pollInterval = options.pollInterval || 25000; // 25 seconds
        this.apiEndpoints = {
            cycles: '/api/cycles/updated',
            operations: '/api/operations/updated',
            logs: '/api/logs/updated',
            training: '/api/training/updated',
            salesOrders: '/api/sales-orders/updated'
        };
        this.lastUpdates = {};
        this.dataCache = {};
    }

    // Start polling for a specific data type
    startSync(dataType, onUpdate = null) {
        if (!this.apiEndpoints[dataType]) {
            console.warn(`Unknown data type: ${dataType}`);
            return;
        }

        this.poll(dataType, onUpdate);
        setInterval(() => this.poll(dataType, onUpdate), this.pollInterval);
    }

    // Poll the API endpoint
    async poll(dataType, onUpdate = null) {
        try {
            const endpoint = this.apiEndpoints[dataType];
            const response = await fetch(endpoint);
            if (!response.ok) return;

            const data = await response.json();
            const currentTime = data.timestamp || new Date().toISOString();

            // Check if data has changed
            if (this.lastUpdates[dataType] !== currentTime) {
                this.lastUpdates[dataType] = currentTime;
                this.dataCache[dataType] = data;

                // Call custom update handler if provided
                if (onUpdate && typeof onUpdate === 'function') {
                    onUpdate(data);
                } else {
                    this.updateDOM(dataType, data);
                }
            }
        } catch (err) {
            console.debug(`Sync check for ${dataType}: ${err.message}`);
        }
    }

    // Generic DOM update method - can be extended per data type
    updateDOM(dataType, data) {
        switch (dataType) {
            case 'cycles':
                this.updateCyclesTable(data);
                break;
            case 'operations':
                this.updateOperationsTables(data);
                break;
            case 'logs':
                this.updateLogsTables(data);
                break;
            case 'training':
                this.updateTrainingTables(data);
                break;
            case 'salesOrders':
                this.updateSalesOrdersTable(data);
                break;
        }
    }

    updateCyclesTable(data) {
        const tbody = document.querySelector('.data-table tbody');
        if (!tbody || !data.cycles) return;

        const newHtml = data.cycles.map(c => {
            let actionsHtml = '—';
            if (c.cycle_status.toLowerCase() === 'active' && data.userRole === 'Manager') {
                const workerOptions = (data.farmerWorkers || []).map(w => 
                    `<option value="${w.person_id}">${w.FName} ${w.LName}</option>`
                ).join('');
                
                actionsHtml = `
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <form action="/cycles/assign-worker" method="POST" style="display:inline">
                            <input type="hidden" name="cycle_id" value="${c.cycle_id}">
                            <select name="person_id" onchange="this.form.submit()" style="padding: 2px 4px; font-size: 0.75rem;">
                                <option value="">Assign Worker...</option>
                                ${workerOptions}
                            </select>
                        </form>
                        <form action="/cycles/${c.cycle_id}/close" method="POST" style="display:inline" onsubmit="return confirm('Close this cycle?')">
                            <input type="hidden" name="end_date" value="${new Date().toISOString().split('T')[0]}">
                            <button type="submit" class="btn btn-sm btn-danger" title="Close Cycle"><i class="fa-solid fa-stop"></i></button>
                        </form>
                    </div>
                `;
            }

            return `
            <tr>
                <td><span class="badge badge-primary">#${c.cycle_id}</span><br><small class="text-muted">${c.assigned_workers || 'Unassigned'}</small></td>
                <td>${c.breed_name}</td>
                <td>${c.shed_name || '—'}</td>
                <td>${c.initial_chicks.toLocaleString()}</td>
                <td>${c.chick_price_per_unit} EGP</td>
                <td>${new Date(c.start_date).toLocaleDateString()}</td>
                <td>${c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}</td>
                <td>
                    <span class="badge ${c.cycle_status.toLowerCase() === 'active' ? 'badge-success' : 'badge-secondary'}">
                        ${c.cycle_status}
                    </span>
                </td>
                <td>${actionsHtml}</td>
            </tr>
            `;
        }).join('');
        tbody.innerHTML = newHtml;
    }

    updateOperationsTables(data) {
        // Update treatments table
        if (data.treatments) {
            const treatmentTbody = document.querySelector('[id="treatments"] .data-table tbody');
            if (treatmentTbody) {
                const html = data.treatments.map(t => `
                    <tr>
                        <td>${new Date(t.treatment_date).toLocaleDateString()}</td>
                        <td>#${t.cycle_id}</td>
                        <td>${t.medicine_name}</td>
                        <td>${t.quantity_used} ${t.unit}</td>
                        <td>${t.administered_by_fname} ${t.administered_by_lname}</td>
                        <td class="text-danger">${parseFloat(t.total_cost || 0).toFixed(2)} EGP</td>
                    </tr>
                `).join('');
                treatmentTbody.innerHTML = html;
            }
        }

        // Update maintenance table
        if (data.maintains) {
            const maintainTbody = document.querySelector('[id="maintenance"] .data-table tbody');
            if (maintainTbody) {
                const html = data.maintains.map(m => `
                    <tr>
                        <td>${new Date(m.maintenance_datetime).toLocaleString()}</td>
                        <td>${m.device_name || m.device_type}</td>
                        <td>${m.FName} ${m.LName}</td>
                        <td>${m.description || '—'}</td>
                        <td><span class="badge badge-${m.status === 'Completed' ? 'success' : m.status === 'In_Progress' ? 'warning' : 'secondary'}">${m.status}</span></td>
                    </tr>
                `).join('');
                maintainTbody.innerHTML = html;
            }
        }
    }

    updateLogsTables(data) {
        // Update daily logs table
        if (data.logs) {
            const logTbody = document.querySelector('[id="daily-logs"] .data-table tbody');
            if (logTbody) {
                const html = data.logs.map(l => `
                    <tr>
                        <td>${new Date(l.log_date).toLocaleDateString()}</td>
                        <td>#${l.cycle_id}</td>
                        <td>${l.breed_name}</td>
                        <td>${l.mortality_count || 0}</td>
                        <td>${l.birds_fed_count || 0}</td>
                        <td>${l.water_level || '—'}</td>
                        <td>${l.FName} ${l.LName}</td>
                    </tr>
                `).join('');
                logTbody.innerHTML = html;
            }
        }

        // Update vaccination records table
        if (data.vacRecords) {
            const vacTbody = document.querySelector('[id="vaccination-records"] .data-table tbody');
            if (vacTbody) {
                const html = data.vacRecords.map(v => `
                    <tr>
                        <td>${new Date(v.administered_at).toLocaleDateString()}</td>
                        <td>${v.vaccine_name}</td>
                        <td>${v.birds_vaccinated}</td>
                        <td>${v.batch_number || '—'}</td>
                        <td>${v.FName} ${v.LName}</td>
                        <td>${v.cost ? parseFloat(v.cost).toFixed(2) + ' EGP' : '—'}</td>
                    </tr>
                `).join('');
                vacTbody.innerHTML = html;
            }
        }
    }

    updateTrainingTables(data) {
        // Update enrollments table
        if (data.enrollments) {
            const tbody = document.querySelector('[id="enrollments"] .data-table tbody');
            if (tbody) {
                const html = data.enrollments.map(e => `
                    <tr>
                        <td>${e.FName} ${e.LName}</td>
                        <td>${e.training_title}</td>
                        <td><span class="badge badge-${e.completion_status === 'completed' ? 'success' : 'warning'}">${e.completion_status}</span></td>
                        <td>${e.score ? e.score + '%' : '—'}</td>
                        <td><i class="fa-solid ${e.certificate_issued ? 'fa-certificate text-success' : 'fa-circle-xmark text-muted'}"></i></td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="openEnrollmentModal(${JSON.stringify(e).replace(/"/g, '&quot;')})"><i class="fa-solid fa-edit"></i></button>
                        </td>
                    </tr>
                `).join('');
                tbody.innerHTML = html;
            }
        }
    }

    updateSalesOrdersTable(data) {
        if (!data.orders) return;
        const tbody = document.querySelector('.data-table tbody');
        if (!tbody) return;

        const html = data.orders.map(o => {
            const st = (o.status || '').toLowerCase();
            const ps = (o.payment_status || '').toLowerCase();
            
            let statusBadge = '';
            if (st === 'pending') {
                statusBadge = '<span class="badge badge-warning pulse-warning">PENDING APPROVAL</span>';
            } else {
                const badgeClass = st === 'delivered' ? 'success' : st === 'confirmed' ? 'primary' : st === 'ready' ? 'accent' : st === 'cancelled' ? 'danger' : 'secondary';
                statusBadge = `<span class="badge badge-${badgeClass}">${o.status.toUpperCase()}</span>`;
            }

            const paymentBadge = `<span class="badge badge-${ps === 'paid' ? 'success' : 'danger'}">${o.payment_status}</span>`;

            let actionBtns = '';
            
            if (st === 'pending') {
                actionBtns += `
                    <form action="/sales-orders/update-status" method="POST" style="display:inline" onsubmit="return confirm('Confirm this order?')">
                        <input type="hidden" name="order_id" value="${o.order_id}">
                        <input type="hidden" name="new_status" value="Confirmed">
                        <button class="btn btn-sm btn-primary" title="Confirm Order"><i class="fa-solid fa-check"></i></button>
                    </form>`;
            } else if (st === 'confirmed') {
                actionBtns += `
                    <form action="/sales-orders/update-status" method="POST" style="display:inline" onsubmit="return confirm('Mark as ready?')">
                        <input type="hidden" name="order_id" value="${o.order_id}">
                        <input type="hidden" name="new_status" value="Ready">
                        <button class="btn btn-sm btn-accent" title="Mark Ready"><i class="fa-solid fa-box"></i></button>
                    </form>`;
            } else if (st === 'ready') {
                actionBtns += `
                    <form action="/sales-orders/fulfill" method="POST" style="display:inline" onsubmit="return confirm('Fulfill this order? This will create a Sale record and deliver the birds.')">
                        <input type="hidden" name="order_id" value="${o.order_id}">
                        <button class="btn btn-sm btn-primary" title="Fulfill & Deliver"><i class="fa-solid fa-truck"></i></button>
                    </form>`;
            }

            if (st !== 'delivered' && st !== 'cancelled') {
                actionBtns += `
                    <form action="/sales-orders/update-status" method="POST" style="display:inline" onsubmit="return confirm('Cancel this order?')">
                        <input type="hidden" name="order_id" value="${o.order_id}">
                        <input type="hidden" name="new_status" value="Cancelled">
                        <button class="btn btn-sm btn-danger" title="Cancel Order"><i class="fa-solid fa-times"></i></button>
                    </form>`;
            }

            if (ps !== 'paid' && st !== 'cancelled' && st !== 'pending') {
                actionBtns += `
                    <form action="/sales-orders/update-payment" method="POST" style="display:inline">
                        <input type="hidden" name="order_id" value="${o.order_id}">
                        <input type="hidden" name="payment_status" value="Paid">
                        <button class="btn btn-sm btn-secondary" title="Mark Fully Paid"><i class="fa-solid fa-money-bill-wave"></i></button>
                    </form>`;
            }

            actionBtns += ` <a href="/customers?search=${encodeURIComponent(o.company_name || '')}" class="btn btn-sm btn-secondary" title="View Customer"><i class="fa-solid fa-user"></i></a>`;

            if (o.linked_sale_id) {
                actionBtns += ` <a href="/sales" class="btn btn-sm btn-secondary" title="View Sale Record"><i class="fa-solid fa-receipt"></i></a>`;
            }

            return `
                <tr>
                    <td><strong>${o.order_number}</strong></td>
                    <td>
                        ${o.customer_name || o.company_name}
                        ${o.company_name ? `<br><small class="text-muted">${o.company_name}</small>` : ''}
                    </td>
                    <td>#${o.cycle_id} — ${o.breed_name}</td>
                    <td>${(o.birds_qty || 0).toLocaleString()}</td>
                    <td>${o.est_weight_kg ? parseFloat(o.est_weight_kg).toLocaleString() : '—'}</td>
                    <td>${parseFloat(o.price_per_kg || 0).toFixed(2)}</td>
                    <td><strong>${parseFloat(o.total_amount || 0).toLocaleString('en', {minimumFractionDigits:2})} EGP</strong></td>
                    <td>${new Date(o.order_date).toLocaleDateString()}</td>
                    <td>${o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : '—'}</td>
                    <td>${statusBadge}</td>
                    <td>${paymentBadge}</td>
                    <td style="white-space:nowrap">${actionBtns}</td>
                </tr>
            `;
        }).join('');
        
        tbody.innerHTML = html;
    }

    // Manual refresh method
    refreshNow(dataType) {
        if (dataType) {
            this.poll(dataType);
        } else {
            // Refresh all
            Object.keys(this.apiEndpoints).forEach(type => this.poll(type));
        }
    }
}

// Initialize global instance
const realtimeSync = new RealtimeSync();

// Auto-start sync on page load if data exists
document.addEventListener('DOMContentLoaded', () => {
    const pageType = document.body.getAttribute('data-page-type') || null;
    if (pageType) {
        realtimeSync.startSync(pageType);
    }
});
