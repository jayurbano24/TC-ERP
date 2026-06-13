-- Migration: 019_accessory_box_seq
CREATE SEQUENCE IF NOT EXISTS accessory_box_seq START 1;

CREATE OR REPLACE FUNCTION get_next_recovery_order()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_val integer;
BEGIN
    SELECT nextval('accessory_box_seq') INTO next_val;
    RETURN 'REC-ACC-' || lpad(next_val::text, 6, '0');
END;
$$;
