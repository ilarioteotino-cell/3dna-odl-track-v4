import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert
} from 'react-native';
import { login } from '../services/auth';
import { supabase } from '../services/supabase';
import { sanitizeInput } from '../utils/sanitize';

const isWeb = Platform.OS === 'web';

// 🔥 SPOSTATO FUORI - componente separato
function PasswordInput({ value, onChangeText, placeholder, showPassword, setShowPassword }) {
  if (isWeb) {
    // Web
    return (
      <div style={{ position: 'relative', marginBottom: '15px' }}>
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChangeText(sanitizeInput(e.target.value))}
          placeholder={placeholder}
          style={{
            width: '100%',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#ddd',
            borderRadius: '8px',
            padding: '15px',
            paddingRight: '50px',
            fontSize: '16px',
            backgroundColor: '#f9f9f9',
            boxSizing: 'border-box'
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowPassword(!showPassword)}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px'
          }}
        >
          {showPassword ? '👁️' : '👁️‍🗨️'}
        </button>
      </div>
    );
  }

  // Mobile
  return (
    <View style={{ position: 'relative', marginBottom: 15 }}>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 8,
          padding: 15,
          paddingRight: 50,
          fontSize: 16,
          backgroundColor: '#f9f9f9',
          marginBottom: 0
        }}
        placeholder={placeholder}
        value={value}
        onChangeText={(v) => onChangeText(sanitizeInput(v))}
        secureTextEntry={!showPassword}
      />
      <TouchableOpacity
        onPress={() => setShowPassword(!showPassword)}
        style={{ position: 'absolute', right: 15, top: 15 }}
      >
        <Text style={{ fontSize: 20 }}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LoginScreen({ navigation }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      if (isWeb) {
        alert('Errore: Inserisci username e password');
      } else {
        Alert.alert('Errore', 'Inserisci username e password');
      }
      return;
    }

    setLoading(true);
    try {
      const user = await login(username, password);

      if (!user.approved && user.role !== 'admin') {
        if (isWeb) {
          alert('In Attesa: Account da approvare');
        } else {
          Alert.alert('In Attesa', 'Account da approvare');
        }
        setLoading(false);
        return;
      }

      navigation.replace('Home');
    } catch (error) {
      if (isWeb) {
        alert(`Errore: ${error.message}`);
      } else {
        Alert.alert('Errore', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!nome || !cognome || !password) {
      if (isWeb) {
        alert('Errore: Compila tutti i campi');
      } else {
        Alert.alert('Errore', 'Compila tutti i campi');
      }
      return;
    }

    setLoading(true);
    try {
      const cleanNome = nome.toLowerCase().trim().replace(/\s+/g, '');
      const cleanCognome = cognome.toLowerCase().trim().replace(/\s+/g, '');
      const generatedUsername = `${cleanNome}.${cleanCognome}`;
      const fullName = `${nome.trim()} ${cognome.trim()}`;

      const { data: existing } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', generatedUsername)
        .maybeSingle();

      if (existing) {
        if (isWeb) {
          alert('Errore: Username già in uso');
        } else {
          Alert.alert('Errore', 'Username già in uso');
        }
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('profiles').insert([
        {
          username: generatedUsername,
          password_hash: password,
          full_name: fullName,
          role: 'operator',
          approved: false
        }
      ]);

      if (error) {
        if (isWeb) {
          alert(`Errore: ${error.message}`);
        } else {
          Alert.alert('Errore', error.message);
        }
        setLoading(false);
        return;
      }

      if (isWeb) {
        alert('Successo: Account creato. Attendi approvazione da un amministratore.');
        setIsRegister(false);
        setUsername('');
        setPassword('');
        setNome('');
        setCognome('');
      } else {
        Alert.alert('Successo', 'Account creato. Attendi approvazione.', [
          {
            text: 'OK',
            onPress: () => {
              setIsRegister(false);
              setUsername('');
              setPassword('');
              setNome('');
              setCognome('');
            }
          }
        ]);
      }
    } catch (error) {
      if (isWeb) {
        alert(`Errore: ${error.toString()}`);
      } else {
        Alert.alert('Errore', error.toString());
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>3DnA OdL Tracking</Text>

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, !isRegister && styles.tabActive]}
            onPress={() => setIsRegister(false)}
          >
            <Text style={[styles.tabText, !isRegister && styles.tabTextActive]}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, isRegister && styles.tabActive]}
            onPress={() => setIsRegister(true)}
          >
            <Text style={[styles.tabText, isRegister && styles.tabTextActive]}>Registrati</Text>
          </TouchableOpacity>
        </View>

        {isRegister ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Nome"
              value={nome}
              onChangeText={(t) => {
                setNome(sanitizeInput(t));
                if (t && cognome) {
                  const cleanNome = t.toLowerCase().trim().replace(/\s+/g, '');
                  const cleanCognome = cognome.toLowerCase().trim().replace(/\s+/g, '');
                  setUsername(`${cleanNome}.${cleanCognome}`);
                }
              }}
            />

            <TextInput
              style={styles.input}
              placeholder="Cognome"
              value={cognome}
              onChangeText={(t) => {
                setCognome(sanitizeInput(t));
                if (nome && t) {
                  const cleanNome = nome.toLowerCase().trim().replace(/\s+/g, '');
                  const cleanCognome = t.toLowerCase().trim().replace(/\s+/g, '');
                  setUsername(`${cleanNome}.${cleanCognome}`);
                }
              }}
            />

            <TextInput
              style={[styles.input, styles.usernameGenerated]}
              placeholder="Username (generato automaticamente)"
              value={username}
              editable={false}
            />

            {/* 🔥 PASSA setShowPassword come prop */}
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              showPassword={showPassword}
              setShowPassword={setShowPassword}
            />
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Username"
              value={username}
              onChangeText={(v) => setUsername(sanitizeInput(v))}
              autoCapitalize="none"
            />

            {/* 🔥 PASSA setShowPassword come prop */}
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              showPassword={showPassword}
              setShowPassword={setShowPassword}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={isRegister ? handleRegister : handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isRegister ? 'Registrati' : 'Login'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Created by Ilario Teotino</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f5f5f5', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 30, elevation: 5 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2D6BA8', textAlign: 'center', marginBottom: 20 },
  tabsContainer: { flexDirection: 'row', marginBottom: 20, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#2D6BA8' },
  tab: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#fff' },
  tabActive: { backgroundColor: '#2D6BA8' },
  tabText: { fontSize: 14, fontWeight: 'bold', color: '#2D6BA8' },
  tabTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
  usernameGenerated: { backgroundColor: '#E3F2FD', color: '#666' },
  button: { backgroundColor: '#2D6BA8', borderRadius: 8, padding: 15, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { backgroundColor: '#93B5D1' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  footer: { padding: 20, alignItems: 'center', backgroundColor: 'transparent', marginTop: 10 },
  footerText: { fontSize: 10, fontStyle: 'italic', color: '#999' }
});

