-- Migration: 021_accessory_boxes_delete
-- Description: Allow DELETE operations on accessory_boxes

CREATE POLICY "Allow authenticated users to delete accessory_boxes"
    ON public.accessory_boxes FOR DELETE
    TO authenticated
    USING (true);
