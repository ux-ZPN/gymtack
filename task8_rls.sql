-- Disable all existing to be clean
DROP POLICY IF EXISTS "public can insert members" ON members;
DROP POLICY IF EXISTS "public can read members" ON members;
DROP POLICY IF EXISTS "public can insert attendance" ON attendance;
DROP POLICY IF EXISTS "public can read attendance" ON attendance;
DROP POLICY IF EXISTS "owner manage members" ON members;
DROP POLICY IF EXISTS "owner manage attendance" ON attendance;
DROP POLICY IF EXISTS "owner manage memberships" ON memberships;

-- Re-enable RLS on the tables we turned off earlier
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- 1. PUBLIC (ANON) POLICIES for QR Scanning
-- Allow phones to insert new members and log check-ins.
CREATE POLICY "public can insert members" ON members FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public can read members" ON members FOR SELECT TO anon USING (true);

CREATE POLICY "public can insert attendance" ON attendance FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public can read attendance" ON attendance FOR SELECT TO anon USING (true);

-- 2. SECURE OWNER POLICIES
-- Only allow owners to view, edit, or delete members/check-ins/memberships that belong to THEIR specific gym.
CREATE POLICY "owner manage members" ON members FOR ALL TO authenticated USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));
CREATE POLICY "owner manage attendance" ON attendance FOR ALL TO authenticated USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));
CREATE POLICY "owner manage memberships" ON memberships FOR ALL TO authenticated USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));
