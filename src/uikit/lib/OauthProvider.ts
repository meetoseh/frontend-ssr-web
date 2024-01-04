/**
 * The available oauth providers for identity management. `Dev` is
 * only available in development, and although it doesn't go through
 * the code callback, it functions similarly enough while being very
 * quick for creating accounts for testing
 */
export type OauthProvider = 'SignInWithApple' | 'Google' | 'Direct' | 'Dev';
