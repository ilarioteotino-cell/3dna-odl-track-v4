import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  SafeAreaView,
  Modal,
} from 'react-native';
import { getCurrentUser } from '../services/auth';
import { sanitizeInput } from '../utils/sanitize';
import {
  ITEM_PATTERNS,
  validateItemCode,
  alertErrore,
  alertSuccesso,
  confirmAzione,
  isWeb,
  getTodayDate,
  formatDateTime,
} from '../utils/validators';
import { findOrderByItem, closeOrder, getChiusureByItem } from '../services/gestione';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function WebScanner({ visible, onClose, onScan }) {
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-chiusura-ordine';

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

export default function ChiusuraOrdineScreen({ navigation }) {
  const [itemType, setItemType] = useState('ODL');
  const [itemCode, setItemCode] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [closeDate, setCloseDate] = useState(getTodayDate());
  const [note, setNote] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch (error) {
      alertErrore('Errore', "Impossibile caricare l'utente");
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
      setItemCode(cleaned);
      alertSuccesso('QR rilevato', `Codice acquisito: ${cleaned}`);
    }
  };

  const handleSearch = async () => {
    const upperCode = itemCode.trim().toUpperCase();

    if (!upperCode) {
      alertErrore('Errore', `Inserisci un numero ${itemType}`);
      return;
    }

    if (!validateItemCode(itemType, upperCode)) return;

    setSearching(true);
    try {
      const found = await findOrderByItem(itemType, upperCode);
      setOrder(found);

      if (found) {
        const data = await getChiusureByItem(itemType, upperCode);
        setHistory(data || []);
      } else {
        setHistory([]);
      }

      setSearched(true);
    } catch (error) {
      console.error('Errore ricerca ordine:', error);
      alertErrore('Errore', 'Impossibile cercare l\'ordine');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    const upperCode = itemCode.trim().toUpperCase();

    if (!upperCode) {
      alertErrore('Errore', `Inserisci un numero ${itemType}`);
      return;
    }

    if (!validateItemCode(itemType, upperCode)) return;

    if (!currentUser) {
      alertErrore('Errore', 'Utente non autenticato');
      return;
    }

    if (!DATE_REGEX.test(closeDate)) {
      alertErrore('Data non valida', 'Usa il formato AAAA-MM-GG (es: 2026-01-31)');
      return;
    }

    const parsed = new Date(`${closeDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      alertErrore('Data non valida', 'Inserisci una data reale in formato AAAA-MM-GG');
      return;
    }

    if (history.length > 0) {
      const proceed = await confirmAzione(
        'Ordine già chiuso',
        `Questo ordine risulta già chiuso in data ${history[history.length - 1].close_date}. Vuoi registrare una nuova chiusura?`
      );
      if (!proceed) return;
    }

    const userLabel =
      currentUser?.full_name || currentUser?.username || 'Sconosciuto';

    const orderInfo = order
      ? 'Ordine trovato in Traccia Ordine'
      : `Ordine non presente in Traccia Ordine — la chiusura verrà registrata sul codice ${upperCode}`;

    const conferma = await confirmAzione(
      `${userLabel}, confermi la chiusura dell'ordine?`,
      `${itemType}: ${upperCode}\n${orderInfo}\n\nData chiusura: ${closeDate}${note.trim() ? `\n\nNote: ${note.trim()}` : ''}`
    );

    if (!conferma) return;

    setLoading(true);
    try {
      await closeOrder({
        orderId: order?.id || null,
        itemType,
        itemCode: upperCode,
        closeDate,
        insertedBy: currentUser.id,
        insertedByName: userLabel,
        note: note.trim() || null,
      });

      const data = await getChiusureByItem(itemType, upperCode);
      setHistory(data || []);

      if (order) {
        setOrder({ ...order, status: 'closed', close_date: closeDate });
      }

      alertSuccesso('Ordine chiuso!', `${itemType} ${upperCode}\nData: ${closeDate}`);
      setNote('');
      setCloseDate(getTodayDate());
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile chiudere l\'ordine');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setItemCode('');
    setOrder(null);
    setHistory([]);
    setSearched(false);
    setNote('');
    setCloseDate(getTodayDate());
  };

  const isAlreadyClosed = order && order.status === 'closed';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Chiusura Ordine</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Tipo di tracciamento</Text>
          <View style={styles.typeSelector}>
            {['JOB', 'ODL', 'STACCATO'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typeButton, itemType === type && styles.typeButtonActive]}
                onPress={() => {
                  setItemType(type);
                  setItemCode('');
                  setOrder(null);
                  setHistory([]);
                  setSearched(false);
                  setNote('');
                }}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    itemType === type && styles.typeButtonTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Numero {itemType}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputFlex}
              value={itemCode}
              onChangeText={(v) => {
                setItemCode(sanitizeInput(v));
                setSearched(false);
              }}
              placeholder={ITEM_PATTERNS[itemType]?.placeholder}
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={ITEM_PATTERNS[itemType]?.maxLength}
            />
            {isWeb && (
              <TouchableOpacity style={styles.scanButton} onPress={handleOpenScanner}>
                <Text style={styles.scanButtonText}>QR</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.hint}>Formato: {ITEM_PATTERNS[itemType]?.label}</Text>

          <TouchableOpacity
            style={[styles.searchButton, searching && styles.buttonDisabled]}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Cerca ordine</Text>
            )}
          </TouchableOpacity>

          {searched && order && (
            <View style={[styles.foundBox, isAlreadyClosed && styles.closedBox]}>
              <Text style={[styles.foundText, isAlreadyClosed && styles.closedText]}>
                {isAlreadyClosed
                  ? `🔒 Ordine già chiuso in data ${order.close_date || '-'}`
                  : '✅ Ordine trovato in Traccia Ordine'}
              </Text>
            </View>
          )}

          {searched && !order && (
            <View style={styles.notFoundBox}>
              <Text style={styles.notFoundText}>
                ⚠️ Ordine non presente in Traccia Ordine. La chiusura verrà registrata sul
                codice {itemCode.toUpperCase()}.
              </Text>
            </View>
          )}

          {searched && (
            <>
              {history.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionTitle}>
                    Chiusure registrate per {itemCode.toUpperCase()}
                  </Text>
                  {history.map((item) => (
                    <View key={item.id} style={styles.historyCard}>
                      <Text style={styles.historyDate}>
                        {formatDateTime(item.inserted_at)} — {item.inserted_by_name || 'Sconosciuto'}
                      </Text>
                      <Text style={styles.historyClose}>Data chiusura: {item.close_date}</Text>
                      {item.note ? (
                        <Text style={styles.historyNote}>Note: {item.note}</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              )}

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>Dichiara chiusura ordine</Text>

              <Text style={styles.label}>Data di chiusura</Text>
              <TextInput
                style={styles.input}
                value={closeDate}
                onChangeText={(v) => setCloseDate(sanitizeInput(v))}
                placeholder="AAAA-MM-GG"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
              />
              <Text style={styles.hint}>Formato: AAAA-MM-GG (default: oggi)</Text>

              <Text style={styles.label}>Note (opzionale)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={note}
                onChangeText={(v) => setNote(sanitizeInput(v))}
                placeholder="Note sulla chiusura..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={2}
              />

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Conferma chiusura ordine</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetButtonText}>Nuova ricerca</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={isScanning} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.scannerModalSafe}>
          <View style={styles.scannerModalContent}>
            <Text style={styles.scannerTitle}>Scanner QR</Text>
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
  flex: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 15, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 10, marginBottom: 10 },
  hint: { fontSize: 12, color: '#666', marginTop: 4, marginBottom: 8 },
  typeSelector: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  typeButton: {
    flex: 1,
    padding: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  typeButtonActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  typeButtonText: { fontSize: 14, fontWeight: '600', color: '#666' },
  typeButtonTextActive: { color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
    color: '#333',
  },
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
  textArea: { height: 70, textAlignVertical: 'top' },
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
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  submitButton: {
    backgroundColor: '#009688',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  foundBox: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  foundText: { color: '#2E7D32', fontWeight: '600', fontSize: 14 },
  closedBox: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  closedText: { color: '#1565C0' },
  notFoundBox: {
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  notFoundText: { color: '#8D6E00', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#ddd', marginVertical: 20 },
  historyCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#009688',
    elevation: 2,
  },
  historyDate: { fontSize: 12, color: '#999', marginBottom: 6 },
  historyClose: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  historyNote: { fontSize: 12, color: '#999', marginTop: 6, fontStyle: 'italic' },
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
