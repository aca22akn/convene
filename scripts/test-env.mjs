const inheritedKeys = new Set([
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "CI",
  "PLAYWRIGHT_BROWSERS_PATH",
]);

/** Build a child-process environment without forwarding ambient credentials. */
export function createIsolatedTestEnv(sourceEnv, homeDirectory, overrides = {}) {
  const env = {};
  for (const [name, value] of Object.entries(sourceEnv)) {
    if (value !== undefined && inheritedKeys.has(name.toUpperCase())) env[name] = value;
  }

  return {
    ...env,
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    APPDATA: homeDirectory,
    LOCALAPPDATA: homeDirectory,
    ...overrides,
  };
}

/** Keep useful CLI diagnostics without echoing tokens or local Supabase keys. */
export function sanitizeTestDiagnostic(value) {
  return String(value)
    .replace(/^(\s*(?:ANON_KEY|SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|JWT_SECRET|DB_URL|PASSWORD|API_KEY)\s*=\s*).*$/gim, "$1[redacted]")
    .replace(/(\b(?:anon(?:ymous)?[\s_-]*key|service[\s_-]*role[\s_-]*key|supabase[\s_-]*access[\s_-]*token)\s*[:=]\s*["']?)[^\s,"'`]+/gi, "$1[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{10,}\b/gi, "[redacted Supabase key]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted JWT]");
}
