export interface TransactionRecoveryEntry {
  conflicts: string[];
  error?: string;
  file: string;
  id: 'canvas';
  raw: string;
  token: string;
}
