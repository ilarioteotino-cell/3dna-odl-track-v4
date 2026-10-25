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
import { findOrderByItem, addNC, disposeNC, getNCByItem, getNCByOrder } from '../services/gestione';

const MAX_NC = 5;
const DISPOSITIONS = [
  { value: 'scartare', label: 'Scartare' },
  { value: 'usare_cosi_com_e', label: "Usare così com'è" },
  { value: 'rilavorare', label: 'Rilavorare' },
];

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

const emptyRow = () => ({ ncCode: '', causa: '', quantita: '', note: '' });

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
  const [ncRows, setNcRows] = useState([emptyRow()]);
  const [dispositionDrafts, setDispositionDrafts] = useState({});
  const [savingDispositionId, setSavingDispositionId] = useState(null);

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

  const nextNCNumber =
    history.reduce((max, item) => Math.max(max, item.nc_number || 0), 0) + 1;

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
    setNcRows([emptyRow()]);
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

      const data = found
        ? await getNCByOrder(found.id)
        : await getNCByItem(itemType, upperCode);
      setHistory(data || []);

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
    if (ncRows.length >= MAX_NC) {
      alertErrore('Limite raggiunto', `Puoi inserire al massimo ${MAX_NC} NC per inserimento`);
      return;
    }
    setNcRows([...ncRows, emptyRow()]);
  };

  const handleRemoveRow = (index) => {
    if (ncRows.length === 1) {
      setNcRows([emptyRow()]);
      return;
    }
    setNcRows(ncRows.filter((_, i) => i !== index));
  };

  const updateRow = (index, field, value) => {
    const next = [...ncRows];
    next[index] = { ...next[index], [field]: value };
    setNcRows(next);
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

    const filledRows = ncRows.filter((r) => r.ncCode.trim() || r.causa.trim() || r.note.trim());
    if (filledRows.length === 0) {
      alertErrore('Errore', 'Inserisci almeno una NC');
      return;
    }

    if (filledRows.some((r) => !r.ncCode.trim())) {
      alertErrore('Errore', 'Indica il codice o la descrizione per ogni NC');
      return;
    }
    if (filledRows.some((r) => !r.quantita || parseInt(r.quantita, 10) < 1)) {
      alertErrore('Errore', 'Indica una quantità non conforme maggiore di zero per ogni NC');
      return;
    }

    const userLabel =
      currentUser?.full_name || currentUser?.username || 'Sconosciuto';

    const ncSummary = filledRows
      .map((r, i) => `NC ${nextNCNumber + i}: ${r.ncCode.trim()} — Quantità: ${r.quantita}`)
      .join('\n');

    const orderInfo = order
      ? `Ordine trovato: ${order.itemTypeLabel || upperCode}`
      : `Ordine non presente in Traccia Ordine — la NC verrà registrata sul codice ${upperCode}`;

    const conferma = await confirmAzione(
      `${userLabel}, confermi l'inserimento NC?`,
      `${itemType}: ${upperCode}\n${orderInfo}\n\n${ncSummary}`
    );

    if (!conferma) return;

    setLoading(true);
    try {
      const inserted = await addNC({
        orderId: order?.id || null,
        itemType,
        itemCode: upperCode,
        insertedBy: currentUser.id,
        insertedByName: userLabel,
        entries: filledRows.map((row) => ({
          ncCode: row.ncCode.trim(),
          causa: row.causa.trim() || null,
          quantita: row.quantita,
          note: row.note.trim() || null,
        })),
      });

      const data = order?.id
        ? await getNCByOrder(order.id)
        : await getNCByItem(itemType, upperCode);
      setHistory(data || []);

      alertSuccesso(
        'NC registrate!',
        inserted.map((item) => `NC ${item.nc_number} — ${item.nc_code}`).join('\n')
      );
      resetForm();
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile registrare la NC');
    } finally {
      setLoading(false);
    }
  };

  const updateDispositionDraft = (id, field, value) => {
    setDispositionDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  };

  const handleDisposeNC = async (item) => {
    const draft = dispositionDrafts[item.id] || {};
    if (!draft.type) {
      alertErrore('Disposizione mancante', 'Seleziona una disposizione tecnica.');
      return;
    }
    if (!currentUser) {
      alertErrore('Errore', 'Utente non autenticato');
      return;
    }

    const userLabel = currentUser.full_name || currentUser.username || 'Sconosciuto';
    const confirmed = await confirmAzione(
      `${userLabel}, confermi la disposizione?`,
      `NC ${item.nc_number} — ${item.nc_code}\nDisposizione: ${DISPOSITIONS.find((d) => d.value === draft.type)?.label}`
    );
    if (!confirmed) return;

    setSavingDispositionId(item.id);
    try {
      await disposeNC({
        id: item.id,
        disposedBy: currentUser.id,
        disposedByName: userLabel,
        dispositionType: draft.type,
        dispositionNote: draft.note?.trim() || null,
      });
      const data = order?.id
        ? await getNCByOrder(order.id)
        : await getNCByItem(itemType, itemCode.trim().toUpperCase());
      setHistory(data || []);
      alertSuccesso('Disposizione registrata', `NC ${item.nc_number} aggiornata.`);
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile registrare la disposizione');
    } finally {
      setSavingDispositionId(null);
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
                history.map((item) => {
                  const isDisposed = Boolean(item.disposizione_at);
                  const draft = dispositionDrafts[item.id] || {};
                  const dispositionLabel = DISPOSITIONS.find(
                    (option) => option.value === item.disposizione_tipo
                  )?.label;
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.historyCard,
                        isDisposed ? styles.disposedCard : styles.pendingCard,
                      ]}
                    >
                      <View style={styles.ncCardHeader}>
                        <Text style={styles.historyRac}>NC {item.nc_number}</Text>
                        <Text style={[styles.statusBadge, isDisposed ? styles.statusDone : styles.statusPending]}>
                          {isDisposed ? 'DISPOSIZIONATA' : 'DA DISPOSIZIONARE'}
                        </Text>
                      </View>
                      <Text style={styles.historyDate}>
                        Inserita {formatDateTime(item.inserted_at)} da {item.inserted_by_name || 'Sconosciuto'}
                      </Text>
                      <Text style={styles.historyRac}>{item.nc_code}</Text>
                      {item.causa ? <Text style={styles.historyCausa}>Causale: {item.causa}</Text> : null}
                      <Text
                        style={[
                          styles.historyQuantity,
                          item.disposizione_tipo === 'scartare' && styles.scrapText,
                        ]}
                      >
                        Quantità non conforme: {item.quantita_nc}
                      </Text>
                      {item.note ? <Text style={styles.historyNote}>Note NC: {item.note}</Text> : null}

                      {isDisposed ? (
                        <View style={styles.dispositionDetails}>
                          <Text style={[
                            styles.dispositionTitle,
                            item.disposizione_tipo === 'scartare' && styles.scrapText,
                          ]}>
                            Disposizione: {dispositionLabel || item.disposizione_tipo}
                          </Text>
                          <Text style={styles.historyDate}>
                            Registrata {formatDateTime(item.disposizione_at)} da {item.disposizione_by_name || 'Sconosciuto'}
                          </Text>
                          {item.disposizione_nota ? (
                            <Text style={styles.historyNote}>Nota disposizione: {item.disposizione_nota}</Text>
                          ) : null}
                        </View>
                      ) : (
                        <View style={styles.dispositionDetails}>
                          <Text style={styles.smallLabel}>Disposizione tecnica</Text>
                          <View style={styles.dispositionOptions}>
                            {DISPOSITIONS.map((option) => (
                              <TouchableOpacity
                                key={option.value}
                                style={[
                                  styles.dispositionOption,
                                  draft.type === option.value && styles.dispositionOptionActive,
                                ]}
                                onPress={() => updateDispositionDraft(item.id, 'type', option.value)}
                              >
                                <Text style={[
                                  styles.dispositionOptionText,
                                  draft.type === option.value && styles.dispositionOptionTextActive,
                                ]}>{option.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <TextInput
                            style={[styles.input, styles.textArea]}
                            value={draft.note || ''}
                            onChangeText={(value) => updateDispositionDraft(item.id, 'note', sanitizeInput(value))}
                            placeholder="Nota per chi dispone (opzionale)"
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={2}
                          />
                          <TouchableOpacity
                            style={[styles.dispositionButton, savingDispositionId === item.id && styles.buttonDisabled]}
                            onPress={() => handleDisposeNC(item)}
                            disabled={savingDispositionId === item.id}
                          >
                            {savingDispositionId === item.id ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : <Text style={styles.buttonText}>Registra disposizione</Text>}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>
                Nuovo inserimento NC — progressivo da NC {nextNCNumber}
              </Text>
              <Text style={styles.hint}>
                Puoi inserire fino a {MAX_NC} NC per volta. Ogni NC ha quantità e note
                proprie; il progressivo viene assegnato automaticamente.
              </Text>

              {ncRows.map((row, index) => (
                <View key={index} style={styles.racCard}>
                  <View style={styles.racHeader}>
                    <Text style={styles.racTitle}>NC {nextNCNumber + index}</Text>
                    {ncRows.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveRow(index)}>
                        <Text style={styles.removeText}>Rimuovi</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.smallLabel}>Codice o descrizione NC</Text>
                  <TextInput
                    style={styles.input}
                    value={row.ncCode}
                    onChangeText={(v) => updateRow(index, 'ncCode', sanitizeInput(v))}
                    placeholder="Descrivi la non conformità"
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

                  <Text style={styles.smallLabel}>Quantità non conforme</Text>
                  <TextInput
                    style={styles.input}
                    value={row.quantita}
                    onChangeText={(v) => updateRow(index, 'quantita', sanitizeInput(v).replace(/[^0-9]/g, ''))}
                    placeholder="Es: 3"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    maxLength={6}
                  />

                  <Text style={styles.smallLabel}>Note della NC (opzionali)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={row.note}
                    onChangeText={(v) => updateRow(index, 'note', sanitizeInput(v))}
                    placeholder="Note specifiche per questa NC..."
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={2}
                  />
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addRowButton, ncRows.length >= MAX_NC && styles.buttonDisabled]}
                onPress={handleAddRow}
                disabled={ncRows.length >= MAX_NC}
              >
                <Text style={styles.addRowText}>
                  + Aggiungi NC ({nextNCNumber + ncRows.length - 1}/{MAX_NC})
                </Text>
              </TouchableOpacity>

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
  pendingCard: { backgroundColor: '#FFF5F5', borderColor: '#E53935', borderLeftColor: '#E53935' },
  disposedCard: { backgroundColor: '#F1F8F2', borderColor: '#66BB6A', borderLeftColor: '#2E7D32' },
  ncCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '700' },
  statusPending: { backgroundColor: '#FDE2E2', color: '#B71C1C' },
  statusDone: { backgroundColor: '#DDF1DF', color: '#1B5E20' },
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
  historyQuantity: { fontSize: 14, color: '#444', fontWeight: '700', marginTop: 8 },
  scrapText: { color: '#D32F2F' },
  historyNote: { fontSize: 12, color: '#999', marginTop: 8, fontStyle: 'italic' },
  dispositionDetails: { borderTopWidth: 1, borderTopColor: '#e7e7e7', marginTop: 12, paddingTop: 8 },
  dispositionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 4 },
  dispositionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  dispositionOption: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, backgroundColor: '#fff' },
  dispositionOptionActive: { backgroundColor: '#2D6BA8', borderColor: '#2D6BA8' },
  dispositionOptionText: { color: '#555', fontSize: 13, fontWeight: '600' },
  dispositionOptionTextActive: { color: '#fff' },
  dispositionButton: { backgroundColor: '#2D6BA8', padding: 13, borderRadius: 8, alignItems: 'center', marginTop: 10 },
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

