/**
 * Centralized typed error hierarchy for Voxen.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(message = 'İnternet bağlantısı kurulamadı. Lütfen ağınızı kontrol edin.', originalError?: unknown) {
    super(message, 'NETWORK_ERROR', originalError);
    this.name = 'NetworkError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, code?: string, originalError?: unknown) {
    super(message, code || 'AUTH_ERROR', originalError);
    this.name = 'AuthError';
  }
}

export class PlaybackError extends AppError {
  constructor(message = 'Şarkı oynatılamadı. Sonraki şarkıya geçiliyor.', originalError?: unknown) {
    super(message, 'PLAYBACK_ERROR', originalError);
    this.name = 'PlaybackError';
  }
}

export class SyncError extends AppError {
  constructor(message = 'Bulut senkronizasyonu sırasında bir hata oluştu.', originalError?: unknown) {
    super(message, 'SYNC_ERROR', originalError);
    this.name = 'SyncError';
  }
}

export class MusicProviderError extends AppError {
  constructor(message = 'Müzik kaynağına ulaşılamadı. Alternatif kaynak deneniyor.', originalError?: unknown) {
    super(message, 'PROVIDER_ERROR', originalError);
    this.name = 'MusicProviderError';
  }
}

/**
 * Returns a human-friendly error message for any thrown object or error.
 */
export function getUserFriendlyErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    return err.message;
  }
  if (err instanceof Error) {
    if (err.message.includes('Network') || err.message.includes('fetch')) {
      return 'İnternet bağlantısı kesildi. Lütfen ağınızı kontrol edin.';
    }
    return err.message;
  }
  return 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
}
