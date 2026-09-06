import type { CaspulseApi } from '../shared/types';

declare global {
  interface Window {
    caspulse: CaspulseApi;
  }
}

export {};
