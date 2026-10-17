import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Modal,
} from 'react-native';
import { supabase } from '../services/supabase';
import { sanitizeInput } from '../utils/sanitize';
import { getCurrentUser } from '../services/auth';
import { getBemByJob, addBemToJob } from '../services/orders';

const isWeb = Platform.OS === 'web';

const alertErrore = (title, message = '') => {
  if (isWeb) {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const alertSuccesso = (title, message = '') => {
  if (isWeb) {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

function WebScanner({ visible, onClose, onScan }) {
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-bem-job';

  useEffect(() => {
    if (!isWeb || !visible) return;

    let mounted = true;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted) return;

        const cameras = await Html5Qrcode.getCameras();
        if (!mounted) return;

        if (!cameras || cameras.length === 0) {
          alertErrore('Errore', 'Nessuna fotocamera trovata.');
          onClose?.();
          return;
        }

        const backCamera =
          cameras.find((camera) => {
            const label = (camera.label || '').toLowerCase();
            return (
              label.includes('back') ||
              label.includes('rear') ||
              label.includes('environment') ||
              label.includes('posteriore')
            );
          }) || cameras[0];

        scannerRef.current = new Html5Qrcode(containerId);

        await scannerRef.current.start(
          backCamera.id,
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          async (decodedText) => {
            try {
              if (scannerRef.current) {
                await scannerRef.current.stop();
                await scannerRef.current.clear();
                scannerRef.current = null;
              }
            } catch (err) {
              console.error('Errore chiusura scanner:', err);
            }
            onScan?.(decodedText);
          },
          () => {}
        );
      } catch (error) {
        console.error('Errore avvio scanner:', error);
        alertErrore(
          'Errore fotocamera',
          'Impossibile avviare la fotocamera. Verifica HTTPS e permessi del browser.'
        );
        onClose?.();
      }
    };

    const timeout = setTimeout(() => {
      startScanner();
    }, 250);

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
          console.error('Errore cleanup scanner:', error);
        }
      };
      stopScanner();
    };
  }, [visible, onClose, onScan]);

  if (!isWeb || !visible) return null;

  return (
    <View style={styles.scannerWrapper}>
      <div
        id={containerId}
        style={{
          width: '100%',
          maxWidth: '100%',
          minHeight: '360px',
          backgroundColor: '#000',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      />
      <Text style={styles.scannerHint}>Inquadra il QR code dentro il riquadro</Text>
    </View>
  );
}

const JOB_REGEX = /^[A-Z][0-9]{6}$/;
const BEM_REGEX = /^B[0-9]{6}_[0-9]+$/;

export default function RegistraBemJobScreen({ navigation, route }) {
  const [step, setStep] = useState('job');
  const [jobNumber, setJobNumber] = useState('');
  const [bemCode, setBemCode] = useState('');
  const [bemType, setBemType] = useState('materiale');
  const [existingBems, setExistingBems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchingJob, setSearchingJob] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState('job');

  useEffect(() => {
    loadUser();
    const prefilled = route?.params?.prefilledJob;
    if (prefilled) {
      setJobNumber(prefilled.toUpperCase());
    }
  }, []);

  const loadUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch (error) {
      alertErrore('Errore', "Impossibile caricare l'utente");
    }
  };

  const handleOpenScanner = (target) => {
    if (!isWeb) {
      alertErrore('Non disponibile', 'Lo scanner QR è attivo solo su web.');
      return;
    }
    setScanTarget(target);
    setIsScanning(true);
  };

  const handleCloseScanner = () => setIsScanning(false);

  const handleBarcodeScanned = (decodedText) => {
    setIsScanning(false);
    if (decodedText) {
      const cleaned = decodedText.trim().toUpperCase();
      if (scanTarget === 'job') {
        setJobNumber(cleaned);
        alertSuccesso('QR rilevato', `JOB acquisito: ${cleaned}`);
      } else {
        setBemCode(cleaned);
        alertSuccesso('QR rilevato', `BEM acquisita: ${cleaned}`);
      }
    }
  };

  const handleSearchJob = async () => {
    const upperJob = jobNumber.trim().toUpperCase();

    if (!upperJob) {
      alertErrore('Errore', 'Inserisci un numero JOB');
      return;
    }

    if (!JOB_REGEX.test(upperJob)) {
      alertErrore(
        'Formato non valido',
        'Il JOB deve avere formato: L999999 (1 lettera + 6 numeri)'
      );
      return;
    }

    setSearchingJob(true);

    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, order_number, job_number, staccato_number')
        .eq('job_number', upperJob)
        .maybeSingle();

      const bems = await getBemByJob(upperJob);
      setExistingBems(bems || []);

      setStep('bem');
      alertSuccesso(
        'JOB caricato',
        `Trovate ${bems?.length || 0} BEM precedenti per ${upperJob}`
      );
    } catch (error) {
      console.error('Errore ricerca JOB:', error);
      alertErrore('Errore', 'Impossibile cercare il JOB');
    } finally {
      setSearchingJob(false);
    }
  };

  const handleAddBem = async () => {
    const upperBem = bemCode.trim().toUpperCase();
    const upperJob = jobNumber.trim().toUpperCase();

    if (!upperBem) {
      alertErrore('Errore', 'Inserisci il codice BEM');
      return;
    }

    if (!BEM_REGEX.test(upperBem)) {
      alertErrore(
        'Formato non valido',
        'La BEM deve avere formato: B999999_999 (B + 6 numeri + "_" + numeri)'
      );
      return;
    }

    if (!currentUser) {
      alertErrore('Errore', 'Utente non autenticato');
      return;
    }

    const giaPresente = existingBems.some((b) => b.bem_code === upperBem);
    if (giaPresente) {
      alertErrore('BEM già presente', `La BEM ${upperBem} è già registrata per questo JOB`);
      return;
    }

    setLoading(true);

    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select('id')
        .eq('job_number', upperJob)
        .maybeSingle();

      const newBem = await addBemToJob(upperJob, upperBem, orderData?.id || null, currentUser.id, bemType);

      const bems = await getBemByJob(upperJob);
      setExistingBems(bems || []);
      setBemCode('');

      alertSuccesso('BEM registrata!', `BEM ${upperBem} aggiunta al JOB ${upperJob}`);
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile registrare la BEM');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('job');
    setJobNumber('');
    setBemCode('');
    setBemType('materiale');
    setExistingBems([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Registra BEM nel JOB</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'job' && (
          <>
            <Text style={styles.sectionTitle}>Inserisci il JOB</Text>
            <Text style={styles.description}>
              Carica un JOB per vedere le BEM già registrate e aggiungerne di nuove.
            </Text>

            <Text style={styles.label}>Numero JOB</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputFlex}
                value={jobNumber}
                onChangeText={(v) => setJobNumber(sanitizeInput(v))}
                placeholder="Es: A123456"
                placeholderTextColor="#999"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
              />
              {isWeb && (
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => handleOpenScanner('job')}
                >
                  <Text style={styles.scanButtonText}>QR</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.hint}>Formato: L999999 — 1 lettera + 6 numeri</Text>

            <TouchableOpacity
              style={[styles.searchButton, searchingJob && styles.buttonDisabled]}
              onPress={handleSearchJob}
              disabled={searchingJob}
            >
              {searchingJob ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Carica JOB</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 'bem' && (
          <>
            <View style={styles.jobCard}>
              <Text style={styles.jobCardLabel}>JOB</Text>
              <Text style={styles.jobCardValue}>{jobNumber.toUpperCase()}</Text>
            </View>

            <Text style={styles.sectionTitle}>BEM già registrate</Text>
            {existingBems.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Nessuna BEM registrata per questo JOB</Text>
              </View>
            ) : (
              existingBems.map((bem, index) => (
                <View key={bem.id || index} style={styles.bemCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bemCode}>{bem.bem_code}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.bemTypeBadge, bem.type === 'supporto' ? styles.bemTypeSupporto : styles.bemTypeMateriale]}>
                        {bem.type === 'supporto' ? 'Supporto' : 'Materiale'}
                      </Text>
                      <Text style={styles.bemDetail}>
                        {bem.operator?.full_name || bem.operator?.username || 'Sconosciuto'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.bemDate}>
                    {bem.created_at
                      ? new Date(bem.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
                      : ''}
                  </Text>
                </View>
              ))
            )}

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Nuova BEM</Text>

            <Text style={styles.label}>Codice BEM</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputFlex}
                value={bemCode}
                onChangeText={(v) => setBemCode(sanitizeInput(v))}
                placeholder="Es: B260001_1"
                placeholderTextColor="#999"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {isWeb && (
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => handleOpenScanner('bem')}
                >
                  <Text style={styles.scanButtonText}>QR</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.hint}>Formato: B999999_999 — B + 6 numeri + "_" + numeri</Text>

            <Text style={styles.label}>Tipo BEM</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeOption, bemType === 'materiale' && styles.typeOptionActive]}
                onPress={() => setBemType('materiale')}
              >
                <Text style={[styles.typeOptionText, bemType === 'materiale' && styles.typeOptionTextActive]}>
                  Materiale
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeOption, bemType === 'supporto' && styles.typeOptionActive]}
                onPress={() => setBemType('supporto')}
              >
                <Text style={[styles.typeOptionText, bemType === 'supporto' && styles.typeOptionTextActive]}>
                  Supporto
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.addButton, loading && styles.buttonDisabled]}
              onPress={handleAddBem}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Registra BEM</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Cerca un altro JOB</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={isScanning} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.scannerModalSafe}>
          <View style={styles.scannerModalContent}>
            <Text style={styles.scannerTitle}>
              Scanner QR - {scanTarget === 'job' ? 'JOB' : 'BEM'}
            </Text>

            <WebScanner
              visible={isScanning}
              onClose={handleCloseScanner}
              onScan={handleBarcodeScanned}
            />

            <TouchableOpacity style={styles.closeScannerBtn} onPress={handleCloseScanner}>
              <Text style={styles.closeScannerText}>Chiudi scanner</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#2D6BA8',
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: { color: '#fff', fontSize: 16, fontWeight: '600', width: 60 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff', flex: 1, textAlign: 'center' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 10 },
  description: { fontSize: 14, color: '#666', marginBottom: 15, lineHeight: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 15, marginBottom: 8 },
  hint: { fontSize: 12, color: '#666', marginTop: 4, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputFlex: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
    color: '#333',
  },
  scanButton: {
    width: 56,
    height: 50,
    backgroundColor: '#2D6BA8',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  searchButton: {
    backgroundColor: '#2D6BA8',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  addButton: {
    backgroundColor: '#28A745',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  jobCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginTop: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2D6BA8',
    elevation: 3,
    alignItems: 'center',
  },
  jobCardLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  jobCardValue: { fontSize: 28, fontWeight: 'bold', color: '#2D6BA8', marginTop: 5 },
  emptyBox: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 14, color: '#999' },
  bemCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
    elevation: 2,
  },
  bemCode: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  bemDetail: { fontSize: 13, color: '#666', marginTop: 3 },
  bemDate: { fontSize: 12, color: '#999' },
  divider: { height: 1, backgroundColor: '#ddd', marginVertical: 20 },
  resetButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#2D6BA8',
  },
  resetButtonText: { color: '#2D6BA8', fontSize: 16, fontWeight: '600' },
  scannerModalSafe: { flex: 1, backgroundColor: '#111' },
  scannerModalContent: { flex: 1, padding: 20, justifyContent: 'center' },
  scannerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  scannerWrapper: { backgroundColor: '#1c1c1c', borderRadius: 12, padding: 12 },
  scannerHint: { color: '#ddd', textAlign: 'center', marginTop: 12, fontSize: 14 },
  closeScannerBtn: { backgroundColor: '#E53935', padding: 15, borderRadius: 10, marginTop: 20, alignItems: 'center' },
  closeScannerText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  typeSelector: { flexDirection: 'row', gap: 10, marginTop: 8 },
  typeOption: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  typeOptionActive: { backgroundColor: '#2D6BA8', borderColor: '#2D6BA8' },
  typeOptionText: { fontSize: 14, fontWeight: '600', color: '#666' },
  typeOptionTextActive: { color: '#fff' },
  bemTypeBadge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bemTypeMateriale: { backgroundColor: '#E3F2FD', color: '#1565C0' },
  bemTypeSupporto: { backgroundColor: '#FFF3E0', color: '#E65100' },
});
