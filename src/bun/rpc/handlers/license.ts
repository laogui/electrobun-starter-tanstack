import {
  activateLicense as activateLicenseKey,
  checkLicenseStatus,
} from '../../license';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createLicenseHandlers(
  _ctx: RpcContext
): RpcRequestHandlers<'checkLicense' | 'activateLicense'> {
  return {
    checkLicense: async () => await checkLicenseStatus(),

    activateLicense: async (params: { key: string }) =>
      await activateLicenseKey(params.key),
  };
}
