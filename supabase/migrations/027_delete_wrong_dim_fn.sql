-- ============================================================
-- Migration 027: Add helper RPC to delete wrong-dimension chunks
-- Called automatically by prepare route on dimension mismatch
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_wrong_dim_chunks()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.legal_document_chunks
  WHERE embedding IS NOT NULL
    AND vector_dims(embedding) != 768;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % wrong-dimension chunks', deleted_count;
  RETURN deleted_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_wrong_dim_chunks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_wrong_dim_chunks() TO service_role;

-- Test it
SELECT public.delete_wrong_dim_chunks() AS deleted_wrong_dim_chunks;
