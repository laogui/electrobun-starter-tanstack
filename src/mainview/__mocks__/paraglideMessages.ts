// Auto-mock for paraglide/messages.js — returns the message key as a string.
// This handler is a Proxy that returns a no-op function for every message key,
// so tests that transitively import paraglide messages will just get the key back.

const handler: ProxyHandler<Record<string, () => string>> = {
  get(_target, prop: string) {
    // Return a function that returns the property name as a placeholder string
    return () => prop;
  },
};

module.exports = new Proxy({}, handler);
