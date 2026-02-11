import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Setup Supabase
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
if not key:
    print("Error: Missing SUPABASE_ANON_KEY")
    exit(1)

if not url or not key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)

async def debug_product(product_id):
    print(f"--- Debugging Product: {product_id} ---")
    
    # 1. Fetch Product
    try:
        res = supabase.table("products").select("id, name, specs").eq("id", product_id).execute()
        if not res.data:
            print("Product NOT FOUND")
        else:
            p = res.data[0]
            print(f"Product Name: {p.get('name')}")
            specs = p.get('specs') or {}
            print(f"Specs: {specs}")
            linked = specs.get('linked_option_groups', [])
            print(f"Linked Groups (in specs): {linked}")
            
            # 2. Fetch Option Groups
            print("\n--- All Option Groups ---")
            g_res = supabase.table("option_groups").select("id, name, code").execute()
            groups = g_res.data or []
            
            match_count = 0
            for g in groups:
                gid = str(g['id'])
                is_linked = gid in linked
                if is_linked: match_count += 1
                status = "MATCHED" if is_linked else "       "
                print(f"[{status}] ID: {gid:<5} | Code: {g['code']:<15} | Name: {g['name']}")
            
            print(f"\nTotal Groups in DB: {len(groups)}")
            print(f"Linked Groups Found in DB: {match_count}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # ID from screenshot log: p_1769938794090 (Need to double check screenshot)
    # The screenshot is blurry, let me check the log step 177 text again or infer
    # Screenshot says: [TPL] apply start: p_1769938794090
    pid = "p_1770091816303" # Wait, checking the JSON image at bottom...
    # Bottom image JSON: "id": "p_1770091816303"
    # The console log on right says: p_1769938794090 in one place, but maybe different run?
    # Let's try both or list recent products.
    
    asyncio.run(debug_product("p_1769938794090"))
