import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { logout } from '../services/auth';

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

export default function AdminPanel({ navigation }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [approvedUsers, setApprovedUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation]);

  async function loadData() {
    try {
      setLoading(true);

      // Carica utenti in attesa di approvazione
      const { data: pendingData, error: pendingError } = await supabase
        .from('profiles')
        .select('*')
        .eq('approved', false)
        .neq('role', 'admin');

      if (pendingError) throw pendingError;
      setPendingUsers(pendingData || []);

      // Carica utenti approvati
      const { data: approvedData, error: approvedError } = await supabase
        .from('profiles')
        .select('*')
        .eq('approved', true);

      if (approvedError) throw approvedError;
      setApprovedUsers(approvedData || []);
    } catch (err) {
      alertErrore('Errore caricamento dati', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function approveUser(userId) {
    if (isWeb) {
      setSelectedUserId(userId);
      setShowRoleModal(true);
    } else {
      Alert.alert('Scegli Ruolo', 'Che ruolo vuoi assegnare a questo utente?', [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Operatore',
          onPress: () => approveWithRole(userId, 'operator'),
        },
        {
          text: 'Amministratore',
          onPress: () => approveWithRole(userId, 'admin'),
        },
      ]);
    }
  }

  async function approveWithRole(userId, role) {
    setShowRoleModal(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ approved: true, role: role })
        .eq('id', userId);

      if (error) throw error;

      const roleLabel = role === 'admin' ? 'Amministratore' : 'Operatore';
      alertSuccesso('Successo', `Utente approvato come ${roleLabel}`);
      loadData();
    } catch (err) {
      alertErrore('Errore', err.message);
    }
  }

  async function rejectUser(userId) {
    if (isWeb) {
      const confirmed = window.confirm('Eliminare questa richiesta?');
      if (!confirmed) return;
      await performReject(userId);
    } else {
      Alert.alert('Conferma', 'Eliminare questa richiesta?', [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => performReject(userId),
        },
      ]);
    }
  }

  async function performReject(userId) {
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      alertSuccesso('Successo', 'Richiesta eliminata');
      loadData();
    } catch (err) {
      alertErrore('Errore', err.message);
    }
  }

  async function deleteUser(userId) {
    if (isWeb) {
      const confirmed = window.confirm('Eliminare questo utente?');
      if (!confirmed) return;
      await performDelete(userId);
    } else {
      Alert.alert('Conferma', 'Eliminare questo utente?', [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => performDelete(userId),
        },
      ]);
    }
  }

  async function performDelete(userId) {
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      alertSuccesso('Successo', 'Utente eliminato');
      loadData();
    } catch (err) {
      alertErrore('Errore', err.message);
    }
  }

  async function changeUserRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'operator' : 'admin';
    const roleLabel = newRole === 'admin' ? 'Amministratore' : 'Operatore';

    if (isWeb) {
      const confirmed = window.confirm(`Cambiare ruolo a ${roleLabel}?`);
      if (!confirmed) return;
      await performChangeRole(userId, newRole, roleLabel);
    } else {
      Alert.alert('Conferma', `Cambiare ruolo a ${roleLabel}?`, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma',
          onPress: () => performChangeRole(userId, newRole, roleLabel),
        },
      ]);
    }
  }

  async function performChangeRole(userId, newRole, roleLabel) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      alertSuccesso('Successo', `Ruolo cambiato a ${roleLabel}`);
      loadData();
    } catch (err) {
      alertErrore('Errore', err.message);
    }
  }

  async function handleLogout() {
    await logout();
    navigation.replace('Login');
  }

  function renderPendingUser({ item }) {
    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.username}</Text>
          <Text style={styles.userDetail}>{item.full_name}</Text>
          <View style={styles.pendingBadge}>
            <Text style={styles.badgeText}>In Attesa</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.approveButton}
            onPress={() => approveUser(item.id)}
          >
            <Text style={styles.buttonText}>✓</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => rejectUser(item.id)}
          >
            <Text style={styles.buttonText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderApprovedUser({ item }) {
    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.username}</Text>
          <Text style={styles.userDetail}>{item.full_name}</Text>
          <View
            style={[
              styles.badge,
              item.role === 'admin' ? styles.adminBadge : styles.operatorBadge,
            ]}
          >
            <Text style={styles.badgeText}>
              {item.role === 'admin' ? 'Admin' : 'Operatore'}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.changeRoleButton}
            onPress={() => changeUserRole(item.id, item.role)}
          >
            <Text style={styles.buttonText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteUser(item.id)}
          >
            <Text style={styles.buttonText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gestione Utenti</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Esci</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.tabsContainer}
        key={`tabs-${pendingUsers.length}-${approvedUsers.length}`}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'pending' && styles.tabTextActive,
            ]}
          >
            In Attesa {pendingUsers.length}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'users' && styles.tabTextActive,
            ]}
          >
            Utenti Registrati {approvedUsers.length}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'pending' && (
        <FlatList
          data={pendingUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderPendingUser}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>📋</Text>
              <Text style={styles.emptyMessage}>Nessuna richiesta</Text>
            </View>
          }
        />
      )}

      {activeTab === 'users' && (
        <FlatList
          data={approvedUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderApprovedUser}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>👥</Text>
              <Text style={styles.emptyMessage}>Nessun utente</Text>
            </View>
          }
        />
      )}

      {isWeb && (
        <Modal
          visible={showRoleModal}
          transparent={true}
          animationType="fade"
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            onPress={() => setShowRoleModal(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Scegli Ruolo Utente</Text>
              <TouchableOpacity
                style={[styles.roleModalButton, { backgroundColor: '#66BB6A' }]}
                onPress={() => approveWithRole(selectedUserId, 'operator')}
              >
                <Text style={styles.roleModalButtonText}>Operatore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleModalButton, { backgroundColor: '#E53935' }]}
                onPress={() => approveWithRole(selectedUserId, 'admin')}
              >
                <Text style={styles.roleModalButtonText}>Amministratore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowRoleModal(false)}
              >
                <Text style={styles.modalCloseText}>Annulla</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
  logoutText: {
    color: '#fff',
    fontSize: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#2D6BA8',
  },
  tabText: {
    fontSize: 12,
    color: '#999',
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: '#2D6BA8',
  },
  listContent: {
    padding: 15,
    flexGrow: 1,
  },
  userCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 3,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  userDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginTop: 5,
  },
  pendingBadge: {
    backgroundColor: '#FFA726',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginTop: 5,
  },
  adminBadge: {
    backgroundColor: '#E53935',
  },
  operatorBadge: {
    backgroundColor: '#66BB6A',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  approveButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    width: 50,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#E53935',
    padding: 12,
    borderRadius: 8,
    width: 50,
    alignItems: 'center',
  },
  changeRoleButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    width: 50,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#E53935',
    padding: 12,
    borderRadius: 8,
    width: 50,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 60,
    marginBottom: 10,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  roleModalButton: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  roleModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalCloseButton: {
    backgroundColor: '#999',
    padding: 15,
    borderRadius: 8,
    marginTop: 15,
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
