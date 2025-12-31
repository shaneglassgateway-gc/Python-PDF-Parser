-- Create estimates table
CREATE TABLE estimates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_address TEXT NOT NULL,
    project_type VARCHAR(100) NOT NULL,
    notes TEXT,
    eagleview_data JSONB,
    roof_measurements JSONB,
    material_costs JSONB,
    labor_costs JSONB,
    total_material_cost DECIMAL(10,2),
    total_labor_cost DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    profit_margin DECIMAL(5,2) DEFAULT 0.20,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create material_prices table
CREATE TABLE material_prices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    unit_of_measure VARCHAR(50) NOT NULL,
    price_per_unit DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    supplier VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create labor_rates table
CREATE TABLE labor_rates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    condition_type VARCHAR(100) NOT NULL,
    description TEXT,
    rate_per_square DECIMAL(10,2),
    rate_per_linear_foot DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create material_order_rules table
CREATE TABLE material_order_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    material_name VARCHAR(255) NOT NULL,
    unit_of_measure VARCHAR(50) NOT NULL,
    quantity_formula VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create uploaded_files table for storing EagleView PDFs
CREATE TABLE uploaded_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_estimates_user_id ON estimates(user_id);
CREATE INDEX idx_estimates_created_at ON estimates(created_at DESC);
CREATE INDEX idx_estimates_status ON estimates(status);
CREATE INDEX idx_material_prices_category ON material_prices(category);
CREATE INDEX idx_material_prices_active ON material_prices(is_active);
CREATE INDEX idx_labor_rates_active ON labor_rates(is_active);
CREATE INDEX idx_uploaded_files_user_id ON uploaded_files(user_id);

-- Insert default material prices from Material Price Sheet
INSERT INTO material_prices (item_name, unit_of_measure, price_per_unit, category, supplier) VALUES
('TAMKO Proline™ Titan XT™ Premium Architectural Shingles', 'BDL', 35.32, 'Shingles', 'TAMKO'),
('TAMKO 12-1/4" x 12" Hip and Ridge Shingles (Antique Slate)', 'BDL', 55.12, 'Hip & Ridge', 'TAMKO'),
('TRI-BUILT OmniRidge® Pro Shingle Over Ridge Vent with Filter & Nails', 'PC', 8.75, 'Ridge Vent', 'TRI-BUILT'),
('TRI-BUILT Synthetic Roofing Underlayment', 'RL', 75.00, 'Underlayment', 'TRI-BUILT'),
('TRI-BUILT Shingle Starter', 'BDL', 41.87, 'Starter', 'TRI-BUILT'),
('TRI-BUILT Aluminum Style "SR" Roof Edge with Hems', 'PC', 6.75, 'Drip Edge', 'TRI-BUILT'),
('TRI-BUILT Sand Surface Self-Adhering Ice & Water Underlayment', 'RL', 94.60, 'Ice & Water', 'TRI-BUILT'),
('TRI-BUILT Coil Roofing Nails', 'CTN', 60.75, 'Nails', 'TRI-BUILT'),
('TRI-BUILT Staples', 'BX', 6.25, 'Staples', 'TRI-BUILT'),
('TRI-BUILT High Performance Elastomeric Sealant - 10.1 Oz. Tube', 'TB', 8.50, 'Caulk', 'TRI-BUILT'),
('FlashMaster 32" Chimney Flashing Kit', 'EA', 93.34, 'Flashing', 'FlashMaster'),
('TRI-BUILT SA Plybase', 'RL', 145.00, 'Low Pitch', 'TRI-BUILT'),
('TRI-BUILT SA Cap Sheet', 'RL', 122.00, 'Low Pitch', 'TRI-BUILT'),
('Mayco Industries Lead Boot with 12" x 12" x 14" Base', 'EA', 30.00, 'Flashing', 'Mayco Industries'),
('TRI-BUILT Multicap Vent Cap', 'PC', 39.50, 'Vent Cap', 'TRI-BUILT'),
('TRI-BUILT 750-S Aluminum Slant Back Roof Louver with Screen', 'PC', 22.58, 'Ventilation', 'TRI-BUILT');

-- Insert default labor rates from Labor Pricing Sheet
INSERT INTO labor_rates (condition_type, description, rate_per_square, rate_per_linear_foot) VALUES
('Standard Install', 'Standard roof installation', 95.00, NULL),
('No Trailer Access', 'No trailer access upcharge', 20.00, NULL),
('Second Story', 'Second story upcharge', 20.00, NULL),
('Third Story', 'Third story upcharge', 40.00, NULL),
('2nd Layer', 'Second layer of shingles removal', 30.00, NULL),
('Hand Load Materials', 'Hand load materials upcharge', 20.00, NULL),
('High Pitch 8/12', '8/12 pitch upcharge', 20.00, NULL),
('High Pitch 9/12', '9/12 pitch upcharge', 30.00, NULL),
('High Pitch 10/12', '10/12 pitch upcharge', 40.00, NULL),
('High Pitch 11/12', '11/12 pitch upcharge', 50.00, NULL),
('High Pitch 12/12+', '12/12 or greater pitch upcharge', 60.00, NULL),
('Ridge Vent Install', 'Ridge vent installation', NULL, 25.00),
('Mansard Install', 'Mansard roof installation', 350.00, NULL),
('Excess Weight Dump', 'Excess weight dump fee >30SQ', 750.00, NULL);

-- Insert default material order rules from Material Order Rules
INSERT INTO material_order_rules (material_name, unit_of_measure, quantity_formula, description, category) VALUES
('TAMKO Proline™ Titan XT™ Premium Architectural Shingles', 'BDL', 'roof_area_sq / 3', '3 BDL Shingles/SQ', 'Shingles'),
('TAMKO 12-1/4" x 12" Hip and Ridge Shingles', 'BDL', 'hip_ridge_lf / 30', '1 BDL Hip & Ridge/30LF of Hips and Ridges', 'Hip & Ridge'),
('TRI-BUILT OmniRidge® Pro Shingle Over Ridge Vent', 'PC', 'ridge_lf / 4', '1 PC Ridge Vent/4LF of Ridges', 'Ridge Vent'),
('TRI-BUILT Synthetic Roofing Underlayment', 'RL', 'roof_area_sq / 10', '1 RL Synthetic Felt/10SQ', 'Underlayment'),
('TRI-BUILT Shingle Starter', 'BDL', '(eaves_lf + rakes_lf) / 100', '1 BDL Asphalt Starter/100LF of Eaves+Rakes', 'Starter'),
('TRI-BUILT Aluminum Style "SR" Roof Edge', 'PC', '(eaves_lf + rakes_lf) / 10', '1 PC Drip Edge/10LF of Eaves+Rakes', 'Drip Edge'),
('TRI-BUILT Sand Surface Self-Adhering Ice & Water', 'RL', 'valleys_lf / 66', '1 RL Ice & Water/66LF of valleys', 'Ice & Water'),
('TRI-BUILT Coil Roofing Nails', 'CTN', 'roof_area_sq / 15', '1 BX Roofing Nails/15SQ', 'Nails'),
('TRI-BUILT Staples', 'BX', 'roof_area_sq / 10', '1 CTN Roofing Staples/10SQ', 'Staples'),
('TRI-BUILT High Performance Elastomeric Sealant', 'TB', 'roof_area_sq / 15', '1 TB Roofing Caulk/15SQ', 'Caulk'),
('TRI-BUILT SA Plybase', 'RL', 'low_pitch_area_sq', '1 RL Plybase/1SQ of roof area at or under 2 pitch', 'Low Pitch'),
('TRI-BUILT SA Cap Sheet', 'RL', 'low_pitch_area_sq / 2', '1 RL Plycap/2SQ of roof area at or under 2 Pitch', 'Low Pitch');

-- Enable Row Level Security (RLS)
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_order_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Estimates: Users can only see their own estimates
CREATE POLICY "Users can view own estimates" ON estimates
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own estimates" ON estimates
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own estimates" ON estimates
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own estimates" ON estimates
    FOR DELETE USING (auth.uid() = user_id);

-- Material prices: All authenticated users can read
CREATE POLICY "Authenticated users can read material prices" ON material_prices
    FOR SELECT USING (auth.role() = 'authenticated');

-- Labor rates: All authenticated users can read
CREATE POLICY "Authenticated users can read labor rates" ON labor_rates
    FOR SELECT USING (auth.role() = 'authenticated');

-- Material order rules: All authenticated users can read
CREATE POLICY "Authenticated users can read material order rules" ON material_order_rules
    FOR SELECT USING (auth.role() = 'authenticated');

-- Uploaded files: Users can only see their own files
CREATE POLICY "Users can view own files" ON uploaded_files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own files" ON uploaded_files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own files" ON uploaded_files
    FOR DELETE USING (auth.uid() = user_id);