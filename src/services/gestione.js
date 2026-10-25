import { supabase } from './supabase';

// ============================================================
// v4.0 - Gestione NC / BEM / Chiusura Ordini
// ============================================================

const COLUMN_MAP = {
  ODL: 'order_number',
  JOB: 'job_number',
  STACCATO: 'staccato_number',
};

// Trova l'ordine in base a tipo + codice (ODL/JOB/STACCATO)
export const findOrderByItem = async (itemType, itemCode) => {
  const column = COLUMN_MAP[itemType];
  if (!column) return null;

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, job_number, staccato_number, current_department_id, starting_department_id, close_date, status, current_dept:current_department_id(id, name)'
    )
    .eq(column, itemCode)
    .maybeSingle();

  if (error) throw error;
  return data;
};

// Crea l'ordine se non esiste (stesso comportamento di Traccia Ordine)
export const ensureOrder = async (itemType, itemCode, userId, startingDeptId) => {
  let order = await findOrderByItem(itemType, itemCode);
  if (order) return order;

  const newOrderData = {
    order_number: itemType === 'ODL' ? itemCode : null,
    job_number: itemType === 'JOB' ? itemCode : null,
    staccato_number: itemType === 'STACCATO' ? itemCode : null,
    starting_department_id: startingDeptId || null,
    current_department_id: startingDeptId || null,
    created_by: userId,
    scarti: 0,
    note: null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('orders')
    .insert([newOrderData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ============ NC ============

export const addNC = async ({
  orderId,
  itemType,
  itemCode,
  insertedBy,
  insertedByName,
  entries,
}) => {
  const payload = entries.map((entry) => ({
    order_id: orderId,
    item_type: itemType,
    item_code: itemCode,
    inserted_by: insertedBy,
    inserted_by_name: insertedByName,
    nc_code: entry.ncCode || null,
    causa: entry.causa || null,
    quantita_nc: parseInt(entry.quantita, 10),
    note: entry.note || null,
  }));

  const { data, error } = await supabase
    .from('gest_nc')
    .insert(payload)
    .select();

  if (error) throw error;
  return data;
};

export const disposeNC = async ({
  id,
  disposedBy,
  disposedByName,
  dispositionType,
  dispositionNote,
}) => {
  const { data, error } = await supabase
    .from('gest_nc')
    .update({
      disposizione_tipo: dispositionType,
      disposizione_nota: dispositionNote || null,
      disposizione_by: disposedBy,
      disposizione_by_name: disposedByName,
    })
    .eq('id', id)
    .is('disposizione_at', null)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Questa NC è già stata disposizionata. Aggiorna lo storico.');
  return data;
};

export const getNCByItem = async (itemType, itemCode) => {
  const { data, error } = await supabase
    .from('gest_nc')
    .select('*')
    .eq('item_type', itemType)
    .eq('item_code', itemCode)
    .order('nc_number', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getNCByOrder = async (orderId) => {
  const { data, error } = await supabase
    .from('gest_nc')
    .select('*')
    .eq('order_id', orderId)
    .order('nc_number', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getRecentNC = async (limit = 100) => {
  const { data, error } = await supabase
    .from('gest_nc')
    .select('*')
    .order('inserted_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

// ============ BEM ============

export const addBEM = async ({
  orderId,
  itemType,
  itemCode,
  insertedBy,
  insertedByName,
  note,
  bemList,
  tipoList,
}) => {
  const payload = {
    order_id: orderId,
    item_type: itemType,
    item_code: itemCode,
    inserted_by: insertedBy,
    inserted_by_name: insertedByName,
    note: note || null,
  };

  for (let i = 0; i < 5; i++) {
    payload[`bem${i + 1}`] = bemList[i] || null;
    payload[`tipo${i + 1}`] = tipoList[i] || null;
  }

  const { data, error } = await supabase
    .from('gest_bem')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getBEMByItem = async (itemType, itemCode) => {
  const { data, error } = await supabase
    .from('gest_bem')
    .select('*')
    .eq('item_type', itemType)
    .eq('item_code', itemCode)
    .order('inserted_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getRecentBEM = async (limit = 100) => {
  const { data, error } = await supabase
    .from('gest_bem')
    .select('*')
    .order('inserted_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

// ============ CHIUSURA ORDINE ============

export const closeOrder = async ({
  orderId,
  itemType,
  itemCode,
  closeDate,
  insertedBy,
  insertedByName,
  note,
}) => {
  const { data, error } = await supabase
    .from('gest_chiusura')
    .insert([
      {
        order_id: orderId,
        item_type: itemType,
        item_code: itemCode,
        close_date: closeDate,
        inserted_by: insertedBy,
        inserted_by_name: insertedByName,
        note: note || null,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  if (orderId) {
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        close_date: closeDate,
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) throw updateError;
  }

  return data;
};

export const getChiusureByItem = async (itemType, itemCode) => {
  const { data, error } = await supabase
    .from('gest_chiusura')
    .select('*')
    .eq('item_type', itemType)
    .eq('item_code', itemCode)
    .order('inserted_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getRecentChiusure = async (limit = 100) => {
  const { data, error } = await supabase
    .from('gest_chiusura')
    .select('*')
    .order('inserted_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

