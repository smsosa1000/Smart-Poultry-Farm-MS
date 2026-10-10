-- ============================================================================
-- SMART POULTRY FARM MANAGEMENT SYSTEM v5.0 - COMPLETE SCHEMA
-- Tested against MySQL 8.0.45 — zero errors


DROP DATABASE IF EXISTS smartpoultryfarm;
CREATE DATABASE smartpoultryfarm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smartpoultryfarm;

-- ============================================================================
-- SECTION 1: INTERNAL STAFFING & USER HIERARCHY
-- ============================================================================

CREATE TABLE Worker (
  person_id       INT AUTO_INCREMENT PRIMARY KEY,
  FName           VARCHAR(100)   NOT NULL,
  LName           VARCHAR(100)   NOT NULL,
  national_ID     VARCHAR(50)    UNIQUE,
  phone           VARCHAR(15),
  email           VARCHAR(100),
  address         VARCHAR(255),
  job_title       VARCHAR(100)   NOT NULL,
  hire_date       DATE           NOT NULL,
  monthly_salary  DECIMAL(10,2)  NOT NULL CHECK (monthly_salary > 0),
  worker_type     ENUM('Manager','Farmer_Worker','Technician') NOT NULL,
  created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_worker_type (worker_type),
  INDEX idx_email (email)
) ENGINE=InnoDB AUTO_INCREMENT=1000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Manager (
  person_id        INT           PRIMARY KEY,
  contract_type    VARCHAR(50)   NOT NULL,
  years_experience INT           CHECK (years_experience >= 0),
  education_level  VARCHAR(100),
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES Worker(person_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Farmer_Worker (
  person_id     INT          PRIMARY KEY,
  assigned_area VARCHAR(255),
  shift_time    VARCHAR(50),
  contract_type VARCHAR(50)  NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES Worker(person_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Technician (
  person_id      INT          PRIMARY KEY,
  specialization VARCHAR(100) NOT NULL,
  license_number VARCHAR(100),
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES Worker(person_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE User (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100)  UNIQUE NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  user_role     ENUM('Manager','Farmer_Worker','Technician') NOT NULL,
  is_admin      BOOLEAN       DEFAULT FALSE,
  person_id     INT           UNIQUE NOT NULL,
  is_active     BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  last_login    TIMESTAMP     NULL,
  FOREIGN KEY (person_id) REFERENCES Worker(person_id) ON DELETE CASCADE,
  INDEX idx_username  (username),
  INDEX idx_user_role (user_role)
) ENGINE=InnoDB AUTO_INCREMENT=1000 DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SECTION 2: SUPPLY CHAIN & INVENTORY
-- (Must be created before Cycle and Sales tables due to FK dependencies)
-- ============================================================================

CREATE TABLE Supplier (
  supplier_id    INT AUTO_INCREMENT PRIMARY KEY,
  company_name   VARCHAR(255)  NOT NULL UNIQUE,
  contact_person VARCHAR(255),
  phone          VARCHAR(15),
  email          VARCHAR(100),
  city           VARCHAR(100),
  supplier_type  SET('Feed','Medicine','Vaccine','Equipment') NOT NULL,
  status         ENUM('Active','Inactive') DEFAULT 'Active',
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=8000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Storage (
  storage_id   INT AUTO_INCREMENT PRIMARY KEY,
  storage_name VARCHAR(255)  UNIQUE NOT NULL,
  storage_type ENUM('Feed_Silo','Medicine_Fridge','Vaccine_Cooler','Equipment_Room','Medicine_Cabinet','Vaccine_Fridge','Equipment_Shed') NOT NULL,
  capacity     DECIMAL(10,2) NOT NULL CHECK (capacity > 0),
  location     VARCHAR(255),
  is_active    BOOLEAN       DEFAULT TRUE,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=10000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Purchase_Order (
  po_id          INT AUTO_INCREMENT PRIMARY KEY,
  po_number      VARCHAR(50)   UNIQUE,
  supplier_id    INT           NOT NULL,
  item_type      ENUM('Feed','Medicine','Vaccine','Equipment','Chicks','Other') NOT NULL,
  item_name      VARCHAR(255),
  item_description VARCHAR(255),
  order_date     DATE          NOT NULL,
  expected_delivery_date DATE,
  delivery_date  DATE,
  status         ENUM('Draft','Sent','Confirmed','Received','Cancelled') DEFAULT 'Draft',
  quantity       DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
  unit_price     DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  total_amount   DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL,
  storage_id     INT,
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id) ON DELETE RESTRICT,
  FOREIGN KEY (storage_id)  REFERENCES Storage(storage_id)  ON DELETE SET NULL,
  INDEX idx_po_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=9000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Feed_Type (
  feed_type_id         INT AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(255)  UNIQUE NOT NULL,
  protein_pct          DECIMAL(5,2)  CHECK (protein_pct BETWEEN 0 AND 100),
  energy_kcal          INT           CHECK (energy_kcal >= 0),
  manufacturer         VARCHAR(255),
  recommended_age_days INT           CHECK (recommended_age_days >= 0),
  status               ENUM('Active','Inactive') DEFAULT 'Active',
  supplier_id          INT,
  created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Feed_Stock (
  storage_id        INT           NOT NULL,
  feed_type_id      INT           NOT NULL,
  quantity          DECIMAL(10,2) DEFAULT 0  CHECK (quantity >= 0),
  reorder_level     DECIMAL(10,2)            CHECK (reorder_level >= 0),
  expiry_date       DATE,
  last_restock_date DATE,
  PRIMARY KEY (storage_id, feed_type_id),
  FOREIGN KEY (storage_id)   REFERENCES Storage(storage_id)     ON DELETE CASCADE,
  FOREIGN KEY (feed_type_id) REFERENCES Feed_Type(feed_type_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Medicine (
  medicine_id           INT AUTO_INCREMENT PRIMARY KEY,
  medicine_name         VARCHAR(255)  UNIQUE NOT NULL,
  unit                  VARCHAR(50),
  price_per_unit        DECIMAL(10,2) NOT NULL CHECK (price_per_unit > 0),
  manufacturer          VARCHAR(255),
  purpose               VARCHAR(255),
  requires_prescription BOOLEAN       DEFAULT FALSE,
  withdrawal_days       INT           DEFAULT 0 CHECK (withdrawal_days >= 0),
  supplier_id           INT,
  status                ENUM('Active','Inactive') DEFAULT 'Active',
  created_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Medicine_Stock (
  storage_id    INT  NOT NULL,
  medicine_id   INT  NOT NULL,
  quantity      INT  DEFAULT 0  CHECK (quantity >= 0),
  reorder_level INT             CHECK (reorder_level >= 0),
  expiry_date   DATE,
  batch_number  VARCHAR(100),
  PRIMARY KEY (storage_id, medicine_id),
  FOREIGN KEY (storage_id)  REFERENCES Storage(storage_id)   ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES Medicine(medicine_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Vaccine (
  vaccine_id           INT AUTO_INCREMENT PRIMARY KEY,
  vaccine_name         VARCHAR(255)  UNIQUE NOT NULL,
  target_disease       VARCHAR(255),
  manufacturer         VARCHAR(255),
  admin_route          VARCHAR(100),
  recommended_age_days INT           CHECK (recommended_age_days >= 0),
  dose_per_bird        DECIMAL(5,2)  CHECK (dose_per_bird > 0),
  price_per_dose       DECIMAL(10,2) DEFAULT 0.00 CHECK (price_per_dose >= 0),
  cold_chain_temp      VARCHAR(50),
  supplier_id          INT,
  status               ENUM('Active','Inactive') DEFAULT 'Active',
  created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=13000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Vaccine_Stock (
  storage_id      INT  NOT NULL,
  vaccine_id      INT  NOT NULL,
  doses_available INT  DEFAULT 0 CHECK (doses_available >= 0),
  expiry_date     DATE,
  batch_number    VARCHAR(100),
  PRIMARY KEY (storage_id, vaccine_id),
  FOREIGN KEY (storage_id) REFERENCES Storage(storage_id) ON DELETE CASCADE,
  FOREIGN KEY (vaccine_id) REFERENCES Vaccine(vaccine_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SECTION 3: FARM CORE
-- ============================================================================

CREATE TABLE Breed (
  breed_id             INT AUTO_INCREMENT PRIMARY KEY,
  breed_name           VARCHAR(255)  UNIQUE NOT NULL,
  origin               VARCHAR(255),
  target_fcr           DECIMAL(5,2)  CHECK (target_fcr > 0),
  avg_weight_day42     DECIMAL(5,2)  CHECK (avg_weight_day42 > 0),
  target_mortality_pct DECIMAL(5,2)  CHECK (target_mortality_pct BETWEEN 0 AND 100),
  description          TEXT,
  status               ENUM('Active','Inactive') DEFAULT 'Active',
  created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=14000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Shed (
  shed_id    INT AUTO_INCREMENT PRIMARY KEY,
  shed_name  VARCHAR(255)  UNIQUE NOT NULL,
  capacity   INT           NOT NULL CHECK (capacity > 0),
  area_sqm   DECIMAL(10,2) CHECK (area_sqm > 0),
  status     ENUM('Active','Not_Ready','Cleaning','Maintenance') DEFAULT 'Active',
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=15000 DEFAULT CHARSET=utf8mb4;

-- NOTE: One active cycle per shed is enforced by Trigger T0 below.
-- MySQL does not support inline CASE expressions in UNIQUE KEY definitions.
CREATE TABLE Cycle (
  cycle_id             INT AUTO_INCREMENT PRIMARY KEY,
  breed_id             INT           NOT NULL,
  shed_id              INT           NOT NULL,
  initial_chicks       INT           NOT NULL CHECK (initial_chicks > 0),
  chick_price_per_unit DECIMAL(10,2) NOT NULL CHECK (chick_price_per_unit > 0),
  start_date           DATE          NOT NULL,
  end_date             DATE,
  cycle_status         ENUM('Active','Closed','Aborted') DEFAULT 'Active',
  manager_id           INT           NOT NULL,
  created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_cycle_dates CHECK (end_date IS NULL OR end_date >= start_date),
  FOREIGN KEY (breed_id)   REFERENCES Breed(breed_id)          ON DELETE RESTRICT,
  FOREIGN KEY (shed_id)    REFERENCES Shed(shed_id)             ON DELETE RESTRICT,
  FOREIGN KEY (manager_id) REFERENCES Manager(person_id)        ON DELETE RESTRICT,
  INDEX idx_cycle_status (cycle_status),
  INDEX idx_cycle_shed   (shed_id)
) ENGINE=InnoDB AUTO_INCREMENT=16000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Assigned_To (
  cycle_id      INT  NOT NULL,
  person_id     INT  NOT NULL,
  assigned_date DATE DEFAULT (CURRENT_DATE),
  PRIMARY KEY (cycle_id, person_id),
  FOREIGN KEY (cycle_id)  REFERENCES Cycle(cycle_id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES Farmer_Worker(person_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Expense_Category (
  category_id        INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100)   UNIQUE NOT NULL,
  description        TEXT,
  parent_category_id INT,
  budget_limit       DECIMAL(15,2)  CHECK (budget_limit >= 0),
  created_at         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_category_id) REFERENCES Expense_Category(category_id) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20000 DEFAULT CHARSET=utf8mb4;

-- WEAK ENTITY: partial key log_id + AUTO_INCREMENT, owner = Cycle
CREATE TABLE Daily_Log (
  log_id            INT           NOT NULL AUTO_INCREMENT,
  cycle_id          INT           NOT NULL,
  log_date          DATE          NOT NULL,
  temp_celsius      DECIMAL(5,2),
  humidity          DECIMAL(5,2),
  ammonia_level     DECIMAL(5,2),
  water_consumption DECIMAL(10,2),
  notes             TEXT,
  created_by        INT           NOT NULL,
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id, cycle_id),
  UNIQUE KEY uq_log_cycle_date (cycle_id, log_date),
  CONSTRAINT chk_humidity CHECK (humidity        IS NULL OR humidity        BETWEEN 0  AND 100),
  CONSTRAINT chk_ammonia  CHECK (ammonia_level   IS NULL OR ammonia_level   BETWEEN 0  AND 200),
  CONSTRAINT chk_water    CHECK (water_consumption IS NULL OR water_consumption >= 0),
  CONSTRAINT chk_temp     CHECK (temp_celsius    IS NULL OR temp_celsius    BETWEEN -10 AND 60),
  FOREIGN KEY (cycle_id)    REFERENCES Cycle(cycle_id)               ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES Worker(person_id)      ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- WEAK ENTITY: 1:many child of Daily_Log, PK includes feed_type_id to allow
-- multiple feed types per log entry
CREATE TABLE Daily_Feed (
  log_id       INT           NOT NULL,
  cycle_id     INT           NOT NULL,
  feed_type_id INT           NOT NULL,
  quantity     DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
  price        DECIMAL(10,2)          CHECK (price >= 0),
  PRIMARY KEY (log_id, cycle_id, feed_type_id),
  FOREIGN KEY (log_id, cycle_id) REFERENCES Daily_Log(log_id, cycle_id) ON DELETE CASCADE,
  FOREIGN KEY (feed_type_id)     REFERENCES Feed_Type(feed_type_id)     ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- WEAK ENTITY: 1:1 child of Daily_Log
CREATE TABLE Daily_Mortality (
  log_id     INT  NOT NULL,
  cycle_id   INT  NOT NULL,
  dead_count INT  NOT NULL CHECK (dead_count > 0),
  cause      ENUM('Disease','Predator','Trampling','Heat_Stress','Unknown') DEFAULT 'Unknown',
  PRIMARY KEY (log_id, cycle_id),
  FOREIGN KEY (log_id, cycle_id) REFERENCES Daily_Log(log_id, cycle_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Treatment (
  treatment_id   INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id       INT           NOT NULL,
  medicine_id    INT           NOT NULL,
  treatment_date DATE          NOT NULL,
  quantity_used  DECIMAL(10,2) NOT NULL CHECK (quantity_used > 0),
  treatment_type VARCHAR(100),
  administered_by INT          NOT NULL,
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  -- total_cost is derived: quantity_used * medicine.price_per_unit — see Treatment_Details view
  FOREIGN KEY (cycle_id)        REFERENCES Cycle(cycle_id)              ON DELETE CASCADE,
  FOREIGN KEY (medicine_id)     REFERENCES Medicine(medicine_id)        ON DELETE RESTRICT,
  FOREIGN KEY (administered_by) REFERENCES Farmer_Worker(person_id)     ON DELETE RESTRICT,
  INDEX idx_treatment_cycle_id (cycle_id)
) ENGINE=InnoDB AUTO_INCREMENT=17000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Vaccination_Schedule (
  schedule_id    INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id       INT  NOT NULL,
  vaccine_id     INT  NOT NULL,
  scheduled_date DATE NOT NULL,
  planned_birds  INT  NOT NULL CHECK (planned_birds > 0),
  status         ENUM('Pending','Completed','Overdue','Failed','Cancelled') DEFAULT 'Pending',
  assigned_worker_id INT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cycle_id)  REFERENCES Cycle(cycle_id)    ON DELETE CASCADE,
  FOREIGN KEY (vaccine_id) REFERENCES Vaccine(vaccine_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_worker_id) REFERENCES Worker(person_id) ON DELETE SET NULL,
  INDEX idx_vacsched_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=18000 DEFAULT CHARSET=utf8mb4;

-- 1:1 with Vaccination_Schedule (UNIQUE on schedule_id)
CREATE TABLE Vaccination_Record (
  record_id        INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id      INT           NOT NULL UNIQUE,
  administered_by  INT           NOT NULL,
  administered_at  DATE          NOT NULL,
  birds_vaccinated INT           NOT NULL CHECK (birds_vaccinated > 0),
  batch_number     VARCHAR(100),
  cost             DECIMAL(10,2) CHECK (cost >= 0),
  notes            TEXT,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id)    REFERENCES Vaccination_Schedule(schedule_id) ON DELETE RESTRICT,
  FOREIGN KEY (administered_by) REFERENCES Worker(person_id)            ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=19000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Expense (
  expense_id   INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id     INT           NOT NULL,
  category     VARCHAR(100),
  category_id  INT,
  description  VARCHAR(255),
  notes        TEXT,
  amount       DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  expense_date DATE          NOT NULL,
  created_by   INT           NOT NULL,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cycle_id)    REFERENCES Cycle(cycle_id)                      ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES Expense_Category(category_id)        ON DELETE RESTRICT,
  FOREIGN KEY (created_by)  REFERENCES Worker(person_id)                    ON DELETE RESTRICT,
  INDEX idx_expense_cycle_id (cycle_id)
) ENGINE=InnoDB AUTO_INCREMENT=21000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Quality_Control (
  qc_id             INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id          INT  NOT NULL,
  inspector_id      INT  NOT NULL,
  inspection_date   DATE NOT NULL,
  inspection_type   VARCHAR(100),
  sample_size       INT  CHECK (sample_size >= 0),
  test_results      TEXT,
  compliance_status ENUM('Pass','Fail') DEFAULT 'Fail',
  corrective_action TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cycle_id)     REFERENCES Cycle(cycle_id)          ON DELETE CASCADE,
  FOREIGN KEY (inspector_id) REFERENCES Technician(person_id)    ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=22000 DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SECTION 4: B2B COMMERCIAL LAYER
-- (Customer comes after Cycle so Sales_Order can FK to both)
-- ============================================================================

CREATE TABLE Customer (
  customer_id        INT AUTO_INCREMENT PRIMARY KEY,
  company_name       VARCHAR(255)   NOT NULL UNIQUE,
  trade_name         VARCHAR(255),
  customer_type      ENUM('Wholesaler','Market','Restaurant','Distributor','Other') NOT NULL,
  phone              VARCHAR(15)    NOT NULL,
  email              VARCHAR(100)   NOT NULL,
  city               VARCHAR(100)   NOT NULL,
  address            VARCHAR(255)   NOT NULL,
  credit_limit       DECIMAL(15,2)  DEFAULT 0 CHECK (credit_limit >= 0),
  payment_terms      VARCHAR(100)   DEFAULT 'Net-30',
  status             ENUM('Active','Inactive','Suspended') DEFAULT 'Active',
  account_manager_id INT,
  created_at         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_manager_id) REFERENCES Manager(person_id) ON DELETE SET NULL,
  INDEX idx_customer_type   (customer_type),
  INDEX idx_customer_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=2000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Contact_Person (
  contact_id  INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT           NOT NULL,
  full_name   VARCHAR(255)  NOT NULL,
  job_title   VARCHAR(100)  NOT NULL,
  phone       VARCHAR(15),
  email       VARCHAR(100),
  is_primary  BOOLEAN       DEFAULT FALSE,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES Customer(customer_id) ON DELETE CASCADE,
  INDEX idx_contact_customer (customer_id)
) ENGINE=InnoDB AUTO_INCREMENT=3000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Sales_Order (
  order_id       INT AUTO_INCREMENT PRIMARY KEY,
  order_number   VARCHAR(50)    UNIQUE NOT NULL,
  customer_id    INT            NOT NULL,
  cycle_id       INT            NOT NULL,
  order_date     DATE           NOT NULL,
  delivery_date  DATE           NOT NULL,
  CONSTRAINT chk_so_delivery CHECK (delivery_date >= order_date),
  birds_qty      INT            NOT NULL CHECK (birds_qty > 0),
  est_weight_kg  DECIMAL(10,2)  CHECK (est_weight_kg > 0),
  price_per_kg   DECIMAL(10,2)  NOT NULL CHECK (price_per_kg > 0),
  total_amount   DECIMAL(12,2)  GENERATED ALWAYS AS (IFNULL(est_weight_kg, 0) * price_per_kg) VIRTUAL,
  status         ENUM('Pending','Confirmed','Ready','Delivered','Cancelled') DEFAULT 'Pending',
  payment_status ENUM('Unpaid','Paid') DEFAULT 'Unpaid',
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES Customer(customer_id) ON DELETE RESTRICT,
  FOREIGN KEY (cycle_id)    REFERENCES Cycle(cycle_id)       ON DELETE RESTRICT,
  INDEX idx_so_customer (customer_id),
  INDEX idx_so_status   (status)
) ENGINE=InnoDB AUTO_INCREMENT=25000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Sale (
  sale_id        INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id       INT            NOT NULL,
  manager_id     INT            NOT NULL,
  customer_id    INT,
  order_id       INT,
  sale_date      DATE           NOT NULL,
  birds_sold     INT            NOT NULL CHECK (birds_sold > 0),
  total_weight_kg DECIMAL(10,2) NOT NULL CHECK (total_weight_kg > 0),
  price_per_kg   DECIMAL(10,2)  NOT NULL CHECK (price_per_kg > 0),
  total_revenue  DECIMAL(12,2)  GENERATED ALWAYS AS (total_weight_kg * price_per_kg) VIRTUAL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cycle_id)    REFERENCES Cycle(cycle_id)           ON DELETE RESTRICT,
  FOREIGN KEY (manager_id)  REFERENCES Manager(person_id)        ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)     ON DELETE SET NULL,
  FOREIGN KEY (order_id)    REFERENCES Sales_Order(order_id)     ON DELETE SET NULL,
  INDEX idx_sale_cycle_id   (cycle_id),
  INDEX idx_sale_manager_id (manager_id),
  INDEX idx_sale_customer   (customer_id),
  INDEX idx_sale_date       (sale_date)
) ENGINE=InnoDB AUTO_INCREMENT=5000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Invoice (
  invoice_id     INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50)    UNIQUE NOT NULL,
  sale_id        INT            NOT NULL,
  customer_id    INT            NOT NULL,
  issue_date     DATE           NOT NULL,
  due_date       DATE           NOT NULL,
  CONSTRAINT chk_inv_due CHECK (due_date >= issue_date),
  amount         DECIMAL(15,2)  NOT NULL CHECK (amount > 0),
  tax_amount     DECIMAL(15,2)  DEFAULT 0 CHECK (tax_amount >= 0),
  status         ENUM('Draft','Sent','Paid','Overdue','Cancelled') DEFAULT 'Draft',
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id)     REFERENCES Sale(sale_id)         ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES Customer(customer_id) ON DELETE RESTRICT,
  INDEX idx_inv_status   (status),
  INDEX idx_inv_customer (customer_id)
) ENGINE=InnoDB AUTO_INCREMENT=6000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Payment (
  payment_id       INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id       INT           NOT NULL,
  payment_date     DATE          NOT NULL,
  amount           DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  method           ENUM('Bank_Transfer','Check','Cash','Credit_Card','Other') NOT NULL,
  reference_number VARCHAR(100),
  notes            TEXT,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES Invoice(invoice_id) ON DELETE RESTRICT,
  INDEX idx_payment_invoice (invoice_id)
) ENGINE=InnoDB AUTO_INCREMENT=7000 DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SECTION 5: EQUIPMENT & MAINTENANCE
-- ============================================================================

CREATE TABLE Device_Type (
  type_id    INT AUTO_INCREMENT PRIMARY KEY,
  type_name  VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=23000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Device (
  device_id  INT AUTO_INCREMENT PRIMARY KEY,
  device_name VARCHAR(100) NOT NULL,
  type_id    INT  NOT NULL,
  fuel_type  VARCHAR(50),
  status     ENUM('Operational','Maintenance_Due','Faulty','Offline') DEFAULT 'Operational',
  shed_id    INT,
  storage_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (type_id)    REFERENCES Device_Type(type_id)  ON DELETE RESTRICT,
  FOREIGN KEY (shed_id)    REFERENCES Shed(shed_id)          ON DELETE SET NULL,
  FOREIGN KEY (storage_id) REFERENCES Storage(storage_id)   ON DELETE SET NULL,
  INDEX idx_dev_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=24000 DEFAULT CHARSET=utf8mb4;

-- WEAK ENTITY: partial key usage_id, owners Device + Cycle
CREATE TABLE Device_Usage (
  usage_id   INT           NOT NULL AUTO_INCREMENT,
  device_id  INT           NOT NULL,
  cycle_id   INT           NOT NULL,
  usage_date DATE          NOT NULL,
  hours      DECIMAL(5,2)  NOT NULL CHECK (hours > 0),
  cost       DECIMAL(10,2)          CHECK (cost >= 0),
  PRIMARY KEY (usage_id, device_id, cycle_id),
  FOREIGN KEY (device_id) REFERENCES Device(device_id) ON DELETE CASCADE,
  FOREIGN KEY (cycle_id)  REFERENCES Cycle(cycle_id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Maintains (
  maintenance_id       INT AUTO_INCREMENT PRIMARY KEY,
  person_id            INT      NOT NULL,
  device_id            INT      NOT NULL,
  maintenance_datetime DATETIME NOT NULL,
  description          TEXT,
  status               ENUM('Pending','In_Progress','Completed') DEFAULT 'Pending',
  cost                 DECIMAL(10,2) DEFAULT 0 CHECK (cost >= 0),
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id)  REFERENCES Technician(person_id) ON DELETE RESTRICT,
  FOREIGN KEY (device_id)  REFERENCES Device(device_id)     ON DELETE CASCADE,
  INDEX idx_maint_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=25000 DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SECTION 6: HR & TRAINING
-- ============================================================================

CREATE TABLE Attendance (
  attendance_id  INT AUTO_INCREMENT PRIMARY KEY,
  person_id      INT  NOT NULL,
  work_date      DATE NOT NULL,
  check_in       TIME,
  check_out      TIME,
  check_in_time  TIME AS (check_in) VIRTUAL,
  check_out_time TIME AS (check_out) VIRTUAL,
  status         ENUM('Present','Absent','Late','On_Leave') DEFAULT 'Present',
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_attendance_times CHECK (
    check_out IS NULL OR check_in IS NULL OR check_out >= check_in
  ),
  FOREIGN KEY (person_id) REFERENCES Worker(person_id) ON DELETE CASCADE,
  UNIQUE KEY uk_attendance (person_id, work_date)
) ENGINE=InnoDB AUTO_INCREMENT=26000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Payroll (
  payroll_id      INT AUTO_INCREMENT PRIMARY KEY,
  person_id       INT           NOT NULL,
  payment_date    DATE          NOT NULL,
  period_start    DATE,
  period_end      DATE,
  basic_salary    DECIMAL(10,2) NOT NULL CHECK (basic_salary >= 0),
  overtime_hours  DECIMAL(5,2)  DEFAULT 0 CHECK (overtime_hours >= 0),
  overtime_amount DECIMAL(10,2) DEFAULT 0 CHECK (overtime_amount >= 0),
  bonuses         DECIMAL(10,2) DEFAULT 0 CHECK (bonuses >= 0),
  deductions      DECIMAL(10,2) DEFAULT 0 CHECK (deductions >= 0),
  net_amount      DECIMAL(10,2) NOT NULL,
  status          ENUM('Pending','Paid','Cancelled') DEFAULT 'Pending',
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES Worker(person_id) ON DELETE CASCADE,
  UNIQUE KEY uk_payroll_unique (person_id, payment_date)
) ENGINE=InnoDB AUTO_INCREMENT=27000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Performance_Review (
  review_id         INT AUTO_INCREMENT PRIMARY KEY,
  person_id         INT          NOT NULL,
  reviewer_id       INT          NOT NULL,
  review_date       DATE         NOT NULL,
  score             DECIMAL(5,2) CHECK (score BETWEEN 0 AND 10),
  performance_score DECIMAL(5,2) CHECK (performance_score BETWEEN 0 AND 10),
  attendance_score  DECIMAL(5,2) CHECK (attendance_score  BETWEEN 0 AND 10),
  quality_score     DECIMAL(5,2) CHECK (quality_score     BETWEEN 0 AND 10),
  teamwork_score    DECIMAL(5,2) CHECK (teamwork_score    BETWEEN 0 AND 10),
  overall_score     DECIMAL(5,2) GENERATED ALWAYS AS (
                    (IFNULL(performance_score,0) + IFNULL(attendance_score,0) + IFNULL(quality_score,0) + IFNULL(teamwork_score,0)) / 4
                    ) VIRTUAL,
  comments          TEXT,
  next_review_date  DATE,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_pr_next_date CHECK (next_review_date IS NULL OR next_review_date > review_date),
  FOREIGN KEY (person_id)   REFERENCES Worker(person_id)  ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES Manager(person_id) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=28000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Training (
  training_id      INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(255)  NOT NULL,
  description      TEXT,
  trainer          VARCHAR(255),
  scheduled_date   DATE,
  duration_hours   INT           CHECK (duration_hours > 0),
  start_date       DATE,
  end_date         DATE,
  location         VARCHAR(255),
  max_participants INT           CHECK (max_participants > 0),
  cost             DECIMAL(10,2) CHECK (cost >= 0),
  status           ENUM('Planned','Scheduled','In_Progress','Completed','Cancelled') DEFAULT 'Planned',
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=29000 DEFAULT CHARSET=utf8mb4;

CREATE TABLE Training_Enrollment (
  enrollment_id     INT AUTO_INCREMENT PRIMARY KEY,
  training_id       INT          NOT NULL,
  person_id         INT          NOT NULL,
  enrollment_date   DATE         DEFAULT (CURRENT_DATE),
  status            ENUM('Enrolled','In_Progress','Completed','Cancelled') DEFAULT 'Enrolled',
  score             DECIMAL(5,2) CHECK (score BETWEEN 0 AND 100),
  certificate_issued BOOLEAN     DEFAULT FALSE,
  certificate_url   VARCHAR(255),
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment (training_id, person_id),
  FOREIGN KEY (training_id) REFERENCES Training(training_id) ON DELETE CASCADE,
  FOREIGN KEY (person_id)   REFERENCES Worker(person_id)     ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=30000 DEFAULT CHARSET=utf8mb4;

-- Table Assigned_To was already defined earlier.


-- ============================================================================
-- SECTION 7: AUDIT
-- ============================================================================

CREATE TABLE Audit_Log (
  audit_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  person_id   INT,
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(100),
  details     TEXT,
  entity_type VARCHAR(100),
  entity_id   INT,
  old_values  JSON,
  new_values  JSON,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES Worker(person_id) ON DELETE SET NULL,
  INDEX idx_audit_action     (action),
  INDEX idx_audit_created_at (created_at)
) ENGINE=InnoDB AUTO_INCREMENT=1000000 DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DELIMITER $$

-- T0: One active cycle per shed
CREATE TRIGGER before_insert_cycle
BEFORE INSERT ON Cycle FOR EACH ROW
BEGIN
  DECLARE v_count INT;
  SELECT COUNT(*) INTO v_count
    FROM Cycle
    WHERE shed_id = NEW.shed_id AND cycle_status = 'Active';
  IF v_count > 0 AND NEW.cycle_status = 'Active' THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'This shed already has an active cycle';
  END IF;
END $$

-- T1: Daily_Log date within cycle period, cycle must be Active
CREATE TRIGGER before_insert_daily_log
BEFORE INSERT ON Daily_Log FOR EACH ROW
BEGIN
  DECLARE v_start  DATE;
  DECLARE v_end    DATE;
  DECLARE v_status ENUM('Active','Closed','Aborted');
  SELECT start_date, end_date, cycle_status
    INTO v_start, v_end, v_status
    FROM Cycle WHERE cycle_id = NEW.cycle_id;
  IF v_status != 'Active' THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot add logs to a non-Active cycle';
  END IF;
  IF NEW.log_date < v_start OR (v_end IS NOT NULL AND NEW.log_date > v_end) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Daily_Log date must be within cycle date range';
  END IF;
END $$

-- T2: Treatment date within cycle period, cycle must be Active
CREATE TRIGGER before_insert_treatment
BEFORE INSERT ON Treatment FOR EACH ROW
BEGIN
  DECLARE v_start  DATE;
  DECLARE v_end    DATE;
  DECLARE v_status ENUM('Active','Closed','Aborted');
  SELECT start_date, end_date, cycle_status
    INTO v_start, v_end, v_status
    FROM Cycle WHERE cycle_id = NEW.cycle_id;
  IF v_status != 'Active' THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot add treatments to a non-Active cycle';
  END IF;
  IF NEW.treatment_date < v_start OR (v_end IS NOT NULL AND NEW.treatment_date > v_end) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Treatment date must be within cycle date range';
  END IF;
END $$

-- T3: Vaccination cannot be administered before scheduled date
CREATE TRIGGER before_insert_vaccination_record
BEFORE INSERT ON Vaccination_Record FOR EACH ROW
BEGIN
  DECLARE v_scheduled DATE;
  SELECT scheduled_date INTO v_scheduled
    FROM Vaccination_Schedule WHERE schedule_id = NEW.schedule_id;
  IF NEW.administered_at < v_scheduled THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Vaccination cannot be administered before scheduled date';
  END IF;
END $$

-- T4: Mark vaccination schedule Completed when record is inserted
CREATE TRIGGER after_insert_vaccination_record
AFTER INSERT ON Vaccination_Record FOR EACH ROW
BEGIN
  UPDATE Vaccination_Schedule
    SET status = 'Completed'
    WHERE schedule_id = NEW.schedule_id;
END $$

-- T5: Performance review date between hire_date and today
CREATE TRIGGER before_insert_performance_review
BEFORE INSERT ON Performance_Review FOR EACH ROW
BEGIN
  DECLARE v_hire DATE;
  SELECT hire_date INTO v_hire FROM Worker WHERE person_id = NEW.person_id;
  IF NEW.review_date < v_hire OR NEW.review_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Review date must be between hire date and today';
  END IF;
END $$

-- T6: Expense date within cycle period, cycle must be Active
CREATE TRIGGER before_insert_expense
BEFORE INSERT ON Expense FOR EACH ROW
BEGIN
  DECLARE v_start  DATE;
  DECLARE v_end    DATE;
  DECLARE v_status ENUM('Active','Closed','Aborted');
  SELECT start_date, end_date, cycle_status
    INTO v_start, v_end, v_status
    FROM Cycle WHERE cycle_id = NEW.cycle_id;
  IF v_status != 'Active' THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot add expenses to a non-Active cycle';
  END IF;
  IF NEW.expense_date < v_start OR (v_end IS NOT NULL AND NEW.expense_date > v_end) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Expense date must be within cycle date range';
  END IF;
END $$

-- T7: Deduct medicine stock with pre-check
CREATE TRIGGER trg_deduct_medicine_stock
AFTER INSERT ON Treatment FOR EACH ROW
BEGIN
  DECLARE v_available DECIMAL(12,2) DEFAULT 0;
  SELECT IFNULL(SUM(quantity), 0) INTO v_available
    FROM Medicine_Stock WHERE medicine_id = NEW.medicine_id;
  IF v_available < NEW.quantity_used THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Insufficient medicine stock for this treatment';
  END IF;
  UPDATE Medicine_Stock
    SET quantity = quantity - NEW.quantity_used
    WHERE medicine_id = NEW.medicine_id AND quantity >= NEW.quantity_used
    ORDER BY expiry_date ASC LIMIT 1;
END $$

-- T8: Deduct feed stock with pre-check
CREATE TRIGGER trg_deduct_feed_stock
AFTER INSERT ON Daily_Feed FOR EACH ROW
BEGIN
  DECLARE v_available DECIMAL(12,2) DEFAULT 0;
  SELECT IFNULL(SUM(quantity), 0) INTO v_available
    FROM Feed_Stock WHERE feed_type_id = NEW.feed_type_id;
  IF v_available < NEW.quantity THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Insufficient feed stock for this entry';
  END IF;
  UPDATE Feed_Stock
    SET quantity = quantity - NEW.quantity
    WHERE feed_type_id = NEW.feed_type_id AND quantity >= NEW.quantity
    ORDER BY expiry_date ASC LIMIT 1;
END $$

-- T9: Deduct vaccine stock with pre-check
CREATE TRIGGER trg_deduct_vaccine_stock
AFTER INSERT ON Vaccination_Record FOR EACH ROW
BEGIN
  DECLARE v_available INT DEFAULT 0;
  DECLARE v_vaccine_id INT;
  SELECT vaccine_id INTO v_vaccine_id
    FROM Vaccination_Schedule WHERE schedule_id = NEW.schedule_id;
  SELECT IFNULL(SUM(doses_available), 0) INTO v_available
    FROM Vaccine_Stock WHERE vaccine_id = v_vaccine_id;
  IF v_available < NEW.birds_vaccinated THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Insufficient vaccine doses for this record';
  END IF;
  UPDATE Vaccine_Stock
    SET doses_available = doses_available - NEW.birds_vaccinated
    WHERE vaccine_id = v_vaccine_id AND doses_available >= NEW.birds_vaccinated
    ORDER BY expiry_date ASC LIMIT 1;
END $$

-- T10: Prevent selling more birds than are alive
CREATE TRIGGER before_insert_sale
BEFORE INSERT ON Sale FOR EACH ROW
BEGIN
  DECLARE v_living INT;
  SELECT (c.initial_chicks
    - COALESCE((SELECT SUM(dm.dead_count)
                FROM Daily_Log dl
                JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
                WHERE dl.cycle_id = NEW.cycle_id), 0)
    - COALESCE((SELECT SUM(birds_sold) FROM Sale WHERE cycle_id = NEW.cycle_id), 0))
    INTO v_living
    FROM Cycle c WHERE c.cycle_id = NEW.cycle_id;
  IF NEW.birds_sold > v_living THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot sell more birds than are currently alive';
  END IF;
END $$

-- T11: Prevent mortality count exceeding living flock
CREATE TRIGGER before_insert_mortality
BEFORE INSERT ON Daily_Mortality FOR EACH ROW
BEGIN
  DECLARE v_living INT;
  SELECT (c.initial_chicks
    - COALESCE((SELECT SUM(dm2.dead_count)
                FROM Daily_Log dl2
                JOIN Daily_Mortality dm2 ON dl2.log_id = dm2.log_id AND dl2.cycle_id = dm2.cycle_id
                WHERE dl2.cycle_id = NEW.cycle_id), 0)
    - COALESCE((SELECT SUM(birds_sold) FROM Sale WHERE cycle_id = NEW.cycle_id), 0))
    INTO v_living
    FROM Daily_Log dl
    JOIN Cycle c ON c.cycle_id = NEW.cycle_id
    WHERE dl.log_id = NEW.log_id AND dl.cycle_id = NEW.cycle_id
    LIMIT 1;
  IF NEW.dead_count > v_living THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Mortality count exceeds remaining living birds';
  END IF;
END $$

-- T12: Auto-close cycle when all birds sold
CREATE TRIGGER after_insert_sale_autoclose
AFTER INSERT ON Sale FOR EACH ROW
BEGIN
  DECLARE v_living INT;
  SELECT (c.initial_chicks
    - COALESCE((SELECT SUM(dm.dead_count)
                FROM Daily_Log dl
                JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
                WHERE dl.cycle_id = NEW.cycle_id), 0)
    - COALESCE((SELECT SUM(birds_sold) FROM Sale WHERE cycle_id = NEW.cycle_id), 0))
    INTO v_living
    FROM Cycle c WHERE c.cycle_id = NEW.cycle_id;
  IF v_living <= 0 THEN
    UPDATE Cycle SET cycle_status = 'Closed', end_date = NEW.sale_date
      WHERE cycle_id = NEW.cycle_id AND cycle_status = 'Active';
  END IF;
END $$

-- T13: Auto-close cycle when mortality wipes flock
CREATE TRIGGER after_insert_mortality_autoclose
AFTER INSERT ON Daily_Mortality FOR EACH ROW
BEGIN
  DECLARE v_living INT;
  DECLARE v_log_date DATE;
  SELECT log_date INTO v_log_date
    FROM Daily_Log WHERE log_id = NEW.log_id AND cycle_id = NEW.cycle_id;
  SELECT (c.initial_chicks
    - COALESCE((SELECT SUM(dm2.dead_count)
                FROM Daily_Log dl2
                JOIN Daily_Mortality dm2 ON dl2.log_id = dm2.log_id AND dl2.cycle_id = dm2.cycle_id
                WHERE dl2.cycle_id = NEW.cycle_id), 0)
    - COALESCE((SELECT SUM(birds_sold) FROM Sale WHERE cycle_id = NEW.cycle_id), 0))
    INTO v_living
    FROM Cycle c WHERE c.cycle_id = NEW.cycle_id;
  IF v_living <= 0 THEN
    UPDATE Cycle SET cycle_status = 'Closed', end_date = v_log_date
      WHERE cycle_id = NEW.cycle_id AND cycle_status = 'Active';
  END IF;
END $$

-- T14: Validate Sale order_id belongs to same cycle and customer
CREATE TRIGGER before_insert_sale_order_check
BEFORE INSERT ON Sale FOR EACH ROW
BEGIN
  DECLARE v_order_cycle    INT;
  DECLARE v_order_customer INT;
  IF NEW.order_id IS NOT NULL THEN
    SELECT cycle_id, customer_id INTO v_order_cycle, v_order_customer
      FROM Sales_Order WHERE order_id = NEW.order_id;
    IF v_order_cycle != NEW.cycle_id THEN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Sale order_id does not belong to the same cycle';
    END IF;
    IF NEW.customer_id IS NOT NULL AND v_order_customer != NEW.customer_id THEN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Sale customer does not match the Sales_Order customer';
    END IF;
  END IF;
END $$

-- T15: Mark Sales_Order Delivered when a linked Sale is inserted
CREATE TRIGGER after_insert_sale_update_order
AFTER INSERT ON Sale FOR EACH ROW
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    UPDATE Sales_Order
      SET status = 'Delivered', payment_status = 'Paid'
      WHERE order_id = NEW.order_id;
  END IF;
END $$

DELIMITER ;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- V1: Worker details with subclass info
CREATE VIEW v_worker_details AS
SELECT w.person_id, w.FName, w.LName, w.email, w.job_title, w.hire_date, w.worker_type,
  CASE
    WHEN w.worker_type = 'Manager'       THEN m.contract_type
    WHEN w.worker_type = 'Farmer_Worker' THEN fw.assigned_area
    WHEN w.worker_type = 'Technician'    THEN t.specialization
  END AS subclass_detail
FROM Worker w
LEFT JOIN Manager       m  ON w.person_id = m.person_id
LEFT JOIN Farmer_Worker fw ON w.person_id = fw.person_id
LEFT JOIN Technician    t  ON w.person_id = t.person_id;

-- V2: Customer financial summary
CREATE VIEW v_customer_financial_summary AS
SELECT
  c.customer_id, c.company_name, c.customer_type,
  COALESCE(SUM(i.amount + i.tax_amount), 0) AS total_invoiced,
  COALESCE(SUM(p.amount), 0)                AS total_paid,
  COALESCE(SUM(i.amount + i.tax_amount), 0)
    - COALESCE(SUM(p.amount), 0)            AS outstanding_balance
FROM Customer c
LEFT JOIN Invoice i ON c.customer_id = i.customer_id
LEFT JOIN Payment p ON i.invoice_id  = p.invoice_id
GROUP BY c.customer_id, c.company_name, c.customer_type;

-- V3: Real-time cycle status (living birds, mortality rate, days elapsed)
CREATE VIEW v_cycle_status AS
SELECT
  c.cycle_id, c.breed_id, c.shed_id, c.initial_chicks, c.cycle_status, c.start_date,
  b.breed_name,
  s.shed_name,
  COALESCE(SUM(dm.dead_count), 0) AS total_mortality,
  c.initial_chicks - COALESCE(SUM(dm.dead_count), 0) AS living_birds,
  ROUND(COALESCE(SUM(dm.dead_count) / c.initial_chicks * 100, 0), 2) AS mortality_rate,
  DATEDIFF(CURDATE(), c.start_date) AS days_active
FROM Cycle c
JOIN Breed b ON c.breed_id = b.breed_id
JOIN Shed s ON c.shed_id = s.shed_id
LEFT JOIN Daily_Log       dl ON c.cycle_id  = dl.cycle_id
LEFT JOIN Daily_Mortality dm ON dl.log_id   = dm.log_id AND dl.cycle_id = dm.cycle_id
GROUP BY c.cycle_id, c.breed_id, c.shed_id, c.initial_chicks, c.cycle_status, c.start_date, b.breed_name, s.shed_name;

-- V4: Living birds per cycle (subtracts both deaths AND sold birds)
CREATE VIEW Cycle_Living_Birds AS
SELECT c.cycle_id, c.initial_chicks,
  COALESCE((SELECT SUM(dm.dead_count)
            FROM Daily_Log dl
            JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
            WHERE dl.cycle_id = c.cycle_id), 0) AS total_dead,
  (c.initial_chicks
    - COALESCE((SELECT SUM(dm.dead_count)
                FROM Daily_Log dl
                JOIN Daily_Mortality dm ON dl.log_id = dm.log_id AND dl.cycle_id = dm.cycle_id
                WHERE dl.cycle_id = c.cycle_id), 0)
    - COALESCE((SELECT SUM(birds_sold) FROM Sale WHERE cycle_id = c.cycle_id), 0)
  ) AS living_birds
FROM Cycle c;

-- V5: Total feed cost per cycle
CREATE VIEW Cycle_Feed_Cost AS
SELECT cycle_id, COALESCE(SUM(quantity * price), 0) AS total_feed_cost
FROM Daily_Feed GROUP BY cycle_id;

-- V6: Full P&L per cycle (chick cost included)
CREATE VIEW Cycle_Profit AS
SELECT c.cycle_id,
  COALESCE((SELECT SUM(total_revenue) FROM Sale WHERE cycle_id = c.cycle_id), 0) AS total_revenue,
  ((c.initial_chicks * c.chick_price_per_unit)
   + COALESCE((SELECT SUM(amount) FROM Expense WHERE cycle_id = c.cycle_id), 0)
   + COALESCE((SELECT SUM(quantity * price) FROM Daily_Feed WHERE cycle_id = c.cycle_id), 0)
   + COALESCE((SELECT SUM(t.quantity_used * m.price_per_unit)
               FROM Treatment t JOIN Medicine m ON t.medicine_id = m.medicine_id
               WHERE t.cycle_id = c.cycle_id), 0)
  ) AS total_expenses,
  (COALESCE((SELECT SUM(total_revenue) FROM Sale WHERE cycle_id = c.cycle_id), 0)
   - ((c.initial_chicks * c.chick_price_per_unit)
      + COALESCE((SELECT SUM(amount) FROM Expense WHERE cycle_id = c.cycle_id), 0)
      + COALESCE((SELECT SUM(quantity * price) FROM Daily_Feed WHERE cycle_id = c.cycle_id), 0)
      + COALESCE((SELECT SUM(t.quantity_used * m.price_per_unit)
                  FROM Treatment t JOIN Medicine m ON t.medicine_id = m.medicine_id
                  WHERE t.cycle_id = c.cycle_id), 0))
  ) AS net_profit
FROM Cycle c;

-- V7: Inventory status across feed, medicine, and vaccine stock
CREATE VIEW Inventory_Status AS
SELECT 'Feed' AS item_type, ft.name AS item_name, fs.quantity, fs.reorder_level,
  CASE WHEN fs.quantity <= 0               THEN 'OUT'
       WHEN fs.quantity <= fs.reorder_level THEN 'LOW'
       ELSE 'OK' END AS stock_status
FROM Feed_Stock fs JOIN Feed_Type ft ON fs.feed_type_id = ft.feed_type_id
UNION ALL
SELECT 'Medicine', m.medicine_name, CAST(ms.quantity AS DECIMAL(10,2)), ms.reorder_level,
  CASE WHEN ms.quantity <= 0               THEN 'OUT'
       WHEN ms.quantity <= ms.reorder_level THEN 'LOW'
       ELSE 'OK' END
FROM Medicine_Stock ms JOIN Medicine m ON ms.medicine_id = m.medicine_id
UNION ALL
SELECT 'Vaccine', v.vaccine_name, CAST(vs.doses_available AS DECIMAL(10,2)), 100,
  CASE WHEN vs.doses_available <= 0   THEN 'OUT'
       WHEN vs.doses_available <= 100 THEN 'LOW'
       ELSE 'OK' END
FROM Vaccine_Stock vs JOIN Vaccine v ON vs.vaccine_id = v.vaccine_id;

-- V8: Treatment details with computed cost (total_cost derived in view, not stored)
CREATE VIEW Treatment_Details AS
SELECT t.treatment_id, t.cycle_id, m.medicine_name, t.treatment_date,
  t.quantity_used, t.treatment_type, t.administered_by,
  w.FName AS administered_by_fname, w.LName AS administered_by_lname,
  (t.quantity_used * m.price_per_unit) AS total_cost
FROM Treatment t
JOIN Medicine m ON t.medicine_id    = m.medicine_id
JOIN Worker w ON t.administered_by = w.person_id;

-- V9: Worker attendance summary (correct present/late vs absent counts)
CREATE VIEW Worker_Attendance_Summary AS
SELECT w.person_id, w.FName, w.LName,
  COUNT(a.attendance_id)                                                   AS total_records,
  SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)         AS days_present,
  SUM(CASE WHEN a.status = 'Late'   THEN 1 ELSE 0 END)                    AS days_late,
  SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END)                    AS days_absent,
  ROUND(SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)
    * 100.0 / NULLIF(COUNT(a.attendance_id), 0), 1)                       AS attendance_rate_pct
FROM Worker w
LEFT JOIN Attendance a ON w.person_id = a.person_id
GROUP BY w.person_id, w.FName, w.LName;

-- V10: Payroll summary per worker
CREATE VIEW Worker_Payroll_Summary AS
SELECT w.person_id, w.FName, w.LName,
  COUNT(p.payroll_id)                                                       AS total_payments,
  COALESCE(SUM(p.basic_salary + p.overtime_amount + p.bonuses - p.deductions), 0) AS total_paid_to_date,
  MAX(p.payment_date)                                                       AS last_payment_date,
  COALESCE(AVG(p.bonuses), 0)                                               AS avg_bonus
FROM Worker w
LEFT JOIN Payroll p ON w.person_id = p.person_id
GROUP BY w.person_id, w.FName, w.LName;

-- ============================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX idx_invoice_customer_date   ON Invoice(customer_id, issue_date);
CREATE INDEX idx_sale_cycle_manager      ON Sale(cycle_id, manager_id);
CREATE INDEX idx_daily_log_cycle_date    ON Daily_Log(cycle_id, log_date);
CREATE INDEX idx_cycle_status_shed       ON Cycle(cycle_status, shed_id);
CREATE INDEX idx_attendance_worker_date  ON Attendance(person_id, work_date);
CREATE INDEX idx_payroll_worker_date     ON Payroll(person_id, payment_date);
CREATE INDEX idx_treatment_cycle_date    ON Treatment(cycle_id, treatment_date);
CREATE INDEX idx_expense_cycle_date      ON Expense(cycle_id, expense_date);
CREATE INDEX idx_vacsched_cycle_date     ON Vaccination_Schedule(cycle_id, scheduled_date);

SELECT 'Smart Poultry Farm v5.0 Schema Created Successfully!' AS status;