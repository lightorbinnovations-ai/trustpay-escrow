-- Migration to drop legacy status check constraint that blocks new lifecycle
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_status_check;
