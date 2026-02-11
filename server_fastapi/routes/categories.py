from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from uuid import UUID
from supabase import Client
from services.supabase_client import get_supabase_client
from models import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryReorderRequest

router = APIRouter()

def _norm_name(name: str) -> str:
    return (name or "").strip()

async def _get_siblings(supabase: Client, parent_id: Optional[str]):
    q = supabase.table("product_categories").select("id,name,sort_order,parent_id,layer_level")
    if parent_id is None:
        q = q.is_("parent_id", "null")
    else:
        q = q.eq("parent_id", parent_id)
    return q.execute().data or []

@router.get("/", response_model=List[CategoryResponse])
async def get_categories(supabase: Client = Depends(get_supabase_client)):
    """獲取所有類別 (Flat List)"""
    try:
        response = (
            supabase.table("product_categories")
            .select("*")
            .order("parent_id")
            .order("sort_order")
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, supabase: Client = Depends(get_supabase_client)):
    """創建新類別"""
    try:
        name = _norm_name(category.name)
        if not name:
            raise HTTPException(status_code=400, detail="Invalid name")

        parent_id = category.parent_id
        siblings = await _get_siblings(supabase, parent_id)
        if any((s.get("name") or "").strip().lower() == name.lower() for s in siblings):
            raise HTTPException(status_code=400, detail="Duplicate category name under same parent")

        sort_order = category.sort_order
        if sort_order is None:
            max_sort = max([(s.get("sort_order") or 0) for s in siblings], default=0)
            sort_order = max_sort + 1

        layer_level = category.layer_level
        if layer_level is None:
            if parent_id:
                parent = supabase.table("product_categories").select("layer_level").eq("id", parent_id).single().execute().data
                if not parent:
                    raise HTTPException(status_code=400, detail="Parent not found")
                layer_level = (parent.get("layer_level") or 1) + 1
            else:
                layer_level = 1

        data = {
            "name": name,
            "parent_id": parent_id,
            "sort_order": sort_order,
            "layer_level": layer_level,
        }
        response = supabase.table("product_categories").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=400, detail="Create failed")
        return response.data[0]
    except Exception as e:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/reorder")
async def reorder_categories(payload: CategoryReorderRequest, supabase: Client = Depends(get_supabase_client)):
    """更新同一 parent 下的排序"""
    try:
        parent_id = payload.parent_id
        ordered_ids = [str(x) for x in payload.ordered_ids if str(x).strip()]
        if not ordered_ids:
            raise HTTPException(status_code=400, detail="ordered_ids required")

        siblings = await _get_siblings(supabase, parent_id)
        sibling_ids = set([str(s.get("id")) for s in siblings])
        if not set(ordered_ids).issubset(sibling_ids):
            raise HTTPException(status_code=400, detail="ordered_ids contains non-sibling ids")

        for idx, cid in enumerate(ordered_ids):
            supabase.table("product_categories").update({"sort_order": idx + 1}).eq("id", cid).execute()

        return {"success": True}
    except HTTPException:
        raise
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: UUID, category: CategoryUpdate, supabase: Client = Depends(get_supabase_client)):
    """更新類別"""
    try:
        data = category.model_dump(exclude_unset=True)
        response = supabase.table("product_categories").update(data).eq("id", str(category_id)).execute()
        if "name" in data:
            name = _norm_name(data["name"])
            if not name:
                raise HTTPException(status_code=400, detail="Invalid name")
            data["name"] = name

        if "parent_id" in data or "name" in data:
            current = supabase.table("product_categories").select("id,name,parent_id,layer_level").eq("id", str(category_id)).single().execute().data
            if not current:
                raise HTTPException(status_code=404, detail="Category not found")
            parent_id = data.get("parent_id", current.get("parent_id"))
            name = data.get("name", current.get("name"))
            siblings = await _get_siblings(supabase, parent_id)
            if any(str(s.get("id")) != str(category_id) and (s.get("name") or "").strip().lower() == (name or "").strip().lower() for s in siblings):
                raise HTTPException(status_code=400, detail="Duplicate category name under same parent")

            if "parent_id" in data:
                if parent_id:
                    parent = supabase.table("product_categories").select("layer_level").eq("id", parent_id).single().execute().data
                    if not parent:
                        raise HTTPException(status_code=400, detail="Parent not found")
                    data["layer_level"] = (parent.get("layer_level") or 1) + 1
                else:
                    data["layer_level"] = 1

        if not response.data:
            raise HTTPException(status_code=404, detail="Category not found")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{category_id}")
async def delete_category(category_id: UUID, supabase: Client = Depends(get_supabase_client)):
    """刪除類別 (級聯刪除由 DB 處理)"""
    try:
        # Check specific constraints if needed
        response = supabase.table("product_categories").delete().eq("id", str(category_id)).execute()
        return {"success": True, "message": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
