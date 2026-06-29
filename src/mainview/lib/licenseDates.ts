export function formatLicenseActivationDate(value: string | number): string {
  return new Date(value).toLocaleDateString();
}
