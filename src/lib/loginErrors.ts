export type LoginErrorCode =
  | 'invalid_credentials'
  | 'wrong_organization'
  | 'rate_limited'
  | 'superadmin_setup_failed';

export class LoginError extends Error {
  readonly code: LoginErrorCode;

  constructor(message: string, code: LoginErrorCode) {
    super(message);
    this.name = 'LoginError';
    this.code = code;
  }
}

export function isLoginError(error: unknown): error is LoginError {
  return error instanceof LoginError;
}
