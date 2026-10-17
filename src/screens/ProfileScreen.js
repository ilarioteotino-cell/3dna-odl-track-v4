import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUser, changePassword } from '../services/auth';
import { supabase } from '../services/supabase';
import { sanitizeInput } from '../utils/sanitize';

const isWeb = Platform.OS === 'web';

// Helper functions per alert
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

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Stati per mostrare/nascondere password
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Errore caricamento utente:', error);
      alertErrore('Errore', 'Impossibile caricare il profilo utente');
    }
  };

  const handleChangePassword = async () => {
    // Validazioni
    if (!oldPassword || !newPassword || !confirmPassword) {
      alertErrore('Errore', 'Compila tutti i campi');
      return;
    }

    if (newPassword !== confirmPassword) {
      alertErrore('Errore', 'Le nuove password non corrispondono');
      return;
    }

    if (newPassword.length < 6) {
      alertErrore('Errore', 'La password deve essere di almeno 6 caratteri');
      return;
    }

    setLoading(true);

    try {
      // Verifica la vecchia password
      const { data: userData, error: selectError } = await supabase
        .from('profiles')
        .select('password_hash')
        .eq('id', user.id)
        .single();

      if (selectError || !userData) {
        throw new Error('Errore nel recupero della password');
      }

      // Confronta la password (normalmente dovrebbe usare bcrypt)
      if (userData.password_hash !== oldPassword) {
        alertErrore('Errore', 'La vecchia password non è corretta');
        setLoading(false);
        return;
      }

      // Aggiorna la password
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ password_hash: newPassword })
        .eq('id', user.id);

      if (updateError) throw updateError;

      alertSuccesso('Successo', 'Password aggiornata con successo!');

      // Reset form
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Aggiorna l'utente nel storage
      const updatedUser = { ...user, password_hash: newPassword };
      setUser(updatedUser);
    } catch (error) {
      console.error('Errore cambio password:', error);
      alertErrore('Errore', error.message || 'Impossibile cambiare la password');
    } finally {
      setLoading(false);
    }
  };

  // Componente Input Password con Icona Occhio
  function PasswordInput({ label, value, onChangeText, placeholder, showPassword, toggleShow }) {
    if (isWeb) {
      // Versione WEB
      return (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>{label}</Text>
          <View style={styles.passwordInputContainer}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={value}
              onChange={(e) => onChangeText(sanitizeInput(e.target.value))}
              placeholder={placeholder}
              style={styles.webInput}
            />
            <button
              onClick={toggleShow}
              type="button"
              style={styles.webPasswordToggle}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </View>
        </View>
      );
    }

    // Versione MOBILE
    return (
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={styles.passwordInputContainer}>
          <TextInput
            style={[styles.input, { paddingRight: 50 }]}
            value={value}
            onChangeText={(v) => onChangeText(sanitizeInput(v))}
            placeholder={placeholder}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={toggleShow} style={styles.passwordToggle}>
            <Text style={styles.passwordToggleText}>{showPassword ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Indietro</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Il Mio Profilo</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Caricamento...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Il Mio Profilo</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Informazioni Utente */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Informazioni Utente</Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.value}>{user?.full_name || 'N/A'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.value}>{user?.username || 'N/A'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Ruolo</Text>
            <Text style={styles.value}>
              {user?.role === 'admin' ? 'Amministratore' : 'Operatore'}
            </Text>
          </View>

          <View style={styles.infoRow}>
 <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>
              {user?.approved ? '✅ Approvato' : '⏳ In attesa di approvazione'}
            </Text>
          </View>
        </View>

        {/* Cambio Password */}
        <View style={styles.passwordCard}>
          <Text style={styles.sectionTitle}>Cambia Password</Text>

          <PasswordInput
            label="Vecchia Password"
            value={oldPassword}
            onChangeText={setOldPassword}
            placeholder="Inserisci vecchia password"
            showPassword={showOldPassword}
            toggleShow={() => setShowOldPassword(!showOldPassword)}
          />

          <PasswordInput
            label="Nuova Password"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Inserisci nuova password"
            showPassword={showNewPassword}
            toggleShow={() => setShowNewPassword(!showNewPassword)}
          />

          <PasswordInput
            label="Conferma Nuova Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Conferma nuova password"
            showPassword={showConfirmPassword}
            toggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Aggiornamento...' : 'Cambia Password'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Creato da Ilario Teotino</Text>
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 3,
  },
  passwordCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  value: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: '#333',
    marginBottom: 15,
  },
  passwordInputContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  webInput: {
    width: '100%',
    backgroundColor: '#f9f9f9',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    paddingRight: '50px',
    fontSize: '16px',
    boxSizing: 'border-box',
    fontFamily: 'System',
  },
  webPasswordToggle: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '20px',
  },
  passwordToggle: {
    position: 'absolute',
    right: 15,
    top: 15,
    zIndex: 1,
  },
  passwordToggleText: {
    fontSize: 20,
  },
  button: {
    backgroundColor: '#2D6BA8',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#93B5D1',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginTop: 10,
  },
  footerText: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#999',
  },
});