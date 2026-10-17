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
  KeyboardAvoidingView,
  ActivityIndicator,
  SafeAreaView,
  Modal,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../services/supabase';
import { getCurrentUser } from '../services/auth';
import { getDepartments } from '../services/orders';
import { sanitizeInput } from '../utils/sanitize';

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
  const containerId = 'qr-reader-track-order';

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

export default function TrackOrderScreen({ navigation, route }) {
  const [itemType, setItemType] = useState('ODL');
  const [itemCode, setItemCode] = useState('');
  const [departments, setDepartments] = useState([]);
  const [fromDepartmentId, setFromDepartmentId] = useState('');
  const [toDepartmentId, setToDepartmentId] = useState('');
  const [operation, setOperation] = useState('AVANZAMENTO');
  const [minutesSpent, setMinutesSpent] = useState('');
  const [note, setNote] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const fromDepartment =
    departments.find((d) => String(d.id) === String(fromDepartmentId)) || null;

  const toDepartment =
    departments.find((d) => String(d.id) === String(toDepartmentId)) || null;

  useEffect(() => {
    loadUser();
    loadDepartments();
  }, []);

  useEffect(() => {
    const incomingType =
      route?.params?.prefilledType || route?.params?.itemType || null;
    const incomingCode =
      route?.params?.prefilledCode || route?.params?.itemCode || null;

    if (incomingType) {
      setItemType(incomingType);
    }

    if (incomingCode) {
      setItemCode(String(incomingCode).toUpperCase());
    }

    if (incomingType || incomingCode) {
      setNote('');
      setMinutesSpent('');
      setOperation('AVANZAMENTO');
    }
  }, [
    route?.params?.ts,
    route?.params?.prefilledType,
    route?.params?.prefilledCode,
    route?.params?.itemType,
    route?.params?.itemCode,
  ]);

  const loadUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch (error) {
      alertErrore('Errore', "Impossibile caricare l'utente");
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await getDepartments();
      setDepartments(data || []);
    } catch (error) {
      alertErrore('Errore', 'Impossibile caricare i reparti');
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

  const validateItemCode = (type, code) => {
    const upperCode = code.toUpperCase().trim();

    const patterns = {
      JOB: {
        regex: /^[A-Z][0-9]{6}$/,
        label: 'L999999 (1 lettera + 6 numeri, totale 7 caratteri)',
      },
      ODL: {
        regex: /^[A-Z][0-9]{6}-[0-9]{3}$/,
        label: 'L999999-999 (1 lettera + 6 numeri + "-" + 3 numeri, totale 11 caratteri)',
      },
      STACCATO: {
        regex: /^[A-Z][0-9]{6}_[A-Z0-9]{2}$/,
        label: 'L999999_XX (1 lettera + 6 numeri + "_" + 2 caratteri, totale 10 caratteri)',
      },
    };

    const rule = patterns[type];
    if (rule && !rule.regex.test(upperCode)) {
      alertErrore(
        'Formato non valido',
        `Il numero ${type} deve avere il formato: ${rule.label}`
      );
      return false;
    }

    return true;
  };

  const findExistingOrder = async (upperCode) => {
    const columnMap = {
      ODL: 'order_number',
      JOB: 'job_number',
      STACCATO: 'staccato_number',
    };

    const column = columnMap[itemType];
    if (!column) return null;

    const { data, error } = await supabase
      .from('orders')
      .select('id, current_department_id, order_number, job_number, staccato_number')
      .eq(column, upperCode)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  const handleTrackOrder = async () => {
    if (!itemCode.trim()) {
      alertErrore('Errore', `Inserisci un numero ${itemType}`);
      return;
    }

    if (!validateItemCode(itemType, itemCode)) return;

    if (operation === 'RETROCESSIONE' && !note.trim()) {
      alertErrore('Errore', 'Per una retrocessione devi specificare il motivo nelle note');
      return;
    }

    if (!fromDepartment) {
      alertErrore('Errore', 'Seleziona il reparto di partenza');
      return;
    }

    if (!toDepartment) {
      alertErrore('Errore', 'Seleziona il reparto di destinazione');
      return;
    }

    if (String(fromDepartment.id) === String(toDepartment.id)) {
      alertErrore('Errore', 'I reparti di partenza e destinazione devono essere diversi');
      return;
    }

    if (!currentUser) {
      alertErrore('Errore', 'Utente non autenticato');
      return;
    }

    const upperCode = itemCode.trim().toUpperCase();
    const userLabel =
      currentUser?.full_name || currentUser?.username || 'Sconosciuto';

    const minutesInt = minutesSpent ? parseInt(minutesSpent, 10) || 0 : 0;
    const minutesLabel = minutesInt > 0 ? `\nMinuti impiegati: ${minutesInt}` : '';
    const noteLabel = note.trim() ? `\nNote: ${note.trim()}` : '';

    const conferma = await confirmAzione(
      `${userLabel}, sei sicuro di registrare il seguente ordine?`,
      `${itemType}: ${upperCode}\n${operation} da ${fromDepartment.name} a ${toDepartment.name}${minutesLabel}${noteLabel}`
    );

    if (!conferma) return;

    setLoading(true);

    try {
      let order = await findExistingOrder(upperCode);
      let orderId = order?.id || null;

      if (!orderId) {
        const newOrderData = {
          order_number: itemType === 'ODL' ? upperCode : null,
          job_number: itemType === 'JOB' ? upperCode : null,
          staccato_number: itemType === 'STACCATO' ? upperCode : null,
          starting_department_id: fromDepartment.id,
          current_department_id: fromDepartment.id,
          created_by: currentUser.id,
          scarti: 0,
          note: null,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: createdOrder, error: createError } = await supabase
          .from('orders')
          .insert([newOrderData])
          .select()
          .single();

        if (createError) throw createError;
        order = createdOrder;
        orderId = createdOrder.id;
      }

      const updatePayload = {
        current_department_id: toDepartment.id,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);

      if (updateError) throw updateError;

      const historyPayload = {
        order_id: orderId,
        order_number: itemType === 'ODL' ? upperCode : order?.order_number || null,
        job_number: itemType === 'JOB' ? upperCode : order?.job_number || null,
        staccato_number: itemType === 'STACCATO' ? upperCode : order?.staccato_number || null,
        from_department_id: fromDepartment.id,
        to_department_id: toDepartment.id,
        moved_by_user_id: currentUser.id,
        moved_by_name: userLabel,
        from_department_name: fromDepartment.name,
        to_department_name: toDepartment.name,
        operation_type: operation.toLowerCase(),
        scarti: 0,
        note: note.trim() || null,
        minutes_spent: minutesInt > 0 ? minutesInt : null,
        moved_at: new Date().toISOString(),
      };

      const { error: historyError } = await supabase
        .from('order_history')
        .insert(historyPayload);

      if (historyError) throw historyError;

      alertSuccesso(
        'Movimento registrato!',
        `${itemType} ${upperCode}\n${operation} da ${fromDepartment.name} a ${toDepartment.name}`
      );

      setItemCode('');
      setMinutesSpent('');
      setNote('');
      setOperation('AVANZAMENTO');
    } catch (error) {
      alertErrore('Errore', error?.message || 'Impossibile registrare il movimento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Traccia Ordine</Text>
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
              onChangeText={(v) => setItemCode(sanitizeInput(v))}
              placeholder={
                itemType === 'JOB'
                  ? 'Es: A123456'
                  : itemType === 'ODL'
                  ? 'Es: A123456-001'
                  : 'Es: A123456_AB'
              }
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={itemType === 'JOB' ? 7 : itemType === 'ODL' ? 11 : 10}
            />
            {isWeb && (
              <TouchableOpacity style={styles.scanButton} onPress={handleOpenScanner}>
                <Text style={styles.scanButtonText}>QR</Text>
              </TouchableOpacity>
            )}
          </View>

          {itemType === 'JOB' && (
            <Text style={styles.hint}>Formato: L999999 — 1 lettera + 6 numeri</Text>
          )}
          {itemType === 'ODL' && (
            <Text style={styles.hint}>
              Formato: L999999-999 — 1 lettera + 6 numeri + "-" + 3 numeri
            </Text>
          )}
          {itemType === 'STACCATO' && (
            <Text style={styles.hint}>
              Formato: L999999_XX — 1 lettera + 6 numeri + "_" + 2 caratteri
            </Text>
          )}

          <Text style={styles.label}>Tipo operazione</Text>
          <View style={styles.operationSelector}>
            <TouchableOpacity
              style={[
                styles.operationButton,
                operation === 'AVANZAMENTO' && styles.operationButtonActive,
              ]}
              onPress={() => setOperation('AVANZAMENTO')}
            >
              <Text
                style={[
                  styles.operationButtonText,
                  operation === 'AVANZAMENTO' && styles.operationButtonTextActive,
                ]}
              >
                AVANZAMENTO
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.operationButton,
                operation === 'RETROCESSIONE' && styles.operationButtonRetroActive,
              ]}
              onPress={() => setOperation('RETROCESSIONE')}
            >
              <Text
                style={[
                  styles.operationButtonText,
                  operation === 'RETROCESSIONE' && styles.operationButtonTextActive,
                ]}
              >
                RETROCESSIONE
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Reparto di partenza</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={fromDepartmentId}
              onValueChange={(itemValue) => {
                setFromDepartmentId(itemValue);
              }}
              style={styles.picker}
            >
              <Picker.Item label="Seleziona reparto di partenza" value="" />
              {departments.map((dept) => (
                <Picker.Item
                  key={dept.id}
                  label={dept.name}
                  value={String(dept.id)}
                />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Reparto di destinazione</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={toDepartmentId}
              onValueChange={(itemValue) => {
                setToDepartmentId(itemValue);
              }}
              style={styles.picker}
            >
              <Picker.Item label="Seleziona reparto di destinazione" value="" />
              {departments.map((dept) => (
                <Picker.Item
                  key={dept.id}
                  label={dept.name}
                  value={String(dept.id)}
                />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note}
            onChangeText={(v) => setNote(sanitizeInput(v))}
            placeholder={operation === 'RETROCESSIONE' ? 'Obbligatorio: motivo della retrocessione...' : 'Aggiungi note (opzionale)...'}
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Minuti impiegati per questa fase</Text>
          <TextInput
            style={styles.input}
            value={minutesSpent}
            onChangeText={(v) => setMinutesSpent(sanitizeInput(v).replace(/[^0-9]/g, ''))}
            placeholder="Es: 45"
            placeholderTextColor="#999"
            keyboardType="numeric"
            maxLength={4}
          />
          <Text style={styles.hint}>
            Indica quanti minuti hai impiegato per completare questa fase (opzionale)
          </Text>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleTrackOrder}
            disabled={loading}
          >
            {loading ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.submitButtonText}>Registrazione...</Text>
              </>
            ) : (
              <Text style={styles.submitButtonText}>Registra Movimento</Text>
            )}
          </TouchableOpacity>

          {itemCode && fromDepartment && toDepartment && (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Riepilogo</Text>
              <Text style={styles.summaryText}>Tipo: {itemType}</Text>
              <Text style={styles.summaryText}>Numero: {itemCode}</Text>
              <Text style={styles.summaryText}>Operazione: {operation}</Text>
              <Text style={styles.summaryText}>Da: {fromDepartment.name}</Text>
              <Text style={styles.summaryText}>A: {toDepartment.name}</Text>
              {minutesSpent ? <Text style={styles.summaryText}>Minuti impiegati: {minutesSpent}</Text> : null}
              {note ? <Text style={styles.summaryText}>Note: {note}</Text> : null}
            </View>
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
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2D6BA8',
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    width: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  scanButton: {
    width: 56,
    height: 50,
    backgroundColor: '#2D6BA8',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  operationSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  operationButton: {
    flex: 1,
    padding: 15,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  operationButtonActive: {
    backgroundColor: '#2D6BA8',
    borderColor: '#2D6BA8',
  },
  operationButtonRetroActive: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  operationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  operationButtonTextActive: {
    color: '#fff',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  summary: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  scannerModalSafe: {
    flex: 1,
    backgroundColor: '#111',
  },
  scannerModalContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
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
  closeScannerText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
