-- Migration: 020_accessory_box_location
ALTER TABLE public.accessory_boxes ADD COLUMN IF NOT EXISTS location text;
