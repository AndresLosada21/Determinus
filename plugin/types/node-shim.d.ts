declare const process: any;
declare namespace NodeJS { interface ProcessEnv { [key: string]: string | undefined } }
declare module "node:fs" { export const promises: any }
declare module "node:path" { const path: any; export default path }
declare module "node:child_process" { export const spawn: any }
declare module "node:crypto" { const crypto: any; export default crypto }
declare module "node:url" { export const fileURLToPath: any }
