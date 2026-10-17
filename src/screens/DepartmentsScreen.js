import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { sanitizeInput } from '../utils/sanitize';

const isWeb = Platform.OS === 'web';

// Helper functions per alert cross-platform
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

export default function DepartmentsScreen({ navigation }) {
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDepartments();
  }, []);

  async function loadDepartments() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('order_position', { ascending: true });

      if (error) throw error;
      setDepartments(data || []);
    } catch (err) {
      alertErrore('Errore', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addDepartment() {
    if (!newDeptName.trim()) {
      alertErrore('Errore', 'Inserisci un nome reparto');
      return;
    }

    try {
      const maxOrder =
        departments.length > 0
          ? Math.max(...departments.map((d) => d.order_position || 0))
          : 0;

      const { error } = await supabase.from('departments').insert([
        {
          name: newDeptName.trim(),
          order_position: maxOrder + 1,
        },
      ]);

      if (error) throw error;

      alertSuccesso('Successo', 'Reparto aggiunto con successo!');
      setNewDeptName('');
      loadDepartments();
    } catch (err) {
      alertErrore('Errore', err.message);
    }
  }

  async function deleteDepartment(id, name) {
    if (isWeb) {
      const confirmed = window.confirm(`Eliminare il reparto "${name}"?`);
      if (!confirmed) return;
      await performDelete(id, name);
    } else {
      Alert.alert('Conferma Eliminazione', `Eliminare il reparto "${name}"?`, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => performDelete(id, name),
        },
      ]);
    }
  }

  async function performDelete(id, name) {
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alertSuccesso('Successo', `Reparto "${name}" eliminato!`);
      loadDepartments();
    } catch (err) {
      alertErrore('Errore', err.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gestione Reparti</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.addBox}>
          <TextInput
            style={styles.input}
            placeholder="Nome nuovo reparto"
            value={newDeptName}
            onChangeText={(v) => setNewDeptName(sanitizeInput(v))}
          />
          <TouchableOpacity style={styles.addButton} onPress={addDepartment}>
            <Text style={styles.addButtonText}>Aggiungi</Text>
          </TouchableOpacity>
        </View>

        {departments.map((dept, index) => (
          <View key={dept.id} style={styles.deptCard}>
            <View style={styles.deptInfo}>
              <Text style={styles.deptOrder}>{index + 1}</Text>
              <Text style={styles.deptName}>{dept.name}</Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => deleteDepartment(dept.id, dept.name)}
            >
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))}

        {departments.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nessun reparto configurato</Text>
          </View>
        )}
      </ScrollView>
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
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  addBox: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deptCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
  },
  deptInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deptOrder: {
    backgroundColor: '#2D6BA8',
    color: '#fff',
    width: 30,
    height: 30,
    borderRadius: 15,
    textAlign: 'center',
    lineHeight: 30,
    fontWeight: 'bold',
    marginRight: 15,
  },
  deptName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  deleteButton: {
    padding: 10,
  },
  deleteButtonText: {
    fontSize: 24,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
