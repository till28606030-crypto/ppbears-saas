-- Search for and delete any Option Groups related to "Step 6" or "Photo Repair"

-- 1. Identify and delete groups where name contains "修復" (Repair) or "Photo"
--    OR where uiConfig specifies step 6.
-- Note: We use a safe transaction to ensure data integrity

BEGIN;

-- Log what we are about to delete (for confirmation if running interactively, though here we just delete)
-- In a real console, you might want to SELECT first.

DELETE FROM option_groups
WHERE name LIKE '%修復%' 
   OR name LIKE '%Repair%'
   OR (uiConfig->>'step')::int = 6;

-- 2. Delete orphaned option_items (items that point to a non-existent parent)
--    This cleans up items that belonged to the deleted groups above.
DELETE FROM option_items
WHERE "parentId" NOT IN (SELECT id FROM option_groups);

COMMIT;

-- 3. Verification Query (Run this to check if anything remains)
SELECT * FROM option_groups 
WHERE name LIKE '%修復%' 
   OR name LIKE '%Repair%'
   OR (uiConfig->>'step')::int = 6;
