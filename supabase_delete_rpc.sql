CREATE OR REPLACE FUNCTION delete_custom_designs_admin(design_ids text[])
RETURNS void AS $$
BEGIN
  -- Delete the core designs
  DELETE FROM custom_designs WHERE design_id = ANY(design_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
