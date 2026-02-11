from fastapi import APIRouter, HTTPException, Depends, Path
from pydantic import BaseModel
from supabase import Client
from services.supabase_client import get_supabase_client
from models import DeleteImageRequest

router = APIRouter()

@router.post("/{product_id}/delete-image")
async def delete_product_image(
    product_id: str = Path(..., description="Product ID"),
    request: DeleteImageRequest = None,
    supabase: Client = Depends(get_supabase_client)
):
    """刪除產品圖片 (Base or Mask)"""
    try:
        if not request:
            raise HTTPException(status_code=400, detail="Missing request body")
            
        target = request.target
        print(f"[Product] Deleting image for product {product_id}, target: {target}")

        # 1. Fetch Product
        response = supabase.table("products").select("base_image, mask_image, specs").eq("id", product_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Product not found")
        
        product = response.data
        updates = {}
        paths_to_delete = []

        def extract_storage_path(url: str):
            if not url: return None
            buckets = ['models', 'products', 'design-assets', 'design-previews']
            for bucket in buckets:
                delimiter = f"/storage/v1/object/public/{bucket}/"
                if delimiter in url:
                    return {"bucket": bucket, "path": url.split(delimiter)[1]}
            return None

        if target in ['base', 'all']:
            if product.get('base_image'):
                info = extract_storage_path(product['base_image'])
                if info: paths_to_delete.append(info)
            updates['base_image'] = None
            
            # Handle Specs
            if product.get('specs'):
                specs = product['specs'].copy()
                specs.pop('base_image', None)
                specs.pop('base_image_path', None)
                updates['specs'] = specs

        if target in ['mask', 'all']:
            if product.get('mask_image'):
                info = extract_storage_path(product['mask_image'])
                if info: paths_to_delete.append(info)
            updates['mask_image'] = None

            # Handle Specs
            if product.get('specs'):
                # Check if specs already copied
                specs = updates.get('specs', product['specs'].copy())
                specs.pop('mask_image', None)
                specs.pop('mask_image_path', None)
                updates['specs'] = specs

        # 2. Update DB
        update_response = supabase.table("products").update(updates).eq("id", product_id).execute()
        
        # 3. Delete from Storage
        storage_errors = []
        for item in paths_to_delete:
            try:
                res = supabase.storage.from_(item['bucket']).remove([item['path']])
                # Supabase storage remove doesn't throw usually, but returns list of deleted files?
                # Python client might differ.
            except Exception as se:
                print(f"[Storage] Error deleting {item['path']}: {se}")
                storage_errors.append(str(se))

        return {
            "success": True, 
            "message": "Images deleted successfully", 
            "storage_errors": storage_errors if storage_errors else None
        }

    except Exception as e:
        print(f"[Product] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
