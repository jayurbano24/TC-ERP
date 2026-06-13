-- Migration: 018_accessory_fields
ALTER TABLE public.accessories
ADD COLUMN IF NOT EXISTS characteristics TEXT,
ADD COLUMN IF NOT EXISTS comments TEXT;
