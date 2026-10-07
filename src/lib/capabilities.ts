/** Build-time capability. Plain Node tooling and normal development retain DWG research. */
declare const __DWG_ENABLED__: boolean;
export const DWG_ENABLED = typeof __DWG_ENABLED__ === 'undefined' ? true : __DWG_ENABLED__;
