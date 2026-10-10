const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'your_mysql_password',
    database: process.env.DB_NAME || 'smartpoultryfarm',
    multipleStatements: true
};

async function seed() {
    console.log('🌱 Starting Deep Seeding v6.0 (Realistic Data Edition)...');
    const connection = await mysql.createConnection(dbConfig);
    const salt = await bcrypt.genSalt(10);
    const commonPass = await bcrypt.hash('admin1234', salt);
    const workerPass = await bcrypt.hash('farmwork1234', salt);
    const techPass = await bcrypt.hash('tech1234', salt);

    try {
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        
        const today = new Date();
        const sixtyDaysAgo = new Date(today.getTime() - 60 * 86400000);
        const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 86400000);
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
        const fifteenDaysAgo = new Date(today.getTime() - 15 * 86400000);
        
        const tables = [
            'Audit_Log', 'Maintains', 'Device_Usage', 'Device', 'Device_Type', 'Quality_Control', 'Performance_Review',
            'Training_Enrollment', 'Training', 'Payroll', 'Attendance', 'Sale',
            'Sales_Order', 'Customer', 'Purchase_Order', 'Expense', 'Vaccination_Record',
            'Vaccination_Schedule', 'Treatment', 'Daily_Mortality', 'Daily_Feed',
            'Daily_Log', 'Cycle', 'Vaccine_Stock', 'Vaccine', 'Medicine_Stock',
            'Medicine', 'Feed_Stock', 'Feed_Type', 'Storage', 'Supplier', 'Shed',
            'Breed', 'User', 'Technician', 'Farmer_Worker', 'Manager', 'Worker'
        ];
        for (const table of tables) {
            await connection.query(`TRUNCATE TABLE ${table}`);
        }

        console.log('👥 Seeding Workers & Users...');
        const workers = [
            [1001, 'Ahmed', 'Mansour', '29001011234567', '01012345678', 'ahmed.m@smartfarm.com', 'Cairo, Egypt', 'Farm Director', '2022-01-15', 25000, 'Manager'],
            [1002, 'Sarah', 'Khalil', '29505051234567', '01123456789', 'sarah.k@smartfarm.com', 'Giza, Egypt', 'Operations Manager', '2022-03-10', 18000, 'Manager'],
            [1003, 'Mohamed', 'Hassan', '28808081234567', '01234567890', 'mohamed.h@smartfarm.com', 'Alexandria, Egypt', 'HR Manager', '2022-05-20', 15000, 'Manager'],
            [1004, 'Youssef', 'Ali', '29202021234567', '01545678901', 'youssef.a@smartfarm.com', 'Sharkia, Egypt', 'Senior Caretaker', '2023-01-01', 8500, 'Farmer_Worker'],
            [1005, 'Mona', 'Zaki', '29810101234567', '01098765432', 'mona.z@smartfarm.com', 'Daqahliya, Egypt', 'Junior Caretaker', '2023-02-15', 6500, 'Farmer_Worker'],
            [1006, 'Omar', 'Farouk', '29103031234567', '01112233445', 'omar.f@smartfarm.com', 'Menofia, Egypt', 'Caretaker', '2023-03-01', 7000, 'Farmer_Worker'],
            [1007, 'Heba', 'Ibrahim', '29411111234567', '01223344556', 'heba.i@smartfarm.com', 'Beheira, Egypt', 'Caretaker', '2023-04-10', 7000, 'Farmer_Worker'],
            [1008, 'Khaled', 'Saeed', '28912121234567', '01556677889', 'khaled.s@smartfarm.com', 'Gharbia, Egypt', 'Night Shift Caretaker', '2023-05-01', 7500, 'Farmer_Worker'],
            [1009, 'Layla', 'Mahmoud', '29709091234567', '01001122334', 'layla.m@smartfarm.com', 'Cairo, Egypt', 'Caretaker', '2023-06-15', 7000, 'Farmer_Worker'],
            [1010, 'Tarek', 'Nabil', '29304041234567', '01155443322', 'tarek.n@smartfarm.com', 'Qalyubia, Egypt', 'Lead Technician', '2022-11-01', 12000, 'Technician'],
            [1011, 'Amr', 'Adel', '29606061234567', '01299887766', 'amr.a@smartfarm.com', 'Cairo, Egypt', 'Automation Specialist', '2023-02-01', 11000, 'Technician'],
            [1012, 'Zainab', 'Reda', '29907071234567', '01533221100', 'zainab.r@smartfarm.com', 'Giza, Egypt', 'Maintenance Tech', '2023-04-20', 9500, 'Technician']
        ];
        await connection.query(`INSERT INTO Worker (person_id, FName, LName, national_ID, phone, email, address, job_title, hire_date, monthly_salary, worker_type) VALUES ?`, [workers]);

        await connection.query(`INSERT INTO Manager (person_id, contract_type, years_experience, education_level) VALUES 
            (1001, 'Permanent', 15, 'PhD Animal Science'), 
            (1002, 'Permanent', 10, 'MSc Agriculture'), 
            (1003, 'Permanent', 8, 'BSc Commerce')`);
        
        await connection.query(`INSERT INTO Farmer_Worker (person_id, contract_type, assigned_area) VALUES 
            (1004, 'Full-time', '15001'), (1005, 'Full-time', '15001'), 
            (1006, 'Full-time', '15003'), (1007, 'Full-time', '15003'),
            (1008, 'Full-time', '15002'), (1009, 'Full-time', '15004')`);

        await connection.query(`INSERT INTO Technician (person_id, specialization, license_number) VALUES 
            (1010, 'Automated_Systems', 'LIC-AS-2022-001'), 
            (1011, 'Electrical', 'LIC-EL-2023-042'), 
            (1012, 'Mechanical', 'LIC-ME-2023-115')`);

        const managerPass3 = await bcrypt.hash('mohamedh1003', salt);
        const workerPass2 = await bcrypt.hash('monaz1005', salt);
        const workerPass3 = await bcrypt.hash('omarf1006', salt);
        const workerPass4 = await bcrypt.hash('hebai1007', salt);
        const workerPass5 = await bcrypt.hash('khaleds1008', salt);
        const workerPass6 = await bcrypt.hash('laylam1009', salt);
        const techPass2 = await bcrypt.hash('amra1011', salt);
        const techPass3 = await bcrypt.hash('zainabr1012', salt);

        await connection.query(`INSERT INTO User (username, password_hash, user_role, is_admin, person_id) VALUES 
            ('admin1234', '${commonPass}', 'Manager', 1, 1001),
            ('manager2', '${commonPass}', 'Manager', 0, 1002),
            ('mohamedh1003', '${managerPass3}', 'Manager', 0, 1003),
            ('farmwork1234', '${workerPass}', 'Farmer_Worker', 0, 1004),
            ('monaz1005', '${workerPass2}', 'Farmer_Worker', 0, 1005),
            ('omarf1006', '${workerPass3}', 'Farmer_Worker', 0, 1006),
            ('hebai1007', '${workerPass4}', 'Farmer_Worker', 0, 1007),
            ('khaleds1008', '${workerPass5}', 'Farmer_Worker', 0, 1008),
            ('laylam1009', '${workerPass6}', 'Farmer_Worker', 0, 1009),
            ('tech1234', '${techPass}', 'Technician', 0, 1010),
            ('amra1011', '${techPass2}', 'Technician', 0, 1011),
            ('zainabr1012', '${techPass3}', 'Technician', 0, 1012)`);

        console.log('🏗️ Seeding Infrastructure...');
        await connection.query(`INSERT INTO Breed (breed_id, breed_name, target_fcr, avg_weight_day42, description) VALUES 
            (14001, 'Cobb 500', 1.62, 2.85, 'World standard for broiler performance and efficiency.'), 
            (14002, 'Ross 308', 1.65, 2.95, 'Versatile broiler with excellent growth and yield.'), 
            (14003, 'Hubbard Efficiency Plus', 1.70, 2.75, 'Focuses on low FCR and bird robustness.')`);
        
        await connection.query(`INSERT INTO Shed (shed_id, shed_name, capacity, area_sqm, status) VALUES 
            (15001, 'Shed A - Smart', 12000, 1000, 'Active'), 
            (15002, 'Shed B - Standard', 10000, 850, 'Not_Ready'), 
            (15003, 'Shed C - Eco', 15000, 1200, 'Active'), 
            (15004, 'Shed D - Quarantine', 5000, 450, 'Cleaning')`);

        console.log('📦 Seeding Stock & Suppliers...');
        await connection.query(`INSERT INTO Supplier (supplier_id, company_name, contact_person, phone, email, city, supplier_type) VALUES 
            (8001, 'Nile Feed Industries', 'Eng. Sameh', '01011112222', 'sales@nilefeed.com', 'Cairo', 'Feed'),
            (8002, 'Global Poultry Pharma', 'Dr. Reem', '01122223333', 'info@globalpharma.com', 'Alexandria', 'Medicine'),
            (8003, 'VaxEgypt Labs', 'Dr. Hany', '01233334444', 'orders@vaxegypt.com', 'Giza', 'Vaccine'),
            (8004, 'Modern Farm Tools', 'Mr. Sherif', '01544445555', 'support@farmtools.eg', 'Beni Suef', 'Equipment')`);

        await connection.query(`INSERT INTO Storage (storage_id, storage_name, storage_type, capacity, location) VALUES 
            (10001, 'Main Feed Silo 1', 'Feed_Silo', 60000, 'Rear Yard East'),
            (10002, 'Lab Cold Storage', 'Medicine_Fridge', 1000, 'Main Admin Building'),
            (10003, 'Vaccine Deep Freeze', 'Vaccine_Cooler', 500, 'Main Admin Building'),
            (10004, 'Equipment Depot', 'Equipment_Room', 5000, 'South Gate')`);

        await connection.query(`INSERT INTO Feed_Type (feed_type_id, name, protein_pct, energy_kcal, manufacturer, recommended_age_days, supplier_id) VALUES 
            (11001, 'Starter Pellets', 22.5, 3050, 'Nile Feed', 10, 8001), 
            (11002, 'Grower Pellets', 20.0, 3150, 'Nile Feed', 25, 8001), 
            (11003, 'Finisher Pellets', 18.5, 3250, 'Nile Feed', 42, 8001)`);

        await connection.query(`INSERT INTO Feed_Stock (storage_id, feed_type_id, quantity, reorder_level) VALUES 
            (10001, 11001, 45000, 5000), (10001, 11002, 35000, 5000), (10001, 11003, 10000, 2000)`);

        await connection.query(`INSERT INTO Medicine (medicine_id, medicine_name, unit, price_per_unit, manufacturer, supplier_id) VALUES 
            (12001, 'Amoxicillin 50%', 'g', 6.50, 'Global Pharma', 8002), 
            (12002, 'Vit-Amino Mix', 'ml', 3.20, 'Bio-Vet', 8002), 
            (12003, 'Electrolyte Balance', 'g', 2.10, 'Bio-Vet', 8002),
            (12004, 'Feeder Spare Motor', 'pcs', 1500.00, 'Modern Tools', 8004)`);

        await connection.query(`INSERT INTO Medicine_Stock (medicine_id, storage_id, quantity, reorder_level) VALUES 
            (12001, 10002, 2000, 200), (12002, 10002, 1500, 100), (12003, 10002, 5000, 500)`);

        await connection.query(`INSERT INTO Vaccine (vaccine_id, vaccine_name, target_disease, manufacturer, supplier_id) VALUES 
            (13001, 'Gumboro-L', 'Gumboro', 'VaxEgypt', 8003), 
            (13002, 'NewVax-G7', 'Newcastle', 'VaxEgypt', 8003),
            (13003, 'IB-H120', 'Infectious Bronchitis', 'Boehringer', 8003)`);

        await connection.query(`INSERT INTO Vaccine_Stock (vaccine_id, storage_id, doses_available) VALUES 
            (13001, 10003, 25000), (13002, 10003, 30000), (13003, 10003, 15000)`);

        console.log('🛠️ Seeding Equipment & Devices...');
        await connection.query(`INSERT INTO Device_Type (type_id, type_name, description) VALUES 
            (23001, 'Auto-Feeder', 'Automated auger feeding system'),
            (23002, 'Cooling Pad', 'Evaporative cooling system'),
            (23003, 'Heater', 'Gas-fired space heater')`);

        await connection.query(`INSERT INTO Device (device_id, device_name, type_id, status, shed_id) VALUES 
            (24001, 'Feeder-A1', 23001, 'Operational', 15001),
            (24002, 'Cooler-A1', 23002, 'Maintenance_Due', 15001),
            (24003, 'Heater-C1', 23003, 'Operational', 15003)`);

        await connection.query(`INSERT INTO Maintains (person_id, device_id, maintenance_datetime, description, status, cost) VALUES 
            (1010, 24002, '${fifteenDaysAgo.toISOString().split('T')[0]} 10:00:00', 'Cleaned dust filters', 'Completed', 150.00)`);

        console.log('📈 Seeding Cycles & Production Data...');


        const cycles = [
            [16001, 14001, 15001, 10000, 18.50, sixtyDaysAgo.toISOString().split('T')[0], thirtyDaysAgo.toISOString().split('T')[0], 'Closed', 1001],
            [16002, 14002, 15003, 12000, 19.20, fortyFiveDaysAgo.toISOString().split('T')[0], fifteenDaysAgo.toISOString().split('T')[0], 'Closed', 1002],
            [16003, 14001, 15001, 11500, 21.00, fifteenDaysAgo.toISOString().split('T')[0], null, 'Active', 1001],
            [16004, 14003, 15003, 14000, 20.50, new Date(today.getTime() - 5*86400000).toISOString().split('T')[0], null, 'Active', 1002]
        ];
        await connection.query(`INSERT INTO Cycle (cycle_id, breed_id, shed_id, initial_chicks, chick_price_per_unit, start_date, end_date, cycle_status, manager_id) VALUES ?`, [cycles]);

        // Assign workers to cycles
        await connection.query(`INSERT INTO Assigned_To (cycle_id, person_id) VALUES 
            (16001, 1004), (16001, 1005), (16002, 1006), (16002, 1007),
            (16003, 1004), (16003, 1005), (16004, 1006), (16004, 1007)`);

        // Seed logs for Active Cycles
        const activeCycleIds = [16003, 16004];
        for (const cycleId of activeCycleIds) {
            const startDate = cycleId === 16003 ? fifteenDaysAgo : new Date(today.getTime() - 5*86400000);
            const daysToSeed = cycleId === 16003 ? 15 : 5;
            const workerId = cycleId === 16003 ? 1004 : 1006;

            for (let i = 0; i < daysToSeed; i++) {
                const logDate = new Date(startDate);
                logDate.setDate(logDate.getDate() + i);
                const isoDate = logDate.toISOString().split('T')[0];
                
                const [log] = await connection.query(`INSERT IGNORE INTO Daily_Log (cycle_id, log_date, temp_celsius, humidity, ammonia_level, water_consumption, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                    [cycleId, isoDate, 28 + Math.random()*5, 55 + Math.random()*15, 15 + Math.random()*10, 500 + Math.random()*100, workerId]);
                
                if (log.insertId) {
                    const logId = log.insertId;
                    const feedType = i < 10 ? 11001 : 11002;
                    await connection.query(`INSERT INTO Daily_Feed (log_id, cycle_id, feed_type_id, quantity, price) VALUES (?, ?, ?, ?, ?)`, 
                        [logId, cycleId, feedType, 800 + (i*100), 22.5]);
                    
                    if (i % 4 === 0) {
                        await connection.query(`INSERT INTO Daily_Mortality (log_id, cycle_id, dead_count, cause) VALUES (?, ?, ?, ?)`, 
                            [logId, cycleId, 1 + Math.floor(Math.random()*3), 'Heat_Stress']);
                    }
                }
            }
        }

        console.log('🏥 Seeding Health & QC...');
        await connection.query(`INSERT INTO Treatment (cycle_id, medicine_id, treatment_date, quantity_used, treatment_type, administered_by) VALUES 
            (16003, 12001, '${fifteenDaysAgo.toISOString().split('T')[0]}', 500, 'Preventative', 1004), 
            (16003, 12002, '${new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0]}', 1000, 'Growth_Boost', 1005)`);

        await connection.query(`INSERT INTO Vaccination_Schedule (cycle_id, vaccine_id, scheduled_date, planned_birds, status) VALUES 
            (16003, 13001, '${new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0]}', 11500, 'Completed'), 
            (16003, 13002, '${new Date(today.getTime() + 2 * 86400000).toISOString().split('T')[0]}', 11400, 'Pending')`);

        await connection.query(`INSERT INTO Quality_Control (cycle_id, inspector_id, inspection_date, inspection_type, compliance_status, test_results) VALUES 
            (16003, 1010, '${fifteenDaysAgo.toISOString().split('T')[0]}', 'Environment', 'Pass', 'All systems online, ammonia within safe limits.'),
            (16003, 1011, '${new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0]}', 'Bird_Health', 'Pass', 'Flock weight tracking on schedule.')`);

        console.log('💰 Seeding Financials & Commercials...');
        await connection.query(`INSERT INTO Customer (customer_id, company_name, trade_name, customer_type, phone, email, city, address, credit_limit) VALUES 
            (2001, 'HyperOne Markets', 'HyperOne', 'Market', '0235391211', 'b2b@hyperone.com.eg', 'Giza', '6th October City', 500000),
            (2002, 'KFC Egypt (Americana)', 'KFC', 'Restaurant', '0219019', 'procurement@americana.com', 'Cairo', 'Maadi', 1000000),
            (2003, 'Meat & Poultry Wholesalers', 'MPW', 'Wholesaler', '0233445566', 'sales@mpw.eg', 'Alexandria', 'Free Zone', 250000)`);

        await connection.query(`INSERT INTO Expense (cycle_id, category, amount, expense_date, created_by, notes) VALUES 
            (16003, 'Utilities', 8500.50, '${today.toISOString().split('T')[0]}', 1001, 'Monthly electricity and water bill'), 
            (16003, 'Maintenance', 1200.00, '${new Date(today.getTime() - 8 * 86400000).toISOString().split('T')[0]}', 1001, 'Replacement of 2 cooling pads')`);

        await connection.query(`INSERT INTO Purchase_Order (po_id, po_number, supplier_id, item_type, item_name, quantity, unit_price, order_date, delivery_date, status) VALUES 
            (9001, 'PO-2026-101', 8001, 'Feed', 'Grower Pellets', 10000, 21.50, '${new Date(today.getTime() - 20 * 86400000).toISOString().split('T')[0]}', '${new Date(today.getTime() - 18 * 86400000).toISOString().split('T')[0]}', 'Received'),
            (9002, 'PO-2026-102', 8003, 'Vaccine', 'NewVax-G7', 50000, 0.45, '${new Date(today.getTime() - 15 * 86400000).toISOString().split('T')[0]}', '${new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0]}', 'Confirmed')`);

        await connection.query(`INSERT INTO Sales_Order (order_number, customer_id, cycle_id, order_date, delivery_date, birds_qty, est_weight_kg, price_per_kg, status) VALUES 
            ('SO-2026-OLD1', 2001, 16001, '${sixtyDaysAgo.toISOString().split('T')[0]}', '${thirtyDaysAgo.toISOString().split('T')[0]}', 9500, 26000, 78.50, 'Delivered'),
            ('SO-2026-OLD2', 2002, 16002, '${fortyFiveDaysAgo.toISOString().split('T')[0]}', '${fifteenDaysAgo.toISOString().split('T')[0]}', 11500, 32000, 81.00, 'Delivered'),
            ('SO-2026-001', 2001, 16003, '${new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0]}', '${new Date(today.getTime() + 10 * 86400000).toISOString().split('T')[0]}', 5000, 10000, 85.00, 'Confirmed')`);

        // Seed some past sales for reporting
        // Note: order_id 1 is SO-2026-OLD1, order_id 2 is SO-2026-OLD2
        await connection.query(`INSERT INTO Sale (cycle_id, manager_id, customer_id, order_id, sale_date, birds_sold, total_weight_kg, price_per_kg) VALUES 
            (16001, 1001, 2001, 1, '${thirtyDaysAgo.toISOString().split('T')[0]}', 9500, 26000, 78.50),
            (16002, 1002, 2002, 2, '${fifteenDaysAgo.toISOString().split('T')[0]}', 11500, 32000, 81.00)`);

        console.log('👔 Seeding HR & Logs...');
        const attendanceValues = [];
        for (let w = 1; w <= 12; w++) {
            for (let d = 0; d < 14; d++) {
                const aDate = new Date(today);
                aDate.setDate(today.getDate() - d);
                attendanceValues.push([1000 + w, aDate.toISOString().split('T')[0], 'Present', '08:00:00', '16:30:00']);
            }
        }
        await connection.query(`INSERT INTO Attendance (person_id, work_date, status, check_in, check_out) VALUES ?`, [attendanceValues]);

        await connection.query(`INSERT INTO Payroll (person_id, payment_date, period_start, period_end, basic_salary, net_amount, status) VALUES 
            (1004, '${today.toISOString().split('T')[0]}', '${thirtyDaysAgo.toISOString().split('T')[0]}', '${today.toISOString().split('T')[0]}', 8500, 8500, 'Paid'),
            (1005, '${today.toISOString().split('T')[0]}', '${thirtyDaysAgo.toISOString().split('T')[0]}', '${today.toISOString().split('T')[0]}', 6500, 6500, 'Paid')`);

        await connection.query(`INSERT INTO Training (training_id, title, description, trainer, location, scheduled_date, duration_hours, status) VALUES 
            (50001, 'Advanced Bio-Security', 'Updated protocols for H5N1 prevention', 'Dr. Mahmoud Fawzy', 'Conference Room A', '2026-06-01', 4, 'Planned'),
            (50002, 'FCR Optimization', 'Strategies to reduce feed waste', 'Eng. Ahmed Zewail', 'Shed A', '2026-05-20', 3, 'Planned')`);

        await connection.query(`INSERT INTO Training_Enrollment (training_id, person_id, status, score) VALUES 
            (50001, 1004, 'Enrolled', NULL), (50001, 1005, 'Enrolled', NULL), (50001, 1006, 'Enrolled', NULL),
            (50002, 1004, 'Completed', 92.50), (50002, 1005, 'Enrolled', NULL)`);

        await connection.query(`INSERT INTO Performance_Review (person_id, reviewer_id, review_date, score, comments) VALUES 
            (1004, 1001, '2026-05-01', 5, 'Exceptional attention to bird health and bio-security.'),
            (1010, 1002, '2026-05-02', 4, 'Handled the sensor malfunction in Shed C very professionally.')`);

        const auditValues = [
            [1001, 'Login', 'User', 'Administrator logged in successfully', '192.168.1.10'],
            [1001, 'Create', 'Cycle', 'New production cycle 16003 started', '192.168.1.10'],
            [1004, 'Insert', 'Daily_Log', 'Added daily monitoring data for Shed A', '192.168.1.45'],
            [1002, 'Update', 'Sales_Order', 'Confirmed SO-2026-001 with HyperOne', '192.168.1.12']
        ];
        await connection.query(`INSERT INTO Audit_Log (person_id, action, entity, details, ip_address) VALUES ?`, [auditValues]);

        console.log('✅ SEEDING COMPLETE! Login with: admin1234 / admin1234');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        process.exit(0);
    } catch (err) {
        console.error('❌ SEEDING FAILED:', err);
        process.exit(1);
    }
}

seed();
