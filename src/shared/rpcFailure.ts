export interface RpcValidationFailure {
  error: 'invalid-params';
  message: string;
  method: string;
  success: false;
}
export function isRpcValidationFailure(
  value: unknown
): value is RpcValidationFailure {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as RpcValidationFailure).error === 'invalid-params' &&
      (value as RpcValidationFailure).success === false
  );
}
