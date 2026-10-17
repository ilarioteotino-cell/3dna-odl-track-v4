import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import TrackOrderScreen from './screens/TrackOrderScreen';
import ProfileScreen from './screens/ProfileScreen';
import DepartmentsScreen from './screens/DepartmentsScreen';
import AdminPanel from './screens/AdminPanel';
import OrderListScreen from './screens/OrderListScreen';
import RegistraBemJobScreen from './screens/RegistraBemJob';
import RegistraBemFornoScreen from './screens/RegistraBemForno';
import GestioneNCScreen from './screens/GestioneNC';
import GestioneBEMScreen from './screens/GestioneBEM';
import ChiusuraOrdineScreen from './screens/ChiusuraOrdine';

import { getCurrentUser } from './services/auth';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    try {
      const user = await getCurrentUser();
      if (user) {
        setInitialRoute('Home');
      } else {
        setInitialRoute('Login');
      }
    } catch (error) {
      console.error('Errore verifica utente:', error);
      setInitialRoute('Login');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2D6BA8" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animationEnabled: true,
        }}
        initialRouteName={initialRoute}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animationEnabled: false }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ animationEnabled: false }}
        />
        <Stack.Screen
          name="TrackOrder"
          component={TrackOrderScreen}
          options={{ title: 'Traccia Ordine' }}
        />
        <Stack.Screen
          name="GestioneNC"
          component={GestioneNCScreen}
          options={{ title: 'Gestione NC' }}
        />
        <Stack.Screen
          name="GestioneBEM"
          component={GestioneBEMScreen}
          options={{ title: 'Gestione BEM' }}
        />
        <Stack.Screen
          name="ChiusuraOrdine"
          component={ChiusuraOrdineScreen}
          options={{ title: 'Chiusura Ordine' }}
        />
        <Stack.Screen
          name="RegistraBemJob"
          component={RegistraBemJobScreen}
          options={{ title: 'Registra BEM nel JOB' }}
        />
        <Stack.Screen
          name="RegistraBemForno"
          component={RegistraBemFornoScreen}
          options={{ title: 'BEM nel Forno' }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: 'Il Mio Profilo' }}
        />
        <Stack.Screen
          name="Departments"
          component={DepartmentsScreen}
          options={{ title: 'Gestione Reparti' }}
        />
        <Stack.Screen
          name="AdminPanel"
          component={AdminPanel}
          options={{ title: 'Gestione Utenti' }}
        />
        <Stack.Screen
          name="OrderHistory"
          component={OrderListScreen}
          options={{ title: 'Storico Movimentazioni' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
