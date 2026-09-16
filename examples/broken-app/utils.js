export function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}
