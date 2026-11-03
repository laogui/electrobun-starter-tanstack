export interface TransactionRecoveryEntry {
  conflicts: string[];
  error?: string;
  file: string;
  id: 'canvas' | 'notes';
  raw: string;
  token: string;
}
