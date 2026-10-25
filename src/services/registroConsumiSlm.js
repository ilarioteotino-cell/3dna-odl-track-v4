import { supabase } from './supabase';

const ENTRY_TABLE = 'registro_consumi_slm_entries';
const REGISTRY_VIEW = 'registro_consumi_slm';

export const getSlmPrinters = async () => {
  const { data, error } = await supabase
    .from('technology_printers')
    .select('printer')
    .eq('technology', 'SLM')
    .order('printer', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => row.printer);
};

export const getSlmRegistry = async () => {
  const { data, error } = await supabase
    .from(REGISTRY_VIEW)
    .select('*')
    .order('launch_date', { ascending: false, nullsFirst: false })
    .order('last_modified_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getSlmRecordByJob = async (jobNumber) => {
  const { data, error } = await supabase
    .from(REGISTRY_VIEW)
    .select('*')
    .eq('job_number', jobNumber)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

export const getSlmHistoryByJob = async (jobNumber) => {
  const { data, error } = await supabase
    .from(ENTRY_TABLE)
    .select('*')
    .eq('job_number', jobNumber)
    .order('saved_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const addSlmRecordVersion = async (entry) => {
  const { data, error } = await supabase
    .from(ENTRY_TABLE)
    .insert([entry])
    .select()
    .single();

  if (error) throw error;
  return data;
};

