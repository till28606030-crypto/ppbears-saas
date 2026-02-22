CREATE OR REPLACE FUNCTION delete_custom_designs_admin(design_ids text[])
RETURNS void AS $$
BEGIN
  -- Delete the provided designs
  DELETE FROM request_logs WHERE design_id = ANY(design_ids);
  DELETE FROM custom_designs WHERE design_id = ANY(design_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
