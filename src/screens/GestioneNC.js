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
  formatDateTime,
} from '../utils/validators';
import { findOrderByItem, addNC, getNCByItem } from '../services/gestione';

const MAX_RAC = 5;

function WebScanner({ visible, onClose, onScan }) {
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-gestione-nc';

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

const emptyRow = () => ({ rac: '', causa: '', scarto: '' });

export default function GestioneNCScreen({ navigation }) {
  const [itemType, setItemType] = useState('ODL');
  const [itemCode, setItemCode] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [racRows, setRacRows] = useState([emptyRow()]);
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

  const isODL = itemType === 'ODL';

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

  const resetForm = () => {
    setRacRows([emptyRow()]);
    setNote('');
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
        const data = await getNCByItem(itemType, upperCode);
        setHistory(data || []);
      } else {
        setHistory([]);
      }

      setSearched(true);
      resetForm();
    } catch (error) {
      console.error('Errore ricerca NC:', error);
      alertErrore('Errore', 'Impossibile cercare le NC');
    } finally {
      setSearching(false);
    }
  };

  const handleAddRow = () => {
    if (racRows.length >= MAX_RAC) {
      alertErrore('Limite raggiunto', `Puoi inserire al massimo ${MAX_RAC} RAC per inserimento`);
      return;
    }
    setRacRows([...racRows, emptyRow()]);
  };

  const handleRemoveRow = (index) => {
    if (racRows.length === 1) {
      setRacRows([emptyRow()]);
      return;
    }
    setRacRows(racRows.filter((_, i) => i !== index));
  };

  const updateRow = (index, field, value) => {
    const next = [...racRows];
    next[index] = { ...next[index], [field]: value };
    setRacRows(next);
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

    const filledRows = racRows.filter((r) => r.rac.trim() || r.causa.trim());
    if (filledRows.length === 0) {
      alertErrore('Errore', 'Inserisci almeno una RAC');
      return;
    }

    if (isODL) {
      const missingScarto = filledRows.some(
        (r) => r.scarto === '' || r.scarto === null || r.scarto === undefined
      );
      if (missingScarto) {
        alertErrore('Errore', 'Per un OdL indica la quantità scartata per ogni RAC');
        return;
      }
    }

    const userLabel =
      currentUser?.full_name || currentUser?.username || 'Sconosciuto';

    const racList = [];
    const causaList = [];
    const scartoList = [];
    for (let i = 0; i < MAX_RAC; i++) {
      const r = filledRows[i];
      racList.push(r ? r.rac.trim().toUpperCase() : null);
      causaList.push(r ? (r.causa.trim() || null) : null);
      scartoList.push(r && isODL ? r.scarto : null);
    }

    const racLabel = filledRows
      .map((r, i) => {
        const sc = isODL ? ` — Scarti: ${r.scarto}` : '';
        return `RAC ${i + 1}: ${r.rac.trim().toUpperCase()}${sc}\n  Causale: ${r.causa.trim() || '-'}`;
      })
      .join('\n');

    const orderInfo = order
      ? `Ordine trovato: ${order.itemTypeLabel || upperCode}`
      : `Ordine non presente in Traccia Ordine — la NC verrà registrata sul codice ${upperCode}`;

    const conferma = await confirmAzione(
      `${userLabel}, confermi l'inserimento NC?`,
      `${itemType}: ${upperCode}\n${orderInfo}\n\n${racLabel}${note.trim() ? `\n\nNote: ${note.trim()}` : ''}`
    );

    if (!conferma) return;

    setLoading(true);
    try {
      await addNC({
        orderId: order?.id || null,
        itemType,
        itemCode: upperCode,
        insertedBy: currentUser.id,
        insertedByName: userLabel,
        note: note.trim() || null,
        racList,
        causaList,
        scartoList,
      });

      const data = await getNCByItem(itemType, upperCode);
      setHistory(data || []);

      alertSuccesso('NC registrata!', `${itemType} ${upperCode}\n${filledRows.length} RAC inserite`);
      resetForm();
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile registrare la NC');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setItemCode('');
    setOrder(null);
    setHistory([]);
    setSearched(false);
    resetForm();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gestione NC</Text>
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
                  resetForm();
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
            <View style={styles.foundBox}>
              <Text style={styles.foundText}>✅ Ordine trovato in Traccia Ordine</Text>
            </View>
          )}

          {searched && !order && (
            <View style={styles.notFoundBox}>
              <Text style={styles.notFoundText}>
                ⚠️ Ordine non presente in Traccia Ordine. La NC verrà registrata sul
                codice {itemCode.toUpperCase()}.
              </Text>
            </View>
          )}

          {searched && (
            <>
              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>
                NC precedenti per {itemCode.toUpperCase()}
              </Text>

              {history.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Nessuna NC registrata per questo ordine</Text>
                </View>
              ) : (
                history.map((item) => (
                  <View key={item.id} style={styles.historyCard}>
                    <Text style={styles.historyDate}>
                      {formatDateTime(item.inserted_at)} — {item.inserted_by_name || 'Sconosciuto'}
                    </Text>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const rac = item[`rac${n}`];
                      if (!rac) return null;
                      const causa = item[`causa${n}`];
                      const scarto = item[`scarto${n}`];
                      return (
                        <View key={n} style={styles.historyRow}>
                          <Text style={styles.historyRac}>{rac}</Text>
                          <Text style={styles.historyCausa}>Causale: {causa || '-'}</Text>
                          {isODL && scarto !== null && scarto !== undefined && (
                            <Text style={styles.historyScarto}>Scarti: {scarto}</Text>
                          )}
                        </View>
                      );
                    })}
                    {item.note ? (
                      <Text style={styles.historyNote}>Note: {item.note}</Text>
                    ) : null}
                  </View>
                ))
              )}

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>Nuovo inserimento NC</Text>
              <Text style={styles.hint}>
                Puoi inserire fino a {MAX_RAC} RAC. Ogni inserimento viene salvato con la
                sua data e resta nello storico.
              </Text>

              {racRows.map((row, index) => (
                <View key={index} style={styles.racCard}>
                  <View style={styles.racHeader}>
                    <Text style={styles.racTitle}>RAC {index + 1}</Text>
                    {racRows.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveRow(index)}>
                        <Text style={styles.removeText}>Rimuovi</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.smallLabel}>RAC</Text>
                  <TextInput
                    style={styles.input}
                    value={row.rac}
                    onChangeText={(v) => updateRow(index, 'rac', sanitizeInput(v))}
                    placeholder="Es: RAC-2026-001"
                    placeholderTextColor="#999"
                    autoCapitalize="characters"
                  />

                  <Text style={styles.smallLabel}>Causale</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={row.causa}
                    onChangeText={(v) => updateRow(index, 'causa', sanitizeInput(v))}
                    placeholder="Descrivi la causa della non conformità..."
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={2}
                  />

                  {isODL && (
                    <>
                      <Text style={styles.smallLabel}>Quantità scartata</Text>
                      <TextInput
                        style={styles.input}
                        value={String(row.scarto)}
                        onChangeText={(v) =>
                          updateRow(index, 'scarto', sanitizeInput(v).replace(/[^0-9]/g, ''))
                        }
                        placeholder="Es: 3"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                        maxLength={6}
                      />
                    </>
                  )}
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addRowButton, racRows.length >= MAX_RAC && styles.buttonDisabled]}
                onPress={handleAddRow}
                disabled={racRows.length >= MAX_RAC}
              >
                <Text style={styles.addRowText}>
                  + Inserisci RAC ({racRows.length}/{MAX_RAC})
                </Text>
              </TouchableOpacity>

              <Text style={styles.label}>Note (opzionale)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={note}
                onChangeText={(v) => setNote(sanitizeInput(v))}
                placeholder="Note aggiuntive sull'inserimento..."
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
                  <Text style={styles.buttonText}>Inserisci NC</Text>
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
  smallLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 10, marginBottom: 6 },
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
    backgroundColor: '#E53935',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  addRowButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
    borderWidth: 2,
    borderColor: '#E53935',
    borderStyle: 'dashed',
  },
  addRowText: { color: '#E53935', fontSize: 15, fontWeight: 'bold' },
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
  historyCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#E53935',
    elevation: 2,
  },
  historyDate: { fontSize: 12, color: '#999', marginBottom: 8 },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 6,
    marginTop: 6,
  },
  historyRac: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  historyCausa: { fontSize: 13, color: '#666', marginTop: 2 },
  historyScarto: { fontSize: 13, color: '#E53935', fontWeight: '600', marginTop: 2 },
  historyNote: { fontSize: 12, color: '#999', marginTop: 8, fontStyle: 'italic' },
  racCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  racHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  racTitle: { fontSize: 16, fontWeight: 'bold', color: '#E53935' },
  removeText: { color: '#999', fontSize: 13, fontWeight: '600' },
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
