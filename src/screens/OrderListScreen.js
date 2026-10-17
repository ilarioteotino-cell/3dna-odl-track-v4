import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { getRecentHistory } from '../services/orders';
import { sanitizeInput } from '../utils/sanitize';

const isWeb = Platform.OS === 'web';

const alertErrore = (title, message = '') => {
  if (isWeb) {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

function WebScanner({ visible, onClose, onScan }) {
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-history';

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
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1,
          },
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

export default function OrderListScreen({ navigation }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchType, setSearchType] = useState('ODL');
  const [searchCode, setSearchCode] = useState('');
  const [isFiltered, setIsFiltered] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await getRecentHistory(50);
      setHistory(data || []);
      setIsFiltered(false);
    } catch (err) {
      console.error('Errore caricamento storico:', err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  function validateSearchCode(type, code) {
    const upperCode = code.toUpperCase().trim();
    const patterns = {
      JOB: /^[A-Z][0-9]{6}$/,
      ODL: /^[A-Z][0-9]{6}-[0-9]{3}$/,
      STACCATO: /^[A-Z][0-9]{6}_[A-Z0-9]{2}$/,
    };
    return patterns[type]?.test(upperCode);
  }

  async function searchByOrder() {
    const upperCode = searchCode.trim().toUpperCase();

    if (!upperCode) {
      alertErrore('Errore', 'Inserisci un codice da cercare');
      return;
    }

    if (!validateSearchCode(searchType, upperCode)) {
      alertErrore('Errore', `Il codice ${searchType} non ha un formato valido`);
      return;
    }

    setLoading(true);

    try {
      let query = supabase
        .from('order_history')
        .select(`
          *,
          from_dept:departments!from_department_id(id, name),
          to_dept:departments!to_department_id(id, name)
        `)
        .order('moved_at', { ascending: false });

      if (searchType === 'JOB') {
        query = query.eq('job_number', upperCode);
      } else if (searchType === 'ODL') {
        query = query.eq('order_number', upperCode);
      } else if (searchType === 'STACCATO') {
        query = query.eq('staccato_number', upperCode);
      }

      const { data, error } = await query;

      if (error) throw error;

      setHistory(data || []);
      setIsFiltered(true);

      if (!data || data.length === 0) {
        alertErrore(
          'Nessun risultato',
          `Nessun movimento trovato per ${searchType} ${upperCode}`
        );
      }
    } catch (err) {
      console.error('Errore ricerca storico:', err);
      alertErrore('Errore', err?.message || 'Impossibile cercare i movimenti di questo ordine');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setSearchCode('');
    setSearchType('ODL');
    loadHistory();
  }

  function handleOpenScanner() {
    if (!isWeb) {
      alertErrore('Non disponibile', 'Lo scanner QR è attivo solo su web.');
      return;
    }
    setIsScanning(true);
  }

  function handleCloseScanner() {
    setIsScanning(false);
  }

  function handleBarcodeScanned(decodedText) {
    setIsScanning(false);
    if (decodedText) {
      setSearchCode(decodedText.trim().toUpperCase());
    }
  }

  function goToTrackOrder() {
    const upperCode = searchCode.trim().toUpperCase();

    if (!upperCode) {
      alertErrore('Errore', 'Inserisci prima un ordine');
      return;
    }

    navigation.navigate('TrackOrder', {
      itemType: searchType,
      itemCode: upperCode,
      prefilledCode: upperCode,
      prefilledType: searchType,
      ts: Date.now(),
    });
  }

  function renderHistory({ item }) {
    const isAdvancement =
      item.operation_type === 'avanzamento' ||
      item.operation_type === 'AVANZAMENTO';

    const movementColor = isAdvancement ? '#2D6BA8' : '#E53935';

    const orderData = Array.isArray(item.order) ? item.order[0] : item.order;

    const orderNumber = orderData?.order_number || item.order_number || null;
    const jobNumber = orderData?.job_number || item.job_number || null;
    const staccatoNumber = orderData?.staccato_number || item.staccato_number || null;

    const fromDeptName =
      item.from_department_name || item.from_dept?.name || 'N/A';
    const toDeptName =
      item.to_department_name || item.to_dept?.name || 'N/A';

    let codeLabel = 'CODICE';
    let codeValue = 'N/A';

    if (jobNumber) {
      codeLabel = 'JOB';
      codeValue = jobNumber;
    } else if (orderNumber) {
      codeLabel = 'ODL';
      codeValue = orderNumber;
    } else if (staccatoNumber) {
      codeLabel = 'STACCATO';
      codeValue = staccatoNumber;
    }

    return (
      <View style={styles.historyCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.codeLabel}>{codeLabel}</Text>
          <Text style={styles.codeValue}>{codeValue}</Text>

          <Text style={[styles.historyMovement, { color: movementColor }]}>
            {fromDeptName} → {toDeptName}
          </Text>

          <Text style={styles.historyDetail}>
            Operatore: {item.user?.full_name || item.user?.username || item.moved_by_name || 'Sconosciuto'}
          </Text>

          {item.scarti ? (
            <Text style={styles.historyDetail}>Scarti: {item.scarti}</Text>
          ) : null}

          {item.nc_motivation ? (
            <Text style={styles.ncNote}>NC: {item.nc_motivation}</Text>
          ) : null}

          {item.close_date ? (
            <Text style={styles.historyDetail}>Data chiusura: {item.close_date}</Text>
          ) : null}

          {item.note ? (
            <Text style={styles.historyNote}>Nota: {item.note}</Text>
          ) : null}

          <Text style={styles.historyDate}>
            {item.moved_at
              ? new Date(item.moved_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
              : 'Data non disponibile'}
          </Text>
        </View>

        <View style={[styles.typeBadge, { backgroundColor: movementColor }]}>
          <Text style={styles.typeText}>
            {isAdvancement ? 'Avanzamento' : 'Retrocessione'}
          </Text>
        </View>
      </View>
    );
  }

  const headerComponent = useMemo(
    () => (
      <View style={styles.searchBox}>
        <Text style={styles.searchTitle}>Cerca movimenti per ordine</Text>

        <View style={styles.typeSelector}>
          {['JOB', 'ODL', 'STACCATO'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.typeButton, searchType === type && styles.typeButtonActive]}
              onPress={() => {
                setSearchType(type);
                setSearchCode('');
              }}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  searchType === type && styles.typeButtonTextActive,
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchCode}
            onChangeText={(v) => setSearchCode(sanitizeInput(v))}
            placeholder={
              searchType === 'JOB'
                ? 'Es: A123456'
                : searchType === 'ODL'
                ? 'Es: A123456-001'
                : 'Es: A123456_AB'
            }
            placeholderTextColor="#999"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={searchType === 'JOB' ? 7 : searchType === 'ODL' ? 11 : 10}
          />

          {isWeb && (
            <TouchableOpacity style={styles.qrButton} onPress={handleOpenScanner}>
              <Text style={styles.qrButtonText}>QR</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.searchButton} onPress={searchByOrder}>
            <Text style={styles.actionButtonText}>Cerca</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.clearButton} onPress={clearSearch}>
            <Text style={styles.actionButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {isFiltered && searchCode ? (
          <TouchableOpacity style={styles.trackButton} onPress={goToTrackOrder}>
            <Text style={styles.trackButtonText}>Vai a Traccia Ordine per avanzarlo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ),
    [searchType, searchCode, isFiltered]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Storico Movimentazioni</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={history}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderHistory}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={headerComponent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadHistory} />
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyMessage}>
              {isFiltered
                ? 'Nessun movimento trovato per questo ordine'
                : 'Nessuna operazione registrata'}
            </Text>
          </View>
        }
      />

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

      <View style={styles.footer}>
        <Text style={styles.footerText}>Creato da Ilario Teotino - v3.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#2D6BA8',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: { color: '#fff', fontSize: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  listContent: { padding: 15, flexGrow: 1 },
  searchBox: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
  },
  searchTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
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
  typeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
    color: '#333',
  },
  qrButton: {
    width: 56,
    height: 48,
    backgroundColor: '#2D6BA8',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrButtonText: { color: '#fff', fontWeight: 'bold' },
  actionsRow: { flexDirection: 'row', marginTop: 12, gap: 10 },
  searchButton: {
    flex: 1,
    backgroundColor: '#2D6BA8',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#999',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: { color: '#fff', fontWeight: 'bold' },
  trackButton: {
    marginTop: 12,
    backgroundColor: '#28A745',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  trackButtonText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  historyCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  codeValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  historyMovement: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  historyDetail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 3,
  },
  ncNote: {
    fontSize: 13,
    color: '#E53935',
    fontWeight: '600',
    marginTop: 5,
    marginBottom: 5,
  },
  historyNote: {
    fontSize: 13,
    color: '#FF9800',
    fontStyle: 'italic',
    marginTop: 5,
    marginBottom: 5,
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginVertical: 8,
    marginLeft: 10,
  },
  typeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyIcon: { fontSize: 60, marginBottom: 10 },
  emptyMessage: { fontSize: 16, color: '#999', textAlign: 'center' },
  scannerModalSafe: { flex: 1, backgroundColor: '#111' },
  scannerModalContent: { flex: 1, padding: 20, justifyContent: 'center' },
  scannerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  scannerWrapper: {
    backgroundColor: '#1c1c1c',
    borderRadius: 12,
    padding: 12,
  },
  scannerHint: {
    color: '#ddd',
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
  },
  closeScannerBtn: {
    backgroundColor: '#E53935',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    alignItems: 'center',
  },
  closeScannerText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer: {
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  footerText: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#999',
  },
});
