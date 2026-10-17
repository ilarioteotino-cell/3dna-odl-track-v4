import { Alert, Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';

export const alertErrore = (title, message = '') => {
  if (isWeb) {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const alertSuccesso = (title, message = '') => {
  if (isWeb) {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const confirmAzione = (title, message = '') =>
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

// Regole di scrittura codici (le stesse di Traccia Ordine)
export const ITEM_PATTERNS = {
  JOB: {
    regex: /^[A-Z][0-9]{6}$/,
    label: 'L999999 (1 lettera + 6 numeri, totale 7 caratteri)',
    maxLength: 7,
    placeholder: 'Es: A123456',
  },
  ODL: {
    regex: /^[A-Z][0-9]{6}-[0-9]{3}$/,
    label: 'L999999-999 (1 lettera + 6 numeri + "-" + 3 numeri, totale 11 caratteri)',
    maxLength: 11,
    placeholder: 'Es: A123456-001',
  },
  STACCATO: {
    regex: /^[A-Z][0-9]{6}_[A-Z0-9]{2}$/,
    label: 'L999999_XX (1 lettera + 6 numeri + "_" + 2 caratteri, totale 10 caratteri)',
    maxLength: 10,
    placeholder: 'Es: A123456_AB',
  },
};

export const validateItemCode = (type, code) => {
  const upperCode = String(code).toUpperCase().trim();
  const rule = ITEM_PATTERNS[type];

  if (rule && !rule.regex.test(upperCode)) {
    alertErrore(
      'Formato non valido',
      `Il numero ${type} deve avere il formato: ${rule.label}`
    );
    return false;
  }

  return true;
};

// Formato BEM: B999999_999
export const BEM_REGEX = /^B[0-9]{6}_[0-9]+$/;

export const validateBemCode = (code) => {
  const upperCode = String(code).toUpperCase().trim();
  if (!BEM_REGEX.test(upperCode)) {
    alertErrore(
      'Formato non valido',
      'La BEM deve avere formato: B999999_999 (B + 6 numeri + "_" + numeri)'
    );
    return false;
  }
  return true;
};

export function getTodayDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  } catch {
    return String(value);
  }
}

// Tipologie articolo per BEM
export const BEM_TIPOLOGIE = [
  'materiale',
  'supporto',
  'protesi',
  'strumento',
  'altro',
];
