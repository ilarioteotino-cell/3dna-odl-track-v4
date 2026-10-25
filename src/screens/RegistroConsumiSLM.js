import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUser } from '../services/auth';
import {
  addSlmRecordVersion,
  getSlmHistoryByJob,
  getSlmPrinters,
  getSlmRecordByJob,
  getSlmRegistry,
} from '../services/registroConsumiSlm';

const isWeb = Platform.OS === 'web';
const JOB_REGEX = /^[A-Z][0-9]{6}$/;

const REQUIRED_FIELDS = [
  { key: 'launch_date', label: 'Data lancio Job', kind: 'date' },
  { key: 'powder_recycle_number', label: 'Numero riciclo polvere', kind: 'integer' },
  { key: 'layer_thickness_um', label: 'Spessore layer [µm]', kind: 'decimal' },
  { key: 'job_height_mm', label: 'Altezza Job [mm]', kind: 'decimal' },
  { key: 'job_duration_hr', label: 'Durata Job [hr]', kind: 'decimal' },
  { key: 'job_volume_cc', label: 'Volume totale Job [cc]', kind: 'decimal' },
  { key: 'tank_pre_launch_kg', label: 'QT. TANK PRE-LANCIO [Kg]', kind: 'decimal' },
  { key: 'tank_end_print_kg', label: 'QT. TANK FINE-STAMPA [Kg]', kind: 'decimal' },
  { key: 'tank_post_unpack_kg', label: 'QT. TANK POST-UNPACK [Kg]', kind: 'decimal' },
  { key: 'plate_marked_number', label: 'Numero Piastra stampigliato', kind: 'integerText' },
  { key: 'plate_weight_kg', label: 'Peso Piastra [Kg]', kind: 'decimal' },
  { key: 'plate_height_mm', label: 'Altezza piastra [mm]', kind: 'decimal' },
  { key: 'plate_with_job_weight_kg', label: 'Peso Piastra con Job [Kg]', kind: 'decimal' },
  { key: 'overflow_psv_net_kg', label: 'Peso netto OVERFLOW PSV [Kg]', kind: 'decimal' },
  { key: 'overflow_front_net_kg', label: 'Peso netto OVERFLOW Ant. [Kg]', kind: 'decimal' },
  { key: 'pfm_pre_launch_kg', label: 'QT. PFM PRE-LANCIO [Kg]', kind: 'decimal' },
  { key: 'pfm_end_print_kg', label: 'QT. PFM FINE-STAMPA [Kg]', kind: 'decimal' },
  { key: 'bucket_net_kg', label: 'Peso netto BUCKET [Kg]', kind: 'decimal' },
];

const todayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createEmptyForm = () => ({
  launch_date: todayString(),
  powder_recycle_number: '',
  layer_thickness_um: '',
  job_height_mm: '',
  job_duration_hr: '',
  job_volume_cc: '',
  tank_pre_launch_kg: '',
  tank_end_print_kg: '',
  tank_post_unpack_kg: '',
  plate_marked_number: '',
  plate_weight_kg: '',
  plate_height_mm: '',
  plate_with_job_weight_kg: '',
  overflow_psv_net_kg: '',
  overflow_front_net_kg: '',
  pfm_pre_launch_kg: '',
  pfm_end_print_kg: '',
  bucket_net_kg: '',
  notes: '',
});

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const toFormValue = (value) => (value === null || value === undefined ? '' : String(value));

const formFromRecord = (record) => {
  const form = createEmptyForm();
  REQUIRED_FIELDS.forEach(({ key }) => {
    form[key] = toFormValue(record[key]);
  });
  form.notes = record.notes || '';
  return form;
};

const missingFields = (form) =>
  REQUIRED_FIELDS.filter(({ key, kind }) => {
    const value = String(form[key] ?? '').trim();
    if (!value) return true;
    if (kind === 'date') return !isValidDate(value);
    if (kind === 'integerText') return !/^\d+$/.test(value);
    const number = Number(value.replace(',', '.'));
    if (!Number.isFinite(number) || number < 0) return true;
    if (kind === 'integer' && !Number.isInteger(number)) return true;
    return false;
  });

const sanitizeDecimal = (value) => {
  const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...fraction] = cleaned.split('.');
  return fraction.length ? `${whole}.${fraction.join('')}` : whole;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
};

const displayValue = (value) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

const alertError = (title, message = '') => {
  if (isWeb) alert(`${title}: ${message}`);
  else Alert.alert(title, message);
};

const alertSuccess = (title, message = '') => {
  if (isWeb) alert(`${title}: ${message}`);
  else Alert.alert(title, message);
};

function FormField({ label, value, onChangeText, keyboardType, missing, optional, multiline, placeholder }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, missing && styles.labelMissing]}>
        {label}{optional ? ' · facoltative' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#9AA3AF"
        style={[
          styles.input,
          multiline && styles.textArea,
          missing && styles.inputMissing,
        ]}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {missing ? <Text style={styles.fieldError}>Dato obbligatorio o non valido</Text> : null}
    </View>
  );
}

function WebScanner({ visible, onClose, onScan }) {
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-registro-consumi-slm';

  useEffect(() => {
    if (!isWeb || !visible) return undefined;
    let mounted = true;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted) return;
        const cameras = await Html5Qrcode.getCameras();
        if (!mounted) return;
        if (!cameras?.length) {
          alertError('Errore fotocamera', 'Nessuna fotocamera trovata.');
          onClose();
          return;
        }
        const camera = cameras.find((item) =>
          /back|rear|environment|posteriore/i.test(item.label || '')
        ) || cameras[0];
        scannerRef.current = new Html5Qrcode(containerId);
        await scannerRef.current.start(
          camera.id,
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          async (decodedText) => {
            try {
              if (scannerRef.current) {
                await scannerRef.current.stop();
                await scannerRef.current.clear();
                scannerRef.current = null;
              }
            } catch (error) {
              console.error('Errore chiusura scanner JOB:', error);
            }
            onScan(decodedText);
          },
          () => {}
        );
      } catch (error) {
        console.error('Errore avvio scanner JOB:', error);
        alertError('Errore fotocamera', 'Verifica HTTPS e i permessi del browser.');
        onClose();
      }
    };

    const timeout = setTimeout(startScanner, 250);
    return () => {
      mounted = false;
      clearTimeout(timeout);
      const stopScanner = async () => {
        try {
          if (scannerRef.current) {
            await scannerRef.current.stop();
            await scannerRef.current.clear();
            scannerRef.current = null;
          }
        } catch (error) {
          console.error('Errore cleanup scanner JOB:', error);
        }
      };
      stopScanner();
    };
  }, [visible, onClose, onScan]);

  if (!isWeb || !visible) return null;
  return (
    <View style={styles.scannerBox}>
      <div
        id={containerId}
        style={{ width: '100%', maxWidth: '100%', minHeight: '320px', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}
      />
      <Text style={styles.scannerHint}>Inquadra il QR del JOB</Text>
    </View>
  );
}

export default function RegistroConsumiSLMScreen({ navigation }) {
  const [page, setPage] = useState('form');
  const [currentUser, setCurrentUser] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [printer, setPrinter] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [form, setForm] = useState(createEmptyForm);
  const [loadedJob, setLoadedJob] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [historyJob, setHistoryJob] = useState('');
  const [history, setHistory] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [user, slmPrinters] = await Promise.all([getCurrentUser(), getSlmPrinters()]);
        setCurrentUser(user);
        setPrinters(slmPrinters);
      } catch (error) {
        console.error('Errore caricamento Registro consumi SLM:', error);
        alertError('Errore', error?.message || 'Impossibile caricare stampanti o utente.');
      } finally {
        setInitializing(false);
      }
    };
    loadInitialData();
  }, []);

  const onCloseScanner = useCallback(() => setIsScanning(false), []);

  const handleLoadJob = useCallback(async (providedJob) => {
    const normalizedJob = (providedJob ?? jobNumber).trim().toUpperCase();
    if (!JOB_REGEX.test(normalizedJob)) {
      alertError('Formato JOB non valido', 'Inserisci un JOB con formato: L999999.');
      return;
    }

    setBusy(true);
    try {
      const record = await getSlmRecordByJob(normalizedJob);
      setJobNumber(normalizedJob);
      if (record) {
        setPrinter(record.printer);
        setForm(formFromRecord(record));
        setShowValidation(!(record.is_complete ?? missingFields(formFromRecord(record)).length === 0));
        alertSuccess('JOB già registrato', 'Ho caricato l’ultima versione. Il prossimo salvataggio ne aggiungerà una nuova.');
      } else {
        setForm(createEmptyForm());
        setShowValidation(false);
      }
      setLoadedJob(true);
    } catch (error) {
      console.error('Errore ricerca JOB SLM:', error);
      alertError('Errore', error?.message || 'Impossibile cercare il JOB.');
    } finally {
      setBusy(false);
    }
  }, [jobNumber]);

  const onScan = useCallback((decodedText) => {
    setIsScanning(false);
    const cleaned = decodedText.trim().toUpperCase();
    if (!JOB_REGEX.test(cleaned)) {
      alertError('QR non valido', 'Il codice acquisito non ha il formato previsto per un JOB.');
      return;
    }
    setJobNumber(cleaned);
    handleLoadJob(cleaned);
  }, [handleLoadJob]);

  const handleJobChange = (value) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    setJobNumber(cleaned);
    if (cleaned !== jobNumber) {
      setLoadedJob(false);
      setForm(createEmptyForm());
      setShowValidation(false);
    }
  };

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openRegistry = async () => {
    setPage('registry');
    setBusy(true);
    try {
      setRegistry(await getSlmRegistry());
    } catch (error) {
      console.error('Errore caricamento registro SLM:', error);
      alertError('Errore', error?.message || 'Impossibile caricare il registro.');
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (selectedJob) => {
    setHistoryJob(selectedJob);
    setPage('history');
    setBusy(true);
    try {
      setHistory(await getSlmHistoryByJob(selectedJob));
    } catch (error) {
      console.error('Errore caricamento storico JOB SLM:', error);
      alertError('Errore', error?.message || 'Impossibile caricare lo storico del JOB.');
    } finally {
      setBusy(false);
    }
  };

  const loadRecordIntoForm = (record) => {
    setJobNumber(record.job_number);
    setPrinter(record.printer);
    setForm(formFromRecord(record));
    setLoadedJob(true);
    setShowValidation(missingFields(formFromRecord(record)).length > 0);
    setPage('form');
  };

  const handleNewVersion = async (record) => {
    loadRecordIntoForm(record);
  };

  const handleSave = async () => {
    const normalizedJob = jobNumber.trim().toUpperCase();
    if (!JOB_REGEX.test(normalizedJob)) {
      alertError('JOB mancante', 'Inserisci o scansiona un JOB valido prima di salvare.');
      return;
    }
    if (!loadedJob) {
      alertError('JOB da caricare', 'Premi “Carica JOB” prima di compilare il registro.');
      return;
    }
    if (!printer) {
      setShowValidation(true);
      alertError('Stampante mancante', 'Seleziona la stampante SLM utilizzata.');
      return;
    }
    if (!currentUser?.id) {
      alertError('Utente non disponibile', 'Ricarica la schermata e accedi nuovamente.');
      return;
    }

    const dateValue = String(form.launch_date || '').trim();
    if (dateValue && !isValidDate(dateValue)) {
      setShowValidation(true);
      alertError('Data non valida', 'Inserisci la data nel formato AAAA-MM-GG.');
      return;
    }
    const invalidNumber = REQUIRED_FIELDS.find(({ key, kind }) => {
      const value = String(form[key] ?? '').trim();
      if (!value || kind === 'date' || kind === 'integerText') return false;
      const number = Number(value.replace(',', '.'));
      return !Number.isFinite(number) || number < 0 || (kind === 'integer' && !Number.isInteger(number));
    });
    if (invalidNumber) {
      setShowValidation(true);
      alertError('Valore non valido', `Controlla il campo “${invalidNumber.label}”.`);
      return;
    }

    const plateNumber = String(form.plate_marked_number || '').trim();
    if (plateNumber && !/^\d+$/.test(plateNumber)) {
      setShowValidation(true);
      alertError('Numero piastra non valido', 'Inserisci solo cifre nel numero stampigliato.');
      return;
    }

    const numberValue = (key) => {
      const value = String(form[key] ?? '').trim();
      return value ? Number(value.replace(',', '.')) : null;
    };
    const userLabel = currentUser.full_name || currentUser.username || 'Sconosciuto';
    const payload = {
      job_number: normalizedJob,
      technology: 'SLM',
      printer,
      launch_date: dateValue || null,
      powder_recycle_number: numberValue('powder_recycle_number'),
      layer_thickness_um: numberValue('layer_thickness_um'),
      job_height_mm: numberValue('job_height_mm'),
      job_duration_hr: numberValue('job_duration_hr'),
      job_volume_cc: numberValue('job_volume_cc'),
      tank_pre_launch_kg: numberValue('tank_pre_launch_kg'),
      tank_end_print_kg: numberValue('tank_end_print_kg'),
      tank_post_unpack_kg: numberValue('tank_post_unpack_kg'),
      plate_marked_number: plateNumber || null,
      plate_weight_kg: numberValue('plate_weight_kg'),
      plate_height_mm: numberValue('plate_height_mm'),
      plate_with_job_weight_kg: numberValue('plate_with_job_weight_kg'),
      overflow_psv_net_kg: numberValue('overflow_psv_net_kg'),
      overflow_front_net_kg: numberValue('overflow_front_net_kg'),
      pfm_pre_launch_kg: numberValue('pfm_pre_launch_kg'),
      pfm_end_print_kg: numberValue('pfm_end_print_kg'),
      bucket_net_kg: numberValue('bucket_net_kg'),
      notes: form.notes.trim() || null,
      saved_by: currentUser.id,
      saved_by_name: userLabel,
    };

    setBusy(true);
    try {
      await addSlmRecordVersion(payload);
      const missing = missingFields(form);
      setShowValidation(missing.length > 0);
      alertSuccess(
        missing.length ? 'Versione incompleta salvata' : 'Versione salvata',
        missing.length
          ? `JOB ${normalizedJob} registrato. Campi ancora mancanti: ${missing.length}.`
          : `JOB ${normalizedJob} registrato correttamente.`
      );
    } catch (error) {
      console.error('Errore salvataggio consumi SLM:', error);
      alertError('Errore', error?.message || 'Impossibile salvare il registro.');
    } finally {
      setBusy(false);
    }
  };

  const allMissing = missingFields(form);
  const visibleMissing = showValidation ? allMissing : [];
  const missingKeys = new Set(visibleMissing.map((field) => field.key));
  const visibleMissingLabels = showValidation
    ? [...(!printer ? ['Stampante SLM'] : []), ...visibleMissing.map((field) => field.label)]
    : [];
  const formIsComplete = Boolean(printer) && allMissing.length === 0;

  const renderForm = () => (
    <>
      <TouchableOpacity style={styles.registryLink} onPress={openRegistry} activeOpacity={0.8}>
        <Text style={styles.registryLinkTitle}>Registro per JOB</Text>
        <Text style={styles.registryLinkText}>Apri l’elenco aggiornato e consulta le versioni precedenti →</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, styles.jobSectionTitle]}>JOB</Text>
      <Text style={styles.label}>Numero JOB</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.jobInput}
          value={jobNumber}
          onChangeText={handleJobChange}
          placeholder="Es. J260001"
          placeholderTextColor="#9AA3AF"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
        />
        {isWeb ? (
          <TouchableOpacity style={styles.scanButton} onPress={() => setIsScanning(true)}>
            <Text style={styles.scanButtonText}>QR</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.hint}>Formato: una lettera seguita da 6 cifre</Text>
      <TouchableOpacity style={[styles.secondaryButton, busy && styles.buttonDisabled]} onPress={() => handleLoadJob()} disabled={busy}>
        {busy ? <ActivityIndicator color="#2D6BA8" size="small" /> : <Text style={styles.secondaryButtonText}>Carica JOB</Text>}
      </TouchableOpacity>

      {loadedJob ? (
        <>
          <View style={styles.jobBanner}>
            <View>
              <Text style={styles.jobBannerLabel}>JOB SELEZIONATO</Text>
              <Text style={styles.jobBannerValue}>{jobNumber}</Text>
            </View>
            <View style={[styles.statusBadge, formIsComplete ? styles.statusComplete : styles.statusIncomplete]}>
              <Text style={[styles.statusText, formIsComplete ? styles.statusTextComplete : styles.statusTextIncomplete]}>
                {formIsComplete ? 'COMPLETO' : 'DA COMPLETARE'}
              </Text>
            </View>
          </View>

          {showValidation && visibleMissingLabels.length > 0 ? (
            <View style={styles.missingSummary}>
              <Text style={styles.missingSummaryTitle}>Campi da completare</Text>
              <Text style={styles.missingSummaryText}>{visibleMissingLabels.join(' · ')}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Stampante SLM</Text>
          <Text style={[styles.label, showValidation && !printer && styles.labelMissing]}>Stampante · obbligatoria</Text>
          <View style={[styles.pickerContainer, showValidation && !printer && styles.pickerMissing]}>
            <Picker
              selectedValue={printer}
              onValueChange={(value) => setPrinter(value)}
              style={styles.picker}
            >
              <Picker.Item label="Seleziona stampante SLM" value="" />
              {printers.map((item) => (
                <Picker.Item key={item} label={item} value={item} />
              ))}
            </Picker>
          </View>
          {showValidation && !printer ? <Text style={styles.fieldError}>Seleziona una stampante</Text> : null}

          <Text style={styles.sectionTitle}>Dati di lancio</Text>
          {REQUIRED_FIELDS.map((field) => {
            const keyboardType = field.kind === 'date'
              ? 'numbers-and-punctuation'
              : field.kind === 'integer' || field.kind === 'integerText'
                ? 'number-pad'
                : 'decimal-pad';
            const onChangeText = field.kind === 'date'
              ? (value) => updateField(field.key, value.replace(/[^0-9-]/g, '').slice(0, 10))
              : field.kind === 'integerText' || field.kind === 'integer'
                ? (value) => updateField(field.key, value.replace(/[^0-9]/g, ''))
                : (value) => updateField(field.key, sanitizeDecimal(value));
            return (
              <FormField
                key={field.key}
                label={field.label}
                value={form[field.key]}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
                placeholder={field.kind === 'date' ? 'AAAA-MM-GG' : 'Inserisci un valore numerico'}
                missing={missingKeys.has(field.key)}
              />
            );
          })}

          <FormField
            label="Note"
            value={form.notes}
            onChangeText={(value) => updateField('notes', value)}
            multiline
            optional
            placeholder="Facoltative"
          />

          <TouchableOpacity style={[styles.saveButton, busy && styles.buttonDisabled]} onPress={handleSave} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Salva nuova versione</Text>}
          </TouchableOpacity>
          <Text style={styles.saveHint}>Ogni salvataggio aggiunge una versione nello storico del JOB.</Text>
        </>
      ) : null}
    </>
  );

  const renderRegistry = () => (
    <>
      <View style={styles.pageHeading}>
        <Text style={styles.sectionTitle}>Registro per JOB</Text>
        <Text style={styles.pageDescription}>Una riga per JOB, con i dati dell’ultimo salvataggio. Seleziona “Storico” per consultare le versioni precedenti.</Text>
      </View>
      {busy ? <ActivityIndicator size="large" color="#2D6BA8" style={styles.loader} /> : null}
      {!busy && registry.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>Nessun inserimento presente.</Text></View>
      ) : null}
      {registry.map((record) => {
        const missing = Array.isArray(record.missing_fields) ? record.missing_fields : [];
        const complete = Boolean(record.is_complete);
        return (
          <View key={record.job_number} style={[styles.registryCard, complete ? styles.cardComplete : styles.cardIncomplete]}>
            <View style={styles.registryCardTop}>
              <View>
                <Text style={styles.registryJob}>{record.job_number}</Text>
                <Text style={styles.registryPrinter}>{record.printer}</Text>
              </View>
              <View style={[styles.statusBadge, complete ? styles.statusComplete : styles.statusIncomplete]}>
                <Text style={[styles.statusText, complete ? styles.statusTextComplete : styles.statusTextIncomplete]}>
                  {complete ? 'COMPLETO' : 'INCOMPLETO'}
                </Text>
              </View>
            </View>
            <Text style={styles.registryMeta}>Lancio: {record.launch_date || 'Data mancante'}</Text>
            <Text style={styles.registryMeta}>Ultimo salvataggio: {formatDateTime(record.last_modified_at)} · {record.last_modified_by_name || 'Utente non indicato'}</Text>
            {!complete ? <Text style={styles.missingList}>Mancano: {missing.join(' · ') || 'dati obbligatori'}</Text> : null}
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.cardPrimaryAction} onPress={() => handleNewVersion(record)}>
                <Text style={styles.cardPrimaryActionText}>Apri / nuova versione</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardSecondaryAction} onPress={() => openHistory(record.job_number)}>
                <Text style={styles.cardSecondaryActionText}>Storico</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </>
  );

  const renderHistory = () => (
    <>
      <View style={styles.pageHeading}>
        <Text style={styles.sectionTitle}>Storico · {historyJob}</Text>
        <Text style={styles.pageDescription}>Ogni salvataggio è conservato come versione separata.</Text>
      </View>
      {busy ? <ActivityIndicator size="large" color="#2D6BA8" style={styles.loader} /> : null}
      {!busy && history.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>Nessuna versione precedente.</Text></View>
      ) : null}
      {history.map((record, index) => {
        const missing = missingFields(formFromRecord(record));
        const complete = missing.length === 0;
        return (
          <View key={record.id} style={[styles.historyCard, complete ? styles.cardComplete : styles.cardIncomplete]}>
            <View style={styles.registryCardTop}>
              <View>
                <Text style={styles.registryJob}>Versione {history.length - index}</Text>
                <Text style={styles.registryMeta}>{formatDateTime(record.saved_at)} · {record.saved_by_name}</Text>
              </View>
              <View style={[styles.statusBadge, complete ? styles.statusComplete : styles.statusIncomplete]}>
                <Text style={[styles.statusText, complete ? styles.statusTextComplete : styles.statusTextIncomplete]}>
                  {complete ? 'COMPLETO' : 'INCOMPLETO'}
                </Text>
              </View>
            </View>
            <Text style={styles.registryMeta}>Stampante: {record.printer} · Lancio: {record.launch_date || '—'}</Text>
            {REQUIRED_FIELDS.filter((field) => field.key !== 'launch_date').map((field) => (
              <Text key={field.key} style={styles.historyDataLine}>
                {field.label}: {displayValue(record[field.key])}
              </Text>
            ))}
            {record.notes ? <Text style={styles.historyNotes}>Note: {record.notes}</Text> : null}
            {!complete ? <Text style={styles.missingList}>Mancavano: {missing.map((field) => field.label).join(' · ')}</Text> : null}
            <TouchableOpacity style={styles.cardSecondaryAction} onPress={() => loadRecordIntoForm(record)}>
              <Text style={styles.cardSecondaryActionText}>Carica questa versione nel modulo</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>‹ Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Registro consumi SLM</Text>
        <TouchableOpacity
          onPress={() => {
            if (page === 'form') openRegistry();
            else if (page === 'history') setPage('registry');
            else setPage('form');
          }}
          style={styles.headerButton}
        >
          <Text style={[styles.headerButtonText, styles.headerButtonRight]}>
            {page === 'form' ? 'Registro' : page === 'history' ? 'Registro' : 'Compila'}
          </Text>
        </TouchableOpacity>
      </View>

      {initializing ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#2D6BA8" /></View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {page === 'form' ? renderForm() : null}
            {page === 'registry' ? renderRegistry() : null}
            {page === 'history' ? renderHistory() : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={isScanning} animationType="slide" transparent={false} onRequestClose={onCloseScanner}>
        <SafeAreaView style={styles.scannerModal}>
          <View style={styles.scannerContent}>
            <Text style={styles.scannerTitle}>Scanner QR · JOB</Text>
            <WebScanner visible={isScanning} onClose={onCloseScanner} onScan={onScan} />
            <TouchableOpacity style={styles.closeScannerButton} onPress={onCloseScanner}>
              <Text style={styles.closeScannerText}>Chiudi scanner</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F6FA' },
  flex: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#2D6BA8' },
  headerButton: { minWidth: 62, paddingVertical: 8 },
  headerButtonText: { color: '#EAF3FB', fontSize: 14, fontWeight: '700' },
  headerButtonRight: { textAlign: 'right' },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 36, maxWidth: 760, width: '100%', alignSelf: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  registryLink: { backgroundColor: '#EAF2FB', borderColor: '#C4D8ED', borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 20 },
  registryLinkTitle: { color: '#245A8D', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  registryLinkText: { color: '#526779', fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: '#26384A', fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 10 },
  jobSectionTitle: { marginTop: 23 },
  label: { color: '#384B5D', fontSize: 14, fontWeight: '600', marginBottom: 7 },
  labelMissing: { color: '#B42318' },
  pickerContainer: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#D6DEE7', marginBottom: 10, overflow: 'hidden' },
  pickerMissing: { borderColor: '#D92D20', borderWidth: 1.5 },
  picker: { height: 50, width: '100%' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  jobInput: { flex: 1, minHeight: 50, backgroundColor: '#fff', borderColor: '#D6DEE7', borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, color: '#1F2937', fontSize: 16 },
  scanButton: { width: 56, height: 50, marginLeft: 9, backgroundColor: '#2D6BA8', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scanButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { color: '#778596', fontSize: 12, marginTop: 6 },
  secondaryButton: { minHeight: 46, marginTop: 12, borderWidth: 1, borderColor: '#2D6BA8', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { color: '#2D6BA8', fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.55 },
  jobBanner: { backgroundColor: '#fff', borderRadius: 13, padding: 14, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DDE5EE' },
  jobBannerLabel: { color: '#7A8795', fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  jobBannerValue: { color: '#26384A', fontSize: 22, fontWeight: '800', marginTop: 4 },
  statusBadge: { borderRadius: 99, paddingVertical: 6, paddingHorizontal: 9 },
  statusComplete: { backgroundColor: '#DCFCE7' },
  statusIncomplete: { backgroundColor: '#FEE4E2' },
  statusText: { fontSize: 10, fontWeight: '800' },
  statusTextComplete: { color: '#067647' },
  statusTextIncomplete: { color: '#B42318' },
  missingSummary: { padding: 12, marginTop: 10, borderRadius: 10, backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#F6B8B3' },
  missingSummaryTitle: { color: '#B42318', fontWeight: '700', marginBottom: 4 },
  missingSummaryText: { color: '#8D2A22', fontSize: 12, lineHeight: 18 },
  fieldGroup: { marginBottom: 14 },
  input: { minHeight: 48, backgroundColor: '#fff', borderColor: '#D6DEE7', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, color: '#1F2937', fontSize: 16 },
  inputMissing: { borderColor: '#D92D20', borderWidth: 1.5, backgroundColor: '#FFFAF9' },
  textArea: { height: 88, paddingTop: 12 },
  fieldError: { color: '#B42318', fontSize: 12, marginTop: 5 },
  saveButton: { minHeight: 52, marginTop: 10, backgroundColor: '#2D6BA8', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  saveHint: { textAlign: 'center', color: '#7A8795', fontSize: 12, marginTop: 9 },
  pageHeading: { marginBottom: 8 },
  pageDescription: { color: '#697887', fontSize: 13, lineHeight: 19 },
  loader: { marginVertical: 26 },
  emptyBox: { backgroundColor: '#fff', padding: 22, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#DDE5EE', borderStyle: 'dashed' },
  emptyText: { color: '#788697', fontSize: 14 },
  registryCard: { padding: 15, borderRadius: 14, marginBottom: 12, borderWidth: 1.5, backgroundColor: '#fff' },
  cardComplete: { borderColor: '#36A269', backgroundColor: '#F4FBF6' },
  cardIncomplete: { borderColor: '#D92D20', backgroundColor: '#FFF7F6' },
  registryCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  registryJob: { color: '#26384A', fontSize: 18, fontWeight: '800' },
  registryPrinter: { color: '#526779', fontSize: 13, marginTop: 3 },
  registryMeta: { color: '#687889', fontSize: 12, lineHeight: 18, marginTop: 3 },
  missingList: { color: '#A12D24', fontSize: 12, lineHeight: 18, fontWeight: '600', marginTop: 8 },
  cardActions: { flexDirection: 'row', marginTop: 13 },
  cardPrimaryAction: { flex: 1, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 9, backgroundColor: '#2D6BA8', paddingHorizontal: 8 },
  cardPrimaryActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardSecondaryAction: { minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#2D6BA8', backgroundColor: '#fff', paddingHorizontal: 12, marginTop: 8, marginLeft: 8 },
  cardSecondaryActionText: { color: '#2D6BA8', fontSize: 12, fontWeight: '700' },
  historyCard: { padding: 14, borderRadius: 14, marginBottom: 12, borderWidth: 1.5, backgroundColor: '#fff' },
  historyDataLine: { color: '#394B5D', fontSize: 12, lineHeight: 18, marginTop: 3 },
  historyNotes: { color: '#394B5D', fontSize: 12, lineHeight: 18, marginTop: 8, fontStyle: 'italic' },
  scannerModal: { flex: 1, backgroundColor: '#111' },
  scannerContent: { flex: 1, padding: 18, justifyContent: 'center' },
  scannerTitle: { color: '#fff', fontSize: 21, textAlign: 'center', fontWeight: '700', marginBottom: 16 },
  scannerBox: { backgroundColor: '#1C1C1C', borderRadius: 12, padding: 12 },
  scannerHint: { color: '#E5E7EB', textAlign: 'center', marginTop: 12, fontSize: 14 },
  closeScannerButton: { backgroundColor: '#2D6BA8', padding: 14, borderRadius: 10, marginTop: 18, alignItems: 'center' },
  closeScannerText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

