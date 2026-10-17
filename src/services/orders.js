import { supabase } from './supabase';

// ============ ORDINI ============

export const getAllOrders = async () => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        job_number,
        staccato_number,
        starting_department_id,
        current_department_id,
        created_by,
        scarti,
        note,
        status,
        close_date,
        created_at,
        updated_at,
        current_dept:current_department_id(id, name),
        starting_dept:starting_department_id(id, name),
        creator:created_by(id, username, full_name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore recupero ordini:', error.message);
    throw error;
  }
};

export const getOrderByNumber = async (orderNumber) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        job_number,
        staccato_number,
        starting_department_id,
        current_department_id,
        created_by,
        scarti,
        note,
        status,
        close_date,
        created_at,
        updated_at,
        current_dept:current_department_id(id, name),
        starting_dept:starting_department_id(id, name),
        creator:created_by(id, username, full_name)
      `
      )
      .eq('order_number', orderNumber)
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore recupero ordine:', error.message);
    throw error;
  }
};

export const createOrder = async (orderNumber, staccatoNumber, jobNumber, startingDeptId, createdById) => {
  try {
    const newOrderData = [
      {
        order_number: orderNumber || null,
        staccato_number: staccatoNumber || null,
        job_number: jobNumber || null,
        starting_department_id: startingDeptId,
        current_department_id: startingDeptId,
        created_by: createdById,
        scarti: 0,
        note: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const { data, error } = await supabase
      .from('orders')
      .insert(newOrderData)
      .select();

    if (error) {
      console.error('Errore creazione ordine:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('Errore: nessun record creato nella tabella orders');
    }

    return data[0];
  } catch (error) {
    console.error('Errore completo creazione ordine:', error);
    throw error;
  }
};

export const updateOrderStatus = async (orderId, newStatus) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select();

    if (error) throw error;

    return data[0];
  } catch (error) {
    console.error('Errore aggiornamento ordine:', error.message);
    throw error;
  }
};

export const updateOrderData = async (orderId, scarti, note, closeDate) => {
  try {
    const updatePayload = {
      scarti: scarti || 0,
      note: note || null,
      updated_at: new Date().toISOString(),
    };

    if (closeDate) {
      updatePayload.close_date = closeDate;
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select();

    if (error) throw error;

    return data[0];
  } catch (error) {
    console.error('Errore aggiornamento dati ordine:', error.message);
    throw error;
  }
};

// ============ REPARTI ============

export const getDepartments = async () => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('is_active', true)
      .order('order_position', { ascending: true });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore recupero reparti:', error.message);
    throw error;
  }
};

export const addDepartment = async (name, position) => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .insert([
        {
          name: name,
          order_position: position,
        },
      ])
      .select();

    if (error) throw error;

    return data[0];
  } catch (error) {
    console.error('Errore aggiunta reparto:', error.message);
    throw error;
  }
};

export const deleteDepartment = async (deptId) => {
  try {
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', deptId);

    if (error) throw error;
  } catch (error) {
    console.error('Errore eliminazione reparto:', error.message);
    throw error;
  }
};

// ============ MOVIMENTAZIONI ============

export const moveOrder = async (orderId, fromDeptId, toDeptId, userId, orderData = {}) => {
  try {
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        current_department_id: toDeptId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    const historyData = {
      order_id: orderId,
      order_number: orderData.order_number || null,
      job_number: orderData.job_number || null,
      staccato_number: orderData.staccato_number || null,
      from_department_id: fromDeptId,
      to_department_id: toDeptId,
      moved_by_user_id: userId,
      operation_type: 'avanzamento',
      scarti: orderData.scarti || 0,
      note: orderData.note || null,
      close_date: orderData.close_date || null,
      nc_motivation: orderData.nc_motivation || null,
      moved_by_name: orderData.moved_by_name || null,
      from_department_name: orderData.from_department_name || null,
      to_department_name: orderData.to_department_name || null,
      moved_at: new Date().toISOString(),
    };

    const { error: historyError } = await supabase
      .from('order_history')
      .insert([historyData]);

    if (historyError) throw historyError;

    return true;
  } catch (error) {
    console.error('Errore movimento ordine:', error);
    throw error;
  }
};

export const moveOrderBackward = async (orderId, fromDeptId, toDeptId, userId, note = '', orderData = {}) => {
  try {
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        current_department_id: toDeptId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    const historyData = {
      order_id: orderId,
      order_number: orderData.order_number || null,
      job_number: orderData.job_number || null,
      staccato_number: orderData.staccato_number || null,
      from_department_id: fromDeptId,
      to_department_id: toDeptId,
      moved_by_user_id: userId,
      operation_type: 'retrocessione',
      scarti: orderData.scarti || 0,
      note: note || null,
      close_date: orderData.close_date || null,
      nc_motivation: orderData.nc_motivation || null,
      moved_by_name: orderData.moved_by_name || null,
      from_department_name: orderData.from_department_name || null,
      to_department_name: orderData.to_department_name || null,
      moved_at: new Date().toISOString(),
    };

    const { error: historyError } = await supabase
      .from('order_history')
      .insert([historyData]);

    if (historyError) throw historyError;

    return true;
  } catch (error) {
    console.error('Errore retrocessione ordine:', error);
    throw error;
  }
};

// ============ CRONOLOGIA ============

export const getOrderHistory = async (orderId) => {
  try {
    const { data, error } = await supabase
      .from('order_history')
      .select(
        `
        id,
        order_id,
        order_number,
        job_number,
        staccato_number,
        from_department_id,
        to_department_id,
        moved_by_user_id,
        operation_type,
        scarti,
        note,
        close_date,
        nc_motivation,
        moved_at,
        from_dept:from_department_id(id, name),
        to_dept:to_department_id(id, name),
        user:moved_by_user_id(id, username, full_name)
      `
      )
      .eq('order_id', orderId)
      .order('moved_at', { ascending: false });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore recupero cronologia:', error.message);
    throw error;
  }
};

export const getRecentHistory = async (limit = 50) => {
  try {
    const { data, error } = await supabase
      .from('order_history')
      .select(
        `
        id,
        order_id,
        order_number,
        job_number,
        staccato_number,
        from_department_id,
        to_department_id,
        moved_by_user_id,
        operation_type,
        scarti,
        note,
        close_date,
        nc_motivation,
        moved_at,
        order:orders (
          order_number,
          job_number,
          staccato_number
        ),
        from_dept:from_department_id(id, name),
        to_dept:to_department_id(id, name),
        user:moved_by_user_id(id, username, full_name)
      `
      )
      .order('moved_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore recupero cronologia recente:', error.message);
    throw error;
  }
};

export const searchOrder = async (searchTerm) => {
  try {
    const upperSearchTerm = searchTerm.toUpperCase();

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        job_number,
        staccato_number,
        starting_department_id,
        current_department_id,
        created_by,
        scarti,
        note,
        status,
        close_date,
        created_at,
        updated_at,
        current_dept:current_department_id(id, name),
        starting_dept:starting_department_id(id, name),
        creator:created_by(id, username, full_name)
      `
      )
      .or(
        `order_number.eq.${upperSearchTerm},job_number.eq.${upperSearchTerm},staccato_number.eq.${upperSearchTerm}`
      );

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore ricerca ordine:', error.message);
    throw error;
  }
};

export const getOrderWithHistory = async (orderId) => {
  try {
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        job_number,
        staccato_number,
        starting_department_id,
        current_department_id,
        created_by,
        scarti,
        note,
        status,
        close_date,
        created_at,
        updated_at,
        current_dept:current_department_id(id, name),
        starting_dept:starting_department_id(id, name),
        creator:created_by(id, username, full_name)
      `
      )
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    const history = await getOrderHistory(orderId);

    return {
      order: orderData,
      history: history,
    };
  } catch (error) {
    console.error('Errore caricamento ordine con cronologia:', error.message);
    throw error;
  }
};

export const countOrdersInDepartment = async (deptId) => {
  try {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('current_department_id', deptId);

    if (error) throw error;

    return count;
  } catch (error) {
    console.error('Errore conteggio ordini:', error.message);
    throw error;
  }
};

export const getOrdersSummaryByDepartment = async () => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('current_department_id, id');

    if (error) throw error;

    const summary = {};
    data?.forEach((order) => {
      const deptId = order.current_department_id;
      summary[deptId] = (summary[deptId] || 0) + 1;
    });

    return summary;
  } catch (error) {
    console.error('Errore riepilogo ordini:', error.message);
    throw error;
  }
};

// ============ BEM JOB ============

export const getBemByJob = async (jobNumber) => {
  try {
    const { data, error } = await supabase
      .from('bem_job')
      .select(
        `
        id,
        job_number,
        bem_code,
        type,
        created_at,
        operator_id,
        operator:operator_id(id, username, full_name)
      `
      )
      .eq('job_number', jobNumber)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Errore recupero BEM per job:', error.message);
    throw error;
  }
};

export const addBemToJob = async (jobNumber, bemCode, orderId, operatorId, type = 'materiale') => {
  try {
    const { data, error } = await supabase
      .from('bem_job')
      .insert([
        {
          job_number: jobNumber,
          bem_code: bemCode,
          type: type,
          order_id: orderId || null,
          operator_id: operatorId,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore aggiunta BEM a job:', error.message);
    throw error;
  }
};

// ============ BEM FORNO ============

export const getBemFornoHistory = async (bemCode) => {
  try {
    const { data, error } = await supabase
      .from('bem_forno')
      .select(
        `
        id,
        bem_code,
        entry_date,
        exit_date,
        operator_id,
        created_at,
        operator:operator_id(id, username, full_name)
      `
      )
      .eq('bem_code', bemCode)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Errore recupero storico BEM forno:', error.message);
    throw error;
  }
};

export const registerBemFornoEntry = async (bemCode, operatorId) => {
  try {
    const { data, error } = await supabase
      .from('bem_forno')
      .insert([
        {
          bem_code: bemCode,
          entry_date: new Date().toISOString(),
          exit_date: null,
          operator_id: operatorId,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore registrazione ingresso BEM forno:', error.message);
    throw error;
  }
};

export const registerBemFornoExit = async (fornoEntryId, operatorId) => {
  try {
    const { data, error } = await supabase
      .from('bem_forno')
      .update({
        exit_date: new Date().toISOString(),
        operator_id: operatorId,
      })
      .eq('id', fornoEntryId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Errore registrazione uscita BEM forno:', error.message);
    throw error;
  }
};

export const getBemFornoActiveEntries = async () => {
  try {
    const { data, error } = await supabase
      .from('bem_forno')
      .select(
        `
        id,
        bem_code,
        entry_date,
        exit_date,
        operator_id,
        operator:operator_id(id, username, full_name)
      `
      )
      .is('exit_date', null)
      .order('entry_date', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Errore recupero BEM in forno:', error.message);
    throw error;
  }
};
