-- ============================================================
-- 3DnA Production Tracking v4.0 - Setup Database Supabase
-- Esegui questo script nel SQL Editor del NUOVO progetto Supabase v4
-- (il progetto v3.0 resta intatto)
-- ============================================================

-- ======= 1. TABELLA PROFILES (utenti) ======= 
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'admin')),
  approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ======= 2. TABELLA DEPARTMENTS (reparti) ======= 
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  order_position integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ======= 3. TABELLA ORDERS ======= 
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  job_number text,
  staccato_number text,
  starting_department_id uuid REFERENCES departments(id),
  current_department_id uuid REFERENCES departments(id),
  created_by uuid REFERENCES profiles(id),
  scarti integer DEFAULT 0,
  note text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'closed')),
  close_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ======= 4. TABELLA ORDER_HISTORY (v4: + minuti fase) ======= 
CREATE TABLE IF NOT EXISTS order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  order_number text,
  job_number text,
  staccato_number text,
  from_department_id uuid REFERENCES departments(id),
  to_department_id uuid REFERENCES departments(id),
  moved_by_user_id uuid REFERENCES profiles(id),
  operation_type text NOT NULL CHECK (operation_type IN ('avanzamento', 'retrocessione')),
  scarti integer DEFAULT 0,
  note text,
  moved_at timestamptz DEFAULT now(),
  -- denormalizzate
  moved_by_name text,
  from_department_name text,
  to_department_name text,
  close_date date,
  bem_materiale text,
  bem_supporto text,
  nc_number text,
  nc_motivation text,
  -- NUOVO v4.0: minuti impiegati per la fase
  minutes_spent integer
);

-- ======= 5. TABELLA BEM_JOB (BEM associate ai JOB) ======= 
CREATE TABLE IF NOT EXISTS bem_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number text NOT NULL,
  order_id uuid REFERENCES orders(id),
  bem_code text NOT NULL,
  type text DEFAULT 'materiale' CHECK (type IN ('materiale', 'supporto')),
  created_at timestamptz DEFAULT now(),
  operator_id uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_bem_job_job_number ON bem_job(job_number);
CREATE INDEX IF NOT EXISTS idx_bem_job_bem_code ON bem_job(bem_code);

-- ======= 6. TABELLA BEM_FORNO ======= 
CREATE TABLE IF NOT EXISTS bem_forno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bem_code text NOT NULL,
  entry_date timestamptz,
  exit_date timestamptz,
  operator_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bem_forno_bem_code ON bem_forno(bem_code);

-- ============================================================
-- ======= NUOVE TABELLE v4.0 =======
-- ============================================================

-- ======= 7. GESTIONE NC (scarti / non conformità) =======
-- Una riga per ogni inserimento; ogni riga può contenere fino a 5 RAC.
-- Inserimenti multipli per lo stesso ordine sono consentiti (righe diverse,
-- ognuna con la propria data).
CREATE TABLE IF NOT EXISTS gest_nc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  item_type text NOT NULL CHECK (item_type IN ('ODL', 'JOB', 'STACCATO')),
  item_code text NOT NULL,
  inserted_at timestamptz DEFAULT now(),
  inserted_by uuid REFERENCES profiles(id),
  inserted_by_name text,
  note text,
  -- fino a 5 RAC per riga
  rac1 text,
  rac2 text,
  rac3 text,
  rac4 text,
  rac5 text,
  -- causali/ descrizioni collegate alle RAC
  causa1 text,
  causa2 text,
  causa3 text,
  causa4 text,
  causa5 text,
  -- quantità scartate (solo per ODL)
  scarto1 integer,
  scarto2 integer,
  scarto3 integer,
  scarto4 integer,
  scarto5 integer
);

CREATE INDEX IF NOT EXISTS idx_gest_nc_item ON gest_nc(item_type, item_code);
CREATE INDEX IF NOT EXISTS idx_gest_nc_order ON gest_nc(order_id);

-- ======= 8. GESTIONE BEM =======
-- Una riga per ogni inserimento; fino a 5 BEM per riga,
-- ciascuna con la sua tipologia di articolo.
CREATE TABLE IF NOT EXISTS gest_bem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  item_type text NOT NULL CHECK (item_type IN ('ODL', 'JOB', 'STACCATO')),
  item_code text NOT NULL,
  inserted_at timestamptz DEFAULT now(),
  inserted_by uuid REFERENCES profiles(id),
  inserted_by_name text,
  note text,
  -- fino a 5 BEM per riga
  bem1 text,
  bem2 text,
  bem3 text,
  bem4 text,
  bem5 text,
  -- tipologia articolo per ciascuna BEM
  tipo1 text,
  tipo2 text,
  tipo3 text,
  tipo4 text,
  tipo5 text
);

CREATE INDEX IF NOT EXISTS idx_gest_bem_item ON gest_bem(item_type, item_code);
CREATE INDEX IF NOT EXISTS idx_gest_bem_order ON gest_bem(order_id);

-- ======= 9. GESTIONE CHIUSURA ORDINI =======
-- Una riga per ogni dichiarazione di chiusura, con data (default oggi).
CREATE TABLE IF NOT EXISTS gest_chiusura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  item_type text NOT NULL CHECK (item_type IN ('ODL', 'JOB', 'STACCATO')),
  item_code text NOT NULL,
  close_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
  inserted_at timestamptz DEFAULT now(),
  inserted_by uuid REFERENCES profiles(id),
  inserted_by_name text,
  note text
);

CREATE INDEX IF NOT EXISTS idx_gest_chiusura_item ON gest_chiusura(item_type, item_code);
CREATE INDEX IF NOT EXISTS idx_gest_chiusura_order ON gest_chiusura(order_id);

-- ============================================================
-- ======= VISTE (per export CSV) =======
-- ============================================================

CREATE OR REPLACE VIEW order_history_csv_view AS
SELECT
  to_char(oh.moved_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS Data_operazione,
  oh.job_number AS Job,
  oh.order_number AS OdL,
  oh.staccato_number AS Staccato,
  p.full_name AS Operatore,
  oh.operation_type AS Tipo_operazione,
  dep_from.name AS Dal_reparto,
  dep_to.name AS Al_reparto,
  oh.note AS Note_operazione,
  oh.scarti AS Qta_scarti,
  oh.nc_number AS NC,
  oh.nc_motivation AS Causa_NC,
  oh.bem_materiale AS Bem_Materiale,
  oh.bem_supporto AS Bem_Supporto,
  oh.minutes_spent AS Minuti_fase,
  o.close_date AS Data_chiusura_ordine
FROM order_history oh
LEFT JOIN departments dep_from ON oh.from_department_id = dep_from.id
LEFT JOIN departments dep_to ON oh.to_department_id = dep_to.id
LEFT JOIN profiles p ON oh.moved_by_user_id = p.id
LEFT JOIN orders o ON oh.order_id = o.id
ORDER BY oh.moved_at DESC;

CREATE OR REPLACE VIEW bem_job_view AS
SELECT
  bj.job_number,
  bj.bem_code,
  bj.type,
  to_char(bj.created_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
  p.full_name AS operator_name,
  o.order_number,
  o.staccato_number
FROM bem_job bj
LEFT JOIN profiles p ON bj.operator_id = p.id
LEFT JOIN orders o ON bj.order_id = o.id
ORDER BY bj.created_at DESC;

CREATE OR REPLACE VIEW bem_forno_view AS
SELECT
  bf.bem_code,
  to_char(bf.entry_date AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS entry_date,
  to_char(bf.exit_date AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS exit_date,
  p.full_name AS operator_name,
  CASE
    WHEN bf.entry_date IS NOT NULL AND bf.exit_date IS NULL THEN 'in_forno'
    WHEN bf.exit_date IS NOT NULL THEN 'uscito'
    ELSE 'registrato'
  END AS status
FROM bem_forno bf
LEFT JOIN profiles p ON bf.operator_id = p.id
ORDER BY bf.created_at DESC;

-- Vista NC v4.0
CREATE OR REPLACE VIEW gest_nc_view AS
SELECT
  g.id,
  g.item_type,
  g.item_code,
  to_char(g.inserted_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS inserted_at,
  g.inserted_by_name,
  g.note,
  g.rac1, g.rac2, g.rac3, g.rac4, g.rac5,
  g.causa1, g.causa2, g.causa3, g.causa4, g.causa5,
  g.scarto1, g.scarto2, g.scarto3, g.scarto4, g.scarto5
FROM gest_nc g
ORDER BY g.inserted_at DESC;

-- Vista BEM v4.0
CREATE OR REPLACE VIEW gest_bem_view AS
SELECT
  g.id,
  g.item_type,
  g.item_code,
  to_char(g.inserted_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS inserted_at,
  g.inserted_by_name,
  g.note,
  g.bem1, g.bem2, g.bem3, g.bem4, g.bem5,
  g.tipo1, g.tipo2, g.tipo3, g.tipo4, g.tipo5
FROM gest_bem g
ORDER BY g.inserted_at DESC;

-- Vista Chiusure v4.0
CREATE OR REPLACE VIEW gest_chiusura_view AS
SELECT
  g.id,
  g.item_type,
  g.item_code,
  to_char(g.close_date, 'YYYY-MM-DD') AS close_date,
  to_char(g.inserted_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS inserted_at,
  g.inserted_by_name,
  g.note
FROM gest_chiusura g
ORDER BY g.inserted_at DESC;

-- ============================================================
-- ======= ROW LEVEL SECURITY =======
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bem_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE bem_forno ENABLE ROW LEVEL SECURITY;
ALTER TABLE gest_nc ENABLE ROW LEVEL SECURITY;
ALTER TABLE gest_bem ENABLE ROW LEVEL SECURITY;
ALTER TABLE gest_chiusura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profili leggibili da tutti" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Solo admin modifica profili" ON profiles
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Ordini accessibili a tutti" ON orders
  FOR ALL USING (true);

CREATE POLICY "Reparti accessibili a tutti" ON departments
  FOR ALL USING (true);

CREATE POLICY "Storico accessibile a tutti" ON order_history
  FOR ALL USING (true);

CREATE POLICY "BEM Job accessibile a tutti" ON bem_job
  FOR ALL USING (true);

CREATE POLICY "BEM Forno accessibile a tutti" ON bem_forno
  FOR ALL USING (true);

CREATE POLICY "NC accessibile a tutti" ON gest_nc
  FOR ALL USING (true);

CREATE POLICY "BEM gestione accessibile a tutti" ON gest_bem
  FOR ALL USING (true);

CREATE POLICY "Chiusure accessibili a tutti" ON gest_chiusura
  FOR ALL USING (true);

-- ============================================================
-- ======= UTENTE ADMIN INIZIALE =======
-- Password: admin123 (hashala con bcrypt dopo il primo login)
-- ============================================================
INSERT INTO profiles (username, password_hash, full_name, role, approved)
VALUES ('admin', 'admin123', 'Amministratore', 'admin', true)
ON CONFLICT (username) DO NOTHING;
