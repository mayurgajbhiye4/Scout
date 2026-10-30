/**
 * Opens the app-wide "Log in or sign up" dialog from anywhere, including code outside React such as the API
 * client. `AuthDialog` (mounted once in the root layout) listens for these events.
 */
export const AUTH_DIALOG_EVENT = 'scout:auth-dialog';
export const SESSION_EXPIRED_EVENT = 'scout:session-expired';

export function openAuthDialog() {
  window.dispatchEvent(new Event(AUTH_DIALOG_EVENT));
}

/** A stored token was rejected: the dialog clears the signed-in state and asks the person to log in again. */
export function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
