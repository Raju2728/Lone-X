// This set is fixed at approval time; redirects cannot expand it.
function approvedAddress(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter an HTTPS website address.')
  let raw = value.trim()
  if (raw && !raw.includes('://') && !/^[a-z][a-z\d+.-]*:/i.test(raw)) raw = 'https://' + raw
  let url
  try { url = new URL(raw) } catch { throw new Error('Enter an HTTPS website address such as https://example.com or example.com.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS address without embedded credentials.')
  if (!url.hostname.includes('.')) throw new Error('Enter a complete website address such as google.com.')
  return url
}

function approvedOrigins(target) {
  const origins = [target.origin]
  // Only conventional bare domains and one www prefix get a counterpart.
  // IP addresses and repeated www prefixes stay on their exact approved origin.
  if (/^[\d.]+$/.test(target.hostname) || target.hostname.includes(':') || target.hostname.startsWith('www.www.')) return origins
  const counterpart = new URL(target.origin)
  counterpart.hostname = target.hostname.startsWith('www.') ? target.hostname.slice(4) : 'www.' + target.hostname
  origins.push(counterpart.origin)
  return origins
}

module.exports = { approvedAddress, approvedOrigins }
