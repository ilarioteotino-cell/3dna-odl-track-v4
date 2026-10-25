import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUser, logout, isAdmin } from '../services/auth';

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

export default function HomeScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      const isAdminUser = await isAdmin();
      setAdmin(isAdminUser);
    } catch (error) {
      console.error('Errore caricamento utente:', error);
      alertErrore('Errore', 'Impossibile caricare il profilo');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigation.replace('Login');
      alertSuccesso('Arrivederci', 'Logout completato');
    } catch (error) {
      console.error('Errore logout:', error);
      alertErrore('Errore', 'Impossibile eseguire il logout');
    }
  };

  const menuItems = [
    {
      title: 'Traccia Ordine',
      description: 'Gestisci movimentazioni ODL/JOB/Staccato',
      icon: '📦',
      color: '#007AFF',
      action: () => navigation.navigate('TrackOrder'),
    },
    {
      title: 'Gestione NC',
      description: 'Registra scarti e non conformità (max 5 RAC)',
      icon: '🚨',
      color: '#E53935',
      action: () => navigation.navigate('GestioneNC'),
    },
    {
      title: 'Gestione BEM',
      description: 'Associa fino a 5 BEM per ordine',
      icon: '🏷️',
      color: '#9C27B0',
      action: () => navigation.navigate('GestioneBEM'),
    },
    {
      title: 'Chiusura Ordine',
      description: 'Dichiara la chiusura con data',
      icon: '✅',
      color: '#009688',
      action: () => navigation.navigate('ChiusuraOrdine'),
    },
    {
      title: 'Registra BEM nel JOB',
      description: 'Associa BEM ai JOB di produzione',
      icon: '📒',
      color: '#7B1FA2',
      action: () => navigation.navigate('RegistraBemJob'),
    },
    {
      title: 'BEM nel Forno',
      description: 'Registra ingressi e uscite BEM dal forno',
      icon: '🔥',
      color: '#FF5722',
      action: () => navigation.navigate('RegistraBemForno'),
    },
    {
      title: 'Storico Movimenti',
      description: 'Visualizza la cronologia degli ordini',
      icon: '📋',
      color: '#34C759',
      action: () => navigation.navigate('OrderHistory'),
    },
    {
      title: 'Il Mio Profilo',
      description: 'Gestisci il tuo account e password',
      icon: '👤',
      color: '#FF9500',
      action: () => navigation.navigate('Profile'),
    },
  ];

  if (admin) {
    menuItems.push(
      {
        title: 'Gestione Reparti',
        description: 'Crea e modifica reparti',
        icon: '🏭',
        color: '#5856D6',
        action: () => navigation.navigate('Departments'),
      },
      {
        title: 'Gestione Utenti',
        description: 'Approva utenti e gestisci ruoli',
        icon: '👥',
        color: '#E53935',
        action: () => navigation.navigate('AdminPanel'),
      }
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Caricamento...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>3DnA Production Tracking</Text>
        <Text style={styles.headerSubtitle}>Benvenuto, {user?.full_name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.userInfoCard}>
          <Text style={styles.userInfoText}>
            Ruolo: {user?.role === 'admin' ? '👑 Amministratore' : '👨‍💼 Operatore'}
          </Text>
          <Text style={styles.userInfoText}>
            Status: {user?.approved ? '✅ Approvato' : '⏳ In attesa'}
          </Text>
        </View>

        <View style={styles.menuGrid}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuCard}
              onPress={item.action}
              activeOpacity={0.78}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${item.color}18` }]}>
                <Text style={styles.icon}>{item.icon}</Text>
              </View>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Esci</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>v4.0 - Creato da Ilario Teotino</Text>
          <Text style={styles.footerText}>3DnA Production Tracking System</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F6FA' },
  header: {
    backgroundColor: '#2D6BA8',
    padding: 20,
    paddingTop: 30,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E0E7FF',
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
  content: {
    padding: 20,
    paddingBottom: 28,
  },
  userInfoCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2D6BA8',
    elevation: 2,
  },
  userInfoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  menuCard: {
    backgroundColor: '#fff',
    width: '48%',
    minHeight: 154,
    padding: 15,
    borderRadius: 18,
    marginBottom: 14,
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 25,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  menuDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
    elevation: 3,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
    fontStyle: 'italic',
  },
});

