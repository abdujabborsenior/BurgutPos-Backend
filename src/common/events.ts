/** In-process domain events (EventEmitter2) used to decouple modules. */
export const AppEvent = {
  /** A user's access must be cut: deactivated, password changed, deleted. */
  UserAccessRevoked: 'user.access-revoked',
} as const;

export interface UserAccessRevokedEvent {
  userId: number;
  /** Keep this session alive (e.g. the user changed their own password). */
  exceptSessionId?: string;
}
