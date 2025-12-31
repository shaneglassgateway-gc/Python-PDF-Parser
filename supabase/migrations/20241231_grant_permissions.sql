-- Grant permissions for estimates table
GRANT SELECT ON estimates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON estimates TO authenticated;

-- Grant permissions for material_prices table
GRANT SELECT ON material_prices TO anon;
GRANT SELECT ON material_prices TO authenticated;

-- Grant permissions for labor_rates table
GRANT SELECT ON labor_rates TO anon;
GRANT SELECT ON labor_rates TO authenticated;

-- Grant permissions for material_order_rules table
GRANT SELECT ON material_order_rules TO anon;
GRANT SELECT ON material_order_rules TO authenticated;

-- Grant permissions for uploaded_files table
GRANT SELECT ON uploaded_files TO anon;
GRANT SELECT, INSERT, DELETE ON uploaded_files TO authenticated;

-- Check current permissions
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
AND grantee IN ('anon', 'authenticated') 
ORDER BY table_name, grantee;