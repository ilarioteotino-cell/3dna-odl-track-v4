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
import { getCurrentUser } from '../services/auth';
import { sanitizeInput } from '../utils/sanitize';
import {
  getBemFornoHistory,
  registerBemFornoEntry,
  registerBemFornoExit,
  getBemFornoActiveEntries,
} from '../services/orders';

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

const confirmAzione = (title, message = '') =>
  new Promise((resolve) => {
    if (isWeb) {
      resolve(window.confirm(`${title}\n\n${message}`));
    } else {
      Alert.alert(title, message, [
        { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Conferma', onPress: () => resolve(true) },
      ]);
    }
  });

function WebScanner({ visible, onClose, onScan }) {
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-bem-forno';

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

const BEM_REGEX = /^B[0-9]{6}_[0-9]+$/;

export default function RegistraBemFornoScreen({ navigation }) {
  const [bemCode, setBemCode] = useState('');
  const [history, setHistory] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeEntries, setActiveEntries] = useState([]);

  useEffect(() => {
    loadUser();
    loadActiveEntries();
  }, []);

  const loadUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch (error) {
      alertErrore('Errore', "Impossibile caricare l'utente");
    }
  };

  const loadActiveEntries = async () => {
    try {
      const entries = await getBemFornoActiveEntries();
      setActiveEntries(entries || []);
    } catch (error) {
      console.error('Errore caricamento BEM in forno:', error);
    }
  };

  const handleOpenScanner = () => {
    if (!isWeb) {
      alertErrore('Non disponibile', 'Lo scanner QR è attivo solo su web.');
      return;
    }
    setIsScanning(true);
  };

  const handleCloseScanner = () => setIsScanning(false);

  const handleBarcodeScanned = (decodedText) => {
    setIsScanning(false);
    if (decodedText) {
      const cleaned = decodedText.trim().toUpperCase();
      setBemCode(cleaned);
      alertSuccesso('QR rilevato', `BEM acquisita: ${cleaned}`);
    }
  };

  const handleSearch = async () => {
    const upperBem = bemCode.trim().toUpperCase();

    if (!upperBem) {
      alertErrore('Errore', 'Inserisci un codice BEM');
      return;
    }

    if (!BEM_REGEX.test(upperBem)) {
      alertErrore(
        'Formato non valido',
        'La BEM deve avere formato: B999999_999 (B + 6 numeri + "_" + numeri)'
      );
      return;
    }

    setSearching(true);

    try {
      const data = await getBemFornoHistory(upperBem);
      setHistory(data || []);
      setSearched(true);
    } catch (error) {
      console.error('Errore ricerca BEM:', error);
      alertErrore('Errore', 'Impossibile cercare la BEM');
    } finally {
      setSearching(false);
    }
  };

  const handleEntry = async () => {
    const upperBem = bemCode.trim().toUpperCase();

    if (!currentUser) {
      alertErrore('Errore', 'Utente non autenticato');
      return;
    }

    const giaInForno = history.some((h) => h.exit_date === null);
    if (giaInForno) {
      const conferma = await confirmAzione(
        'BEM già in forno',
        `La BEM ${upperBem} risulta già in forno senza uscita. Vuoi registrare un nuovo ingresso?`
      );
      if (!conferma) return;
    }

    setLoading(true);

    try {
      await registerBemFornoEntry(upperBem, currentUser.id);

      const data = await getBemFornoHistory(upperBem);
      setHistory(data || []);
      await loadActiveEntries();

      alertSuccesso('Ingresso registrato!', `BEM ${upperBem} entrata in forno`);
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile registrare ingresso');
    } finally {
      setLoading(false);
    }
  };

  const handleExit = async () => {
    const upperBem = bemCode.trim().toUpperCase();

    if (!currentUser) {
      alertErrore('Errore', 'Utente non autenticato');
      return;
    }

    const openEntry = history.find((h) => h.exit_date === null);
    if (!openEntry) {
      alertErrore('Nessun ingresso aperto', `La BEM ${upperBem} non ha un ingresso in forno aperto`);
      return;
    }

    const conferma = await confirmAzione(
      'Conferma uscita',
      `Registrare uscita dal forno per BEM ${upperBem}?`
    );

    if (!conferma) return;

    setLoading(true);

    try {
      await registerBemFornoExit(openEntry.id, currentUser.id);

      const data = await getBemFornoHistory(upperBem);
      setHistory(data || []);
      await loadActiveEntries();

      alertSuccesso('Uscita registrata!', `BEM ${upperBem} uscita dal forno`);
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile registrare uscita');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setBemCode('');
    setHistory([]);
    setSearched(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>BEM nel Forno</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>BEM attualmente in forno</Text>
        {activeEntries.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Nessuna BEM in forno</Text>
          </View>
        ) : (
          activeEntries.map((entry) => (
            <View key={entry.id} style={styles.activeCard}>
              <View style={styles.activeDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activeBem}>{entry.bem_code}</Text>
                <Text style={styles.activeDetail}>
                  Dal {entry.entry_date ? new Date(entry.entry_date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.useBemBtn}
                onPress={() => {
                  setBemCode(entry.bem_code);
                  handleSearchAfterSet(entry.bem_code);
                }}
              >
                <Text style={styles.useBemBtnText}>Usa</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Cerca / Registra BEM</Text>

        <Text style={styles.label}>Codice BEM</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={bemCode}
            onChangeText={(text) => {
              setBemCode(sanitizeInput(text));
              setSearched(false);
            }}
            placeholder="Es: B260001_1"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {isWeb && (
            <TouchableOpacity style={styles.scanButton} onPress={handleOpenScanner}>
              <Text style={styles.scanButtonText}>QR</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.hint}>Formato: B999999_999 — B + 6 numeri + "_" + numeri</Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.searchButton, searching && styles.buttonDisabled]}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Cerca</Text>
            )}
          </TouchableOpacity>

          {searched && (
            <>
              <TouchableOpacity
                style={[styles.entryButton, loading && styles.buttonDisabled]}
                onPress={handleEntry}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Ingresso</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exitButton, loading && styles.buttonDisabled]}
                onPress={handleExit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Uscita</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {searched && (
          <>
            <Text style={styles.sectionTitle}>
              Storico movimenti BEM {bemCode.toUpperCase()}
            </Text>
            {history.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Nessun movimento registrato per questa BEM</Text>
              </View>
            ) : (
              history.map((item, index) => (
                <View
                  key={item.id || index}
                  style={[
                    styles.historyCard,
                    item.exit_date === null && styles.historyCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyBem}>{item.bem_code}</Text>
                    <Text style={styles.historyDetail}>
                      Ingresso: {item.entry_date ? new Date(item.entry_date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) : '-'}
                    </Text>
                    <Text style={styles.historyDetail}>
                      Uscita: {item.exit_date ? new Date(item.exit_date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) : 'In forno'}
                    </Text>
                    <Text style={styles.historyOperator}>
                      Operatore: {item.operator?.full_name || item.operator?.username || 'Sconosciuto'}
                    </Text>
                  </View>
                  {item.exit_date === null && (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>IN FORNO</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {searched && (
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Nuova ricerca</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={isScanning} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.scannerModalSafe}>
          <View style={styles.scannerModalContent}>
            <Text style={styles.scannerTitle}>Scanner QR - BEM</Text>

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

  async function handleSearchAfterSet(code) {
    try {
      const data = await getBemFornoHistory(code);
      setHistory(data || []);
      setSearched(true);
    } catch (error) {
      console.error('Errore ricerca BEM:', error);
    }
  }
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
  actionsRow: { flexDirection: 'row', marginTop: 15, gap: 10 },
  searchButton: {
    flex: 1,
    backgroundColor: '#2D6BA8',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  entryButton: {
    flex: 1,
    backgroundColor: '#28A745',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  exitButton: {
    flex: 1,
    backgroundColor: '#FF9500',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  activeCard: {
    backgroundColor: '#FFF8E1',
    padding: 15,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF9800',
    marginRight: 12,
  },
  activeBem: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  activeDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  useBemBtn: {
    backgroundColor: '#2D6BA8',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  useBemBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
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
  divider: { height: 1, backgroundColor: '#ddd', marginVertical: 20 },
  historyCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    elevation: 2,
  },
  historyCardActive: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  historyBem: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  historyDetail: { fontSize: 13, color: '#666', marginBottom: 2 },
  historyOperator: { fontSize: 12, color: '#999', marginTop: 2 },
  statusBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginLeft: 10,
  },
  statusText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
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
});
