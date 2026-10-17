export const sanitizeInput = (text) => text.replace(/,/g, '').replace(/\r?\n/g, '');
