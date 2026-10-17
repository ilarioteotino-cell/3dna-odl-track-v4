import { supabase } from './supabase';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import bcrypt from 'bcryptjs';

const storage = {
  async setItem(key, value) {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async getItem(key) {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    } else {
      return await SecureStore.getItemAsync(key);
    }
  },
  async removeItem(key) {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

export async function login(username, password) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, role, approved, password_hash')
      .eq('username', username)
      .eq('approved', true)
      .single();

    if (error || !data) {
      throw new Error('Username o password errati');
    }

    let passwordMatch = false;

    if (data.password_hash && data.password_hash.startsWith('$2')) {
      passwordMatch = await bcrypt.compare(password, data.password_hash);
    } else {
      passwordMatch = (password === data.password_hash);
      if (passwordMatch) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await supabase.from('profiles').update({ password_hash: hashedPassword }).eq('id', data.id);
      }
    }

    if (!passwordMatch) {
      throw new Error('Username o password errati');
    }

    const userData = {
      id: data.id,
      username: data.username,
      full_name: data.full_name,
      role: data.role,
      approved: data.approved,
    };

    await storage.setItem('currentUser', JSON.stringify(userData));

    return userData;
  } catch (error) {
    console.error('Errore login:', error.message);
    throw error;
  }
}

export async function logout() {
  try {
    await storage.removeItem('currentUser');
  } catch (error) {
    console.error('Errore logout:', error.message);
    throw error;
  }
}

export async function getCurrentUser() {
  try {
    const userJson = await storage.getItem('currentUser');
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Errore recupero utente corrente:', error.message);
    return null;
  }
}

export async function isAdmin() {
  try {
    const user = await getCurrentUser();
    return user?.role === 'admin';
  } catch (error) {
    console.error('Errore verifica admin:', error.message);
    return false;
  }
}

export async function changePassword(userId, newPassword) {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error } = await supabase
      .from('profiles')
      .update({ password_hash: hashedPassword })
      .eq('id', userId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error('Errore cambio password:', error.message);
    throw error;
  }
}

export async function registerUser(username, password, fullName) {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const { data, error } = await supabase
      .from('profiles')
      .insert([
        {
          username: username,
          password_hash: hashedPassword,
          full_name: fullName,
          role: 'operator',
          approved: false,
        },
      ])
      .select();

    if (error) throw error;

    return data[0];
  } catch (error) {
    console.error('Errore registrazione:', error.message);
    throw error;
  }
}
