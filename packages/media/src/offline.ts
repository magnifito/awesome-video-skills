/**
 * Offline switch: with MGVIDEO_OFFLINE=1 the toolkit refuses every network call (package
 * installs, upstream checks, webhooks, model downloads) while everything on disk keeps working.
 * Python helpers get HF_HUB_OFFLINE=1, so models already in the Hugging Face cache still load.
 */

export function isOffline(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes)$/i.test(env.MGVIDEO_OFFLINE ?? '');
}

/** Throws when offline; `what` names the network use, e.g. "pip install for mgvideo setup transcribe". */
export function assertOnline(what: string, env: NodeJS.ProcessEnv = process.env): void {
  if (isOffline(env)) throw new Error(`MGVIDEO_OFFLINE=1: ${what} needs the network. Unset MGVIDEO_OFFLINE to allow it.`);
}

/** Environment for Python helpers: Hugging Face and pip stay off the network when offline. */
export function helperNetworkEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return isOffline(env) ? { ...env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PIP_NO_INDEX: '1' } : env;
}
