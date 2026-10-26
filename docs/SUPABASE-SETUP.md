# Keep your data with Supabase

1. supabase.com -> New project (pick a region, set a database password and save it).
2. Project -> Connect -> "Session pooler" -> copy the connection string; replace [YOUR-PASSWORD].
3. Render -> your service -> Environment -> add DATABASE_URL = that string -> Save.
4. Deploy. The log should show: "Connected to Supabase (PostgreSQL)". Tables are created automatically in a private
   schema called "safemesh" with Row Level Security on (not reachable from Supabase's public API).
5. Create the accounts once. They now survive redeploys and restarts.

Note: uploaded evidence files are still stored on the server disk (data/uploads) and are lost on a redeploy
until they are moved to Supabase Storage or a persistent disk.
