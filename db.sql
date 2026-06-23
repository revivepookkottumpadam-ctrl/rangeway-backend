-- Schema Setup for Rangeway Job Cards database (Neon DB/PostgreSQL)

CREATE TABLE IF NOT EXISTS job_cards (
    id SERIAL PRIMARY KEY,
    jc_no VARCHAR(50) NOT NULL UNIQUE,
    reg_no VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    service_type VARCHAR(100),
    engine_no VARCHAR(100),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name VARCHAR(150) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    mobile VARCHAR(20) NOT NULL,
    customer_demands TEXT,
    action_taken TEXT,
    -- Products JSONB holds array of products: [{ code, particulars, qty, rate, amount }]
    products JSONB NOT NULL DEFAULT '[]',
    -- Labour JSONB holds array of labour lines: [{ particulars, qty, rate, amount }]
    labour JSONB NOT NULL DEFAULT '[]',
    estimate_service_charge DECIMAL(10, 2) DEFAULT 0.00,
    tax DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    grand_total DECIMAL(10, 2) DEFAULT 0.00,
    advisor_name VARCHAR(150),
    service_advise TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for searching commonly searched fields
CREATE INDEX IF NOT EXISTS idx_job_cards_jc_no ON job_cards(jc_no);
CREATE INDEX IF NOT EXISTS idx_job_cards_reg_no ON job_cards(reg_no);
CREATE INDEX IF NOT EXISTS idx_job_cards_customer_name ON job_cards(customer_name);
CREATE INDEX IF NOT EXISTS idx_job_cards_mobile ON job_cards(mobile);
