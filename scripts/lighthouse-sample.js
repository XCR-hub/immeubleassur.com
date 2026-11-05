export async function runLighthouseSample(run, { retryDelayMs = 250 } = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await run();
      if (result?.lhr?.runtimeError?.code === 'NO_NAVSTART') {
        const error = new Error('NO_NAVSTART: ' + (result.lhr.runtimeError.message || 'Navigation trace unavailable'));
        error.code = 'NO_NAVSTART';
        throw error;
      }
      return { result, attempts: attempt };
    } catch (error) {
      const transient = error?.code === 'NO_NAVSTART' || /\bNO_NAVSTART\b/.test(String(error?.message || ''));
      if (!transient || attempt === 2) throw error;
      if (retryDelayMs > 0) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
}
